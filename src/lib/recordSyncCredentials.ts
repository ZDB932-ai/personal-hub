import { decryptJSON, encryptJSON } from './crypto'
import { commitRepository, readRepository } from './vaultRepository'
import { syncServerUrl } from './recordSyncHttp'

const storageKey = 'xk.record-sync.secure'
export interface RecordCredentials { version: 1; url: string; token: string; vaultId: string; keyId: string; serverId: string }

export async function saveRecordCredentials(key: CryptoKey, credentials: RecordCredentials, guard: () => boolean): Promise<void> {
  const sealed = await encryptJSON(key, credentials)
  await commitRepository({ [storageKey]: sealed }, guard)
}

export async function loadRecordCredentials(key: CryptoKey): Promise<RecordCredentials | null> {
  const sealed = readRepository<{ ivB64: string; ctB64: string }>(storageKey)
  if (!sealed) return null
  const value = await decryptJSON<RecordCredentials>(key, sealed.ivB64, sealed.ctB64)
  if (value.version !== 1 || !value.vaultId || !value.keyId || !value.serverId ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(value.token) || syncServerUrl(value.url) !== value.url) throw new Error('保存的同步配置无效，请移除后重新连接')
  return value
}

export function forgetRecordCredentials(guard: () => boolean): Promise<void> {
  return commitRepository({ [storageKey]: undefined }, guard)
}
