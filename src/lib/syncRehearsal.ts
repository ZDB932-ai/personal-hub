import type { VaultPayload } from '@/types'
import { decryptJSON, encryptJSON } from './crypto'
import { reconcileJournal } from './offlineJournal'
import { RecordSyncEngine, type SyncStorage } from './recordSyncEngine'
import { canonicalJSON } from './syncProtocol'
import { resolveConflict } from './syncMerge'
import { scopeKey, type ChangePage, type EncryptedRecord, type RecordReceipt, type RecordSyncTransport, type ScopedOperation, type SyncSpace } from './recordSyncWire'

export class RehearsalServer implements RecordSyncTransport {
  readonly serverId = 'isolated-rehearsal'
  private spaces = new Map<string, { records: Map<string, EncryptedRecord>; receipts: Map<string, { request: string; result: RecordReceipt }>; changes: EncryptedRecord[] }>()

  constructor(private pageSize = 2) {}

  private state(space: SyncSpace) {
    const key = scopeKey(this.serverId, space)
    let state = this.spaces.get(key)
    if (!state) {
      state = { records: new Map(), receipts: new Map(), changes: [] }
      this.spaces.set(key, state)
    }
    return state
  }

  async push(space: SyncSpace, wire: ScopedOperation): Promise<RecordReceipt> {
    if (wire.vaultId !== space.vaultId || wire.keyId !== space.keyId || wire.protocolVersion !== 2 ||
      !Number.isSafeInteger(wire.baseRevision) || wire.baseRevision < 0 || !wire.operationId || !wire.deviceId) throw new Error('无效演练请求')
    const state = this.state(space)
    const id = JSON.stringify([wire.deviceId, wire.operationId])
    const request = canonicalJSON(wire)
    const previous = state.receipts.get(id)
    if (previous) {
      if (previous.request !== request) throw new Error('同一个操作标识携带了不同密文')
      return structuredClone(previous.result)
    }
    const current = state.records.get(wire.entity)
    let result: RecordReceipt
    if ((current?.revision ?? 0) !== wire.baseRevision) result = { status: 'conflict', operationId: wire.operationId, record: current ?? null }
    else {
      const record = { revision: wire.baseRevision + 1, wire: structuredClone(wire) }
      state.records.set(wire.entity, record)
      state.changes.push(record)
      result = { status: 'accepted', operationId: wire.operationId, record }
    }
    state.receipts.set(id, { request, result: structuredClone(result) })
    return structuredClone(result)
  }

  async pull(space: SyncSpace, cursor: number): Promise<ChangePage> {
    const state = this.state(space)
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > state.changes.length) throw new Error('演练游标无效')
    const end = Math.min(cursor + this.pageSize, state.changes.length)
    return { cursor: end, hasMore: end < state.changes.length, records: structuredClone(state.changes.slice(cursor, end)) }
  }
}

export interface RehearsalDisk { sealed?: { ivB64: string; ctB64: string } }

export class RehearsalStorage implements SyncStorage {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(readonly disk: RehearsalDisk, private key: CryptoKey, private deviceId: string) {}

  async initialize(payload: VaultPayload): Promise<void> {
    if (this.disk.sealed) return
    this.disk.sealed = await encryptJSON(this.key, { ...payload, offlineJournal: reconcileJournal(payload, undefined, this.deviceId) })
  }

  async read(): Promise<VaultPayload> {
    if (!this.disk.sealed) throw new Error('演练设备尚未初始化')
    return decryptJSON(this.key, this.disk.sealed.ivB64, this.disk.sealed.ctB64)
  }

  update(transform: (payload: VaultPayload) => void): Promise<void> {
    const saving = this.queue.then(async () => {
      const payload = await this.read()
      transform(payload)
      payload.offlineJournal = reconcileJournal(payload, payload.offlineJournal, this.deviceId)
      this.disk.sealed = await encryptJSON(this.key, payload)
    })
    this.queue = saving.catch(() => {})
    return saving
  }
}

export function rehearsalPayload(): VaultPayload {
  return { profile: { name: '演练用户', nickname: '', bio: '', email: '', phone: '', birthday: '', location: '', github: '', blog: '' }, entries: [], memos: [] }
}

export async function runSyncRehearsal(): Promise<string[]> {
  const reports: string[] = []
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const space = { vaultId: crypto.randomUUID(), keyId: crypto.randomUUID() }
  const server = new RehearsalServer()
  const disks: RehearsalDisk[] = [{}, {}, {}]
  const stores = disks.map((disk, index) => new RehearsalStorage(disk, key, `demo-${index}`))
  const engines = stores.map(store => new RecordSyncEngine(store, server, space, key))
  const check = (passed: boolean, message: string) => { if (!passed) throw new Error(`演练未通过：${message}`); reports.push(message) }
  for (const [index, store] of stores.entries()) {
    await store.initialize(rehearsalPayload())
    await engines[index].run()
  }
  for (const [index, store] of stores.entries()) {
    await store.update(payload => payload.memos!.push({ id: `memo-${index}`, title: `设备 ${index + 1}`, content: '演练便签', color: 'yellow', pinned: false, createdAt: 1, updatedAt: 1 }))
    await engines[index].run()
  }
  for (const engine of engines) await engine.run()
  check((await Promise.all(stores.map(store => store.read()))).every(payload => payload.memos?.length === 3), '三台设备的独立修改全部保留')
  await stores[0].update(payload => { payload.memos!.find(item => item.id === 'memo-0')!.title = '本机版本' })
  await stores[1].update(payload => { payload.memos!.find(item => item.id === 'memo-0')!.title = '另一设备版本' })
  await engines[0].run()
  await engines[1].run()
  const conflicted = await stores[1].read()
  check(conflicted.offlineJournal!.conflicts.length === 1, '同一记录的两个版本均保留为冲突')
  await stores[1].update(payload => {
    const conflict = payload.offlineJournal!.conflicts[0]
    const local = payload.offlineJournal!.pending.find(item => item.entity === conflict.remote.entity)!
    resolveConflict(payload, conflict.remote.entity, conflict.remote.revision, local.operationId, 'remote')
  })
  check((await stores[1].read()).offlineJournal!.conflicts.length === 0, '选择远端版本后冲突按事务清除')
  let lost = true
  const unreliable: RecordSyncTransport = {
    serverId: server.serverId,
    pull: server.pull.bind(server),
    async push(scope, wire) {
      const result = await server.push(scope, wire)
      if (lost) { lost = false; throw new Error('模拟回执丢失') }
      return result
    },
  }
  await stores[2].update(payload => { payload.memos!.find(item => item.id === 'memo-2')!.title = '断网前的修改' })
  await new RecordSyncEngine(stores[2], unreliable, space, key).run()
  check(Boolean((await stores[2].read()).offlineJournal!.sync!.inFlight), '丢失回执后完整发送请求仍在加密快照中')
  const restarted = new RehearsalStorage(disks[2], key, 'demo-2')
  await new RecordSyncEngine(restarted, server, space, key).run(true)
  check(!(await restarted.read()).offlineJournal!.sync!.inFlight, '重建客户端后幂等重试并确认原请求')
  await stores[0].update(payload => { payload.memos = payload.memos!.filter(item => item.id !== 'memo-1') })
  await engines[0].run()
  await engines[1].run()
  check(!(await stores[1].read()).memos!.some(item => item.id === 'memo-1'), '删除记录传播到其他设备')
  return reports
}
