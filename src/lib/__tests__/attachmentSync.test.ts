import { expect, it } from 'vitest'
import { encryptBytes, bytesToB64 } from '../crypto'
import { CHUNK_SIZE, uploadAttachment, downloadAttachment } from '../attachmentSync'
import type { RecordSyncTransport } from '../recordSyncWire'

it('上传中断后复用已有分块，下载篡改和锁定会停止', async () => {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const blob = await encryptBytes(key, new Uint8Array(CHUNK_SIZE + 50).buffer)
  const blocks = new Map<string, string>()
  let fail = true, writes = 0
  const api: NonNullable<RecordSyncTransport['attachments']> = {
    async missing(hashes) { return hashes.filter(hash => !blocks.has(hash)) },
    async put(hash, data) { if (blocks.size === 1 && fail) throw new Error('offline'); blocks.set(hash, data); writes++ },
    async get(hash) { return blocks.get(hash)! },
  }
  await expect(uploadAttachment(api, blob, () => {})).rejects.toThrow('offline')
  fail = false
  const descriptor = await uploadAttachment(api, blob, () => {})
  expect(writes).toBe(2)
  await expect(downloadAttachment(api, descriptor, key, CHUNK_SIZE + 50, () => { throw new Error('locked') })).rejects.toThrow('locked')
  blocks.set(descriptor.chunks[0]!, bytesToB64(new Uint8Array(CHUNK_SIZE)))
  await expect(downloadAttachment(api, descriptor, key, CHUNK_SIZE + 50, () => {})).rejects.toThrow('完整性')
})

it('密文摘要正确但 GCM 密钥不一致时拒绝文件', async () => {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const wrong = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const blob = await encryptBytes(key, new Uint8Array(0).buffer)
  const blocks = new Map<string, string>()
  const api = { async missing(hashes: string[]) { return hashes }, async put(hash: string, data: string) { blocks.set(hash, data) }, async get(hash: string) { return blocks.get(hash)! } }
  const descriptor = await uploadAttachment(api, blob, () => {})
  await expect(downloadAttachment(api, descriptor, wrong, 0, () => {})).rejects.toThrow()
})
