import { canonicalJSON, entityKey, type PushResult, type SyncOperation, type SyncRecord } from '@/lib/syncProtocol'

export class MemorySyncServer {
  private records = new Map<string, SyncRecord>()
  private receipts = new Map<string, { request: string; result: PushResult }>()
  private changes: SyncRecord[] = []

  async push(operation: SyncOperation): Promise<PushResult> {
    if (operation.entity !== entityKey(operation.kind, operation.id) || !operation.operationId || !operation.deviceId || !Number.isInteger(operation.baseRevision) || operation.baseRevision < 0) {
      throw new Error('无效同步操作')
    }
    const key = JSON.stringify([operation.deviceId, operation.operationId])
    const request = canonicalJSON(operation)
    const receipt = this.receipts.get(key)
    if (receipt) {
      if (receipt.request !== request) throw new Error('操作标识被重复用于不同内容')
      return structuredClone(receipt.result)
    }
    const current = this.records.get(operation.entity)
    const revision = current?.revision ?? 0
    if (revision !== operation.baseRevision) {
      const result: PushResult = { status: 'conflict', operationId: operation.operationId, record: structuredClone(current ?? { entity: operation.entity, revision: 0, deleted: true, value: null }) }
      this.receipts.set(key, { request, result })
      return structuredClone(result)
    }
    const record: SyncRecord = { entity: operation.entity, revision: revision + 1, deleted: operation.deleted, value: operation.deleted ? null : structuredClone(operation.value) }
    this.records.set(operation.entity, record)
    this.changes.push(structuredClone(record))
    const result: PushResult = { status: 'accepted', operationId: operation.operationId, record }
    this.receipts.set(key, { request, result })
    return structuredClone(result)
  }

  async pull(cursor: number): Promise<{ cursor: number; records: SyncRecord[] }> {
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > this.changes.length) throw new Error('同步游标无效')
    return { cursor: this.changes.length, records: structuredClone(this.changes.slice(cursor)) }
  }
}
