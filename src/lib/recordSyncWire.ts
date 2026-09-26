import { decryptJSON, encryptJSON } from './crypto'
import { canonicalJSON, entityKey, type SyncOperation, type SyncRecord } from './syncProtocol'

export interface SyncSpace { vaultId: string; keyId: string }

export interface ScopedOperation extends SyncSpace {
  protocolVersion: 2
  operationId: string
  deviceId: string
  entity: string
  baseRevision: number
  deleted: boolean
  sealed: { ivB64: string; ctB64: string }
}

export interface EncryptedRecord { revision: number; wire: ScopedOperation }
export type RecordReceipt = { operationId: string } & (
  { status: 'accepted'; record: EncryptedRecord } |
  { status: 'conflict'; record: EncryptedRecord | null }
)
export interface ChangePage { cursor: number; hasMore: boolean; records: EncryptedRecord[] }

export interface RecordSyncTransport {
  serverId: string
  attachments?: {
    missing(hashes: string[]): Promise<string[]>
    put(hash: string, data: string): Promise<void>
    get(hash: string): Promise<string>
  }
  push(space: SyncSpace, wire: ScopedOperation): Promise<RecordReceipt>
  pull(space: SyncSpace, cursor: number): Promise<ChangePage>
}

export function scopeKey(serverId: string, space: SyncSpace): string {
  return JSON.stringify([serverId, space.vaultId, space.keyId])
}

export async function sealScopedOperation(key: CryptoKey, space: SyncSpace, operation: SyncOperation): Promise<ScopedOperation> {
  const identity = { vaultId: space.vaultId, keyId: space.keyId }
  return {
    protocolVersion: 2, ...identity, operationId: operation.operationId, deviceId: operation.deviceId,
    entity: operation.entity, baseRevision: operation.baseRevision, deleted: operation.deleted,
    sealed: await encryptJSON(key, { ...identity, operation }),
  }
}

export async function openScopedOperation(key: CryptoKey, space: SyncSpace, wire: ScopedOperation): Promise<SyncOperation> {
  if (wire.protocolVersion !== 2 || wire.vaultId !== space.vaultId || wire.keyId !== space.keyId) throw new Error('同步数据空间不匹配')
  const content = await decryptJSON<SyncSpace & { operation: SyncOperation }>(key, wire.sealed.ivB64, wire.sealed.ctB64)
  const operation = content.operation
  if (content.vaultId !== space.vaultId || content.keyId !== space.keyId || !operation ||
    operation.operationId !== wire.operationId || operation.deviceId !== wire.deviceId || operation.entity !== wire.entity ||
    operation.baseRevision !== wire.baseRevision || operation.deleted !== wire.deleted ||
    operation.entity !== entityKey(operation.kind, operation.id) || !operation.operationId || !operation.deviceId ||
    !Number.isSafeInteger(operation.baseRevision) || operation.baseRevision < 0) throw new Error('同步密文与记录头不一致')
  return operation
}

export async function openRecord(key: CryptoKey, space: SyncSpace, record: EncryptedRecord): Promise<SyncRecord> {
  const operation = await openScopedOperation(key, space, record.wire)
  if (!Number.isSafeInteger(record.revision) || record.revision < 1 || record.revision !== operation.baseRevision + 1) throw new Error('同步记录版本无效')
  return { entity: operation.entity, revision: record.revision, deleted: operation.deleted, value: operation.deleted ? null : operation.value }
}

export function sameOperation(a: SyncOperation, b: SyncOperation): boolean {
  return canonicalJSON(a) === canonicalJSON(b)
}
