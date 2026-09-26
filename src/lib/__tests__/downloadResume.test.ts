import { expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

it('下载中断并重新加载缓存模块后只请求缺块，完整认证后清理暂存', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  try {
    vi.resetModules()
    const { encryptBytes } = await import('../crypto')
    let transfer = await import('../attachmentSync')
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const bytes = new Uint8Array(transfer.CHUNK_SIZE + 5)
    bytes.fill(5)
    const blob = await encryptBytes(key, bytes.buffer)
    const chunks = new Map<string, string>()
    let fail = false
    const get = vi.fn(async (hash: string) => { if (fail && hash === [...chunks.keys()][1]) throw new Error('断网'); return chunks.get(hash)! })
    const api = { missing: async (hashes: string[]) => hashes, put: async (hash: string, value: string) => { chunks.set(hash, value) }, get }
    const descriptor = await transfer.uploadAttachment(api, blob, () => {})
    fail = true
    await expect(transfer.downloadAttachment(api, descriptor, key, bytes.byteLength, () => {})).rejects.toThrow('断网')
    expect(await (await import('../downloadCache')).readDownloadChunk(descriptor.chunks[0]!)).toBeDefined()
    vi.resetModules()
    transfer = await import('../attachmentSync')
    fail = false; get.mockClear()
    const downloaded = await transfer.downloadAttachment(api, descriptor, key, bytes.byteLength, () => {})
    expect(get).toHaveBeenCalledTimes(1)
    expect(new Uint8Array(downloaded.ct)).toEqual(new Uint8Array(blob.ct))
    expect(await (await import('../downloadCache')).readDownloadChunk(descriptor.chunks[0]!)).toBeUndefined()
  } finally { vi.unstubAllGlobals() }
})
