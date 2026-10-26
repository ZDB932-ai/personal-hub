import type { VaultPayload } from '@/types'
import { applyPushResult } from './offlineJournal'
import { journalOf, mergeRemote } from './syncMerge'
import { openRecord, openScopedOperation, sameOperation, scopeKey, sealScopedOperation, type RecordReceipt, type RecordSyncTransport, type SyncSpace } from './recordSyncWire'
import type { SyncRecord } from './syncProtocol'

export interface SyncStorage {
  read(): Promise<VaultPayload>
  update(transform: (payload: VaultPayload) => void): Promise<void>
}

export interface SyncRunResult {
  status: 'complete' | 'pending' | 'retry'
  pending: number
  conflicts: number
  retryAt: number
}

const runs = new WeakMap<SyncStorage, Promise<SyncRunResult>>()

export class RecordSyncEngine {
  constructor(
    private storage: SyncStorage,
    private transport: RecordSyncTransport,
    private space: SyncSpace,
    private key: CryptoKey,
    private now = Date.now,
    private active = () => true,
  ) {}

  run(force = false): Promise<SyncRunResult> {
    const existing = runs.get(this.storage)
    if (existing) return existing
    const running = this.perform(force).finally(() => { runs.delete(this.storage) })
    runs.set(this.storage, running)
    return running
  }

  private check(): void {
    if (!this.active()) throw new Error('保险库已锁定或密钥状态已变化，同步已暂停')
  }

  private async update(transform: (payload: VaultPayload) => void): Promise<void> {
    this.check()
    await this.storage.update(payload => { this.check(); transform(payload) })
  }

  private async result(status: SyncRunResult['status']): Promise<SyncRunResult> {
    const journal = journalOf(await this.storage.read())
    return { status, pending: journal.pending.length, conflicts: journal.conflicts.length, retryAt: journal.sync?.retryAt ?? 0 }
  }

  private async failed(error: unknown): Promise<SyncRunResult> {
    this.check()
    await this.update(payload => {
      const sync = journalOf(payload).sync!
      sync.failures = Math.min(sync.failures + 1, 16)
      sync.retryAt = this.now() + Math.min(60000, 1000 * 2 ** (sync.failures - 1))
      sync.lastError = error instanceof Error ? error.message : '同步连接中断'
    })
    return this.result('retry')
  }

  private async acknowledge(receipt: RecordReceipt): Promise<void> {
    const flight = journalOf(await this.storage.read()).sync!.inFlight!
    if (!flight || receipt.operationId !== flight.operation.operationId) throw new Error('同步回执标识不匹配')
    let record: SyncRecord
    if (receipt.status === 'accepted') {
      const echoed = await openScopedOperation(this.key, this.space, receipt.record.wire)
      if (!sameOperation(echoed, flight.operation)) throw new Error('同步回执改变了请求内容')
      record = await openRecord(this.key, this.space, receipt.record)
    } else if (receipt.status === 'conflict') {
      if (!receipt.record) throw new Error('服务端同步历史已缺失，请恢复服务端备份后重试')
      record = await openRecord(this.key, this.space, receipt.record)
    } else throw new Error('同步回执类型无效')
    if (record.entity !== flight.operation.entity) throw new Error('同步回执实体不匹配')
    await this.update(payload => {
      const journal = journalOf(payload)
      if (journal.sync!.inFlight?.operation.operationId !== flight.operation.operationId) throw new Error('在途请求状态已变化')
      if (receipt.status === 'accepted') payload.offlineJournal = applyPushResult(journal, flight.operation, { status: 'accepted', operationId: receipt.operationId, record })
      else mergeRemote(payload, record)
      const sync = journalOf(payload).sync!
      delete sync.inFlight
      sync.failures = 0
      sync.retryAt = 0
      sync.lastError = ''
    })
  }

  private async sendFlight(): Promise<SyncRunResult | null> {
    const flight = journalOf(await this.storage.read()).sync!.inFlight
    if (!flight) return null
    this.check()
    let receipt: RecordReceipt
    try { receipt = await this.transport.push(this.space, structuredClone(flight.wire)) }
    catch (error) { return this.failed(error) }
    this.check()
    await this.acknowledge(receipt)
    return null
  }

  private async pull(): Promise<SyncRunResult | null> {
    for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
      this.check()
      const cursor = journalOf(await this.storage.read()).sync!.cursor
      let page
      try { page = await this.transport.pull(this.space, cursor) }
      catch (error) { return this.failed(error) }
      this.check()
      if (!Number.isSafeInteger(page.cursor) || page.cursor < cursor || typeof page.hasMore !== 'boolean' ||
        !Array.isArray(page.records) || page.records.length > 500 ||
        page.cursor !== cursor + page.records.length || (page.hasMore && !page.records.length)) throw new Error('同步分页游标无效')
      const records = await Promise.all(page.records.map(record => openRecord(this.key, this.space, record)))
      if (page.cursor !== cursor || records.length) {
        await this.update(payload => {
          const sync = journalOf(payload).sync!
          if (sync.cursor !== cursor || sync.inFlight) throw new Error('拉取状态已变化')
          for (const record of records) mergeRemote(payload, record)
          sync.cursor = page.cursor
          sync.failures = 0
          sync.retryAt = 0
          sync.lastError = ''
        })
      }
      if (!page.hasMore) return null
    }
    return this.result('pending')
  }

  private async perform(force: boolean): Promise<SyncRunResult> {
    this.check()
    const scope = scopeKey(this.transport.serverId, this.space)
    if (!this.transport.serverId || !this.space.vaultId || !this.space.keyId) throw new Error('缺少同步数据空间标识')
    const initial = journalOf(await this.storage.read())
    if (!initial.sync) await this.update(payload => {
      journalOf(payload).sync ??= { scope, cursor: 0, failures: 0, retryAt: 0, lastError: '' }
    })
    const sync = journalOf(await this.storage.read()).sync!
    if (sync.scope !== scope) throw new Error('同步服务或保险库已变化，不能复用旧游标与版本')
    if (!force && sync.retryAt > this.now()) return this.result('retry')
    const retried = await this.sendFlight()
    if (retried) return retried
    const pulled = await this.pull()
    if (pulled) return pulled
    for (let sent = 0; sent < 100; sent++) {
      this.check()
      const journal = journalOf(await this.storage.read())
      const operation = journal.pending.find(item => !journal.conflicts.some(conflict => conflict.remote.entity === item.entity))
      if (!operation) {
        const lastPull = await this.pull()
        if (lastPull) return lastPull
        await this.update(payload => {
          const current = journalOf(payload).sync!
          current.failures = 0; current.retryAt = 0; current.lastError = ''
        })
        const final = await this.result('complete')
        if (final.pending || final.conflicts) final.status = 'pending'
        return final
      }
      const sealed = await sealScopedOperation(this.key, this.space, operation)
      const wire = this.transport.prepare ? await this.transport.prepare(sealed) : sealed
      await this.update(payload => {
        const current = journalOf(payload)
        const latest = current.pending.find(item => item.operationId === operation.operationId)
        if (latest && sameOperation(latest, operation) && !current.conflicts.some(item => item.remote.entity === operation.entity)) {
          current.sync!.inFlight = { operation: structuredClone(operation), wire }
        }
      })
      const result = await this.sendFlight()
      if (result) return result
    }
    return this.result('pending')
  }
}
