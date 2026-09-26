import { afterEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const f = vi.hoisted(() => ({ key: null as CryptoKey | null, get: vi.fn(), put: vi.fn(), version: 0, upload: vi.fn(), download: vi.fn(), decrypt: vi.fn() }))
vi.mock('../keyring', () => ({ getActiveKey: () => f.key }))
vi.mock('@/stores/database', () => ({ databaseBusy: ref(false) }))
vi.mock('@/stores/docs', () => ({ docMetas: ref([]) }))
vi.mock('../docdb', () => ({ getBlob: f.get, putBlob: f.put, blobRevision: () => f.version }))
vi.mock('../crypto', () => ({ decryptBytes: f.decrypt }))
vi.mock('../attachmentSync', () => ({ uploadAttachment: f.upload, downloadAttachment: f.download, attachmentBlobId: () => 'cloud' }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

it('空轮询不反复解密已验证附件，文件变化或手动强制后重新校验', async () => {
  vi.resetModules()
  f.key = {} as CryptoKey; f.version = 0
  const { docMetas } = await import('@/stores/docs')
  const descriptor = { version: 1 as const, ivB64: 'iv', bytes: 19, chunks: ['hash'] }
  docMetas.value = [{ id: 'doc', name: 'a.txt', size: 3, mime: 'text/plain', category: '其他', note: '', tags: [], pinned: false, createdAt: 1, attachment: descriptor }]
  f.get.mockResolvedValue({ ivB64: 'iv', ct: new ArrayBuffer(19) })
  f.decrypt.mockResolvedValue(new ArrayBuffer(3))
  f.upload.mockResolvedValue(descriptor)
  const { syncAttachments } = await import('../attachmentSyncStore')
  const transport = { attachments: {} } as any
  await syncAttachments(transport, () => true)
  await syncAttachments(transport, () => true)
  expect(f.decrypt).toHaveBeenCalledTimes(1)
  expect(f.get).toHaveBeenCalledTimes(1)
  f.version++
  await syncAttachments(transport, () => true)
  expect(f.decrypt).toHaveBeenCalledTimes(2)
  await syncAttachments(transport, () => true, true)
  expect(f.decrypt).toHaveBeenCalledTimes(3)
})

it('按需模式跳过缺失文件，主动打开才下载，锁定拒绝', async () => {
  vi.resetModules()
  f.key = {} as CryptoKey
  vi.stubGlobal('localStorage', { getItem: () => 'on-demand' })
  const { docMetas } = await import('@/stores/docs')
  docMetas.value = [{ id: 'doc', name: 'a.txt', size: 3, mime: 'text/plain', category: '其他', note: '', tags: [], pinned: false, createdAt: 1, attachment: { version: 1, ivB64: 'iv', bytes: 19, chunks: ['hash'] } }]
  f.get.mockResolvedValue(undefined)
  f.download.mockResolvedValue({ ivB64: 'iv', ct: new ArrayBuffer(19) })
  const { syncAttachments } = await import('../attachmentSyncStore')
  const transport = { attachments: {} } as any
  await syncAttachments(transport, () => true)
  expect(f.download).not.toHaveBeenCalled()
  await syncAttachments(transport, () => true, false, docMetas.value[0])
  expect(f.download).toHaveBeenCalledTimes(1)
  f.key = null
  await expect(syncAttachments(transport, () => true)).rejects.toThrow('暂停')
})
