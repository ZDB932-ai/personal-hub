import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

beforeEach(() => {
  vi.resetModules(); vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('localStorage', { getItem: () => null, removeItem: vi.fn() })
})
afterEach(() => vi.unstubAllGlobals())

it('地址和令牌仅以密文持久化，重载可解密，重置会删除', async () => {
  const repo = await import('../vaultRepository')
  await repo.initializeVaultRepository()
  const store = await import('../recordSyncCredentials')
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const credentials = { version: 1 as const, url: 'https://secret.example.com', token: 'x'.repeat(43), vaultId: 'v', keyId: 'k', serverId: 's' }
  await store.saveRecordCredentials(key, credentials, () => true)
  const raw = JSON.stringify(await repo.vaultRepository.load())
  expect(raw).not.toContain(credentials.token); expect(raw).not.toContain(credentials.url)
  await repo.initializeVaultRepository()
  expect(await store.loadRecordCredentials(key)).toEqual(credentials)
  await expect(store.saveRecordCredentials(key, credentials, () => false)).rejects.toThrow()
  await repo.resetVaultRepository()
  expect(await store.loadRecordCredentials(key)).toBeNull()
})
