import { decryptJSON, encryptJSON } from './crypto'
import { entityKey, type SyncOperation } from './syncProtocol'

export interface EncryptedOperation {
  protocolVersion: 1
  operationId: string
  deviceId: string
  entity: string
  baseRevision: number
  deleted: boolean
  sealed: { ivB64: string; ctB64: string }
}

export async function sealOperation(key: CryptoKey, operation: SyncOperation): Promise<EncryptedOperation> {
  return {
    protocolVersion: 1,
    operationId: operation.operationId,
    deviceId: operation.deviceId,
    entity: operation.entity,
    baseRevision: operation.baseRevision,
    deleted: operation.deleted,
    sealed: await encryptJSON(key, operation),
  }
}

export async function openOperation(key: CryptoKey, wire: EncryptedOperation): Promise<SyncOperation> {
  if (wire.protocolVersion !== 1) throw new Error('不支持的同步协议版本')
  const operation = await decryptJSON<SyncOperation>(key, wire.sealed.ivB64, wire.sealed.ctB64)
  if (operation.operationId !== wire.operationId || operation.deviceId !== wire.deviceId || operation.entity !== wire.entity ||
    operation.baseRevision !== wire.baseRevision || operation.deleted !== wire.deleted || operation.entity !== entityKey(operation.kind, operation.id)) {
    throw new Error('同步记录校验失败')
  }
  return operation
}
