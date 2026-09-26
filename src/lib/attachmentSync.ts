import type { DocMeta } from '@/types'
import type { StoredBlob } from './docdb'
import type { RecordSyncTransport } from './recordSyncWire'
import { b64ToBytes, bytesToB64, decryptBytes } from './crypto'
import { readDownloadChunk, cacheDownloadChunk, clearDownloadChunks } from './downloadCache'

export const CHUNK_SIZE = 1024 * 1024
export const MAX_ATTACHMENT = 50 * CHUNK_SIZE
export type Attachment = NonNullable<DocMeta['attachment']>

export async function chunkHash(data: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function validateAttachment(value: Attachment): void {
  if (value.version !== 1 || !/^[A-Za-z0-9+/]{16}$/.test(value.ivB64) || !Number.isSafeInteger(value.bytes) ||
    value.bytes < 16 || value.bytes > MAX_ATTACHMENT + 16 || !Array.isArray(value.chunks) ||
    value.chunks.length !== Math.ceil(value.bytes / CHUNK_SIZE) || !value.chunks.every(hash => /^[a-f0-9]{64}$/.test(hash))) throw new Error('附件同步描述无效')
}

export async function describeAttachment(blob: StoredBlob): Promise<Attachment> {
  const chunks: string[] = []
  for (let offset = 0; offset < blob.ct.byteLength; offset += CHUNK_SIZE) chunks.push(await chunkHash(blob.ct.slice(offset, offset + CHUNK_SIZE)))
  const value: Attachment = { version: 1, ivB64: blob.ivB64, bytes: blob.ct.byteLength, chunks }
  validateAttachment(value)
  return value
}

export function attachmentBlobId(value: Attachment): string {
  return `cloud-${value.chunks.join('-')}`
}

export async function uploadAttachment(api: NonNullable<RecordSyncTransport['attachments']>, blob: StoredBlob, check: () => void): Promise<Attachment> {
  const value = await describeAttachment(blob); check()
  const missing = await api.missing(value.chunks); check()
  if (!Array.isArray(missing) || missing.some(hash => !value.chunks.includes(hash))) throw new Error('附件分块回执无效')
  for (let i = 0; i < value.chunks.length; i++) {
    if (!missing.includes(value.chunks[i]!)) continue
    check()
    await api.put(value.chunks[i]!, bytesToB64(new Uint8Array(blob.ct.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE))))
    check()
  }
  return value
}

export async function downloadAttachment(api: NonNullable<RecordSyncTransport['attachments']>, value: Attachment, key: CryptoKey, size: number, check: () => void): Promise<StoredBlob> {
  validateAttachment(value)
  if (value.bytes !== size + 16) throw new Error('附件大小不一致')
  const combined = new Uint8Array(value.bytes)
  for (let i = 0; i < value.chunks.length; i++) {
    check()
    const hash = value.chunks[i]!
    const cached = await readDownloadChunk(hash); check()
    const reusable = cached && cached.byteLength === Math.min(CHUNK_SIZE, value.bytes - i * CHUNK_SIZE) && await chunkHash(cached) === hash
    const data = reusable ? new Uint8Array(cached) : b64ToBytes(await api.get(hash)); check()
    if (data.byteLength !== Math.min(CHUNK_SIZE, value.bytes - i * CHUNK_SIZE) || await chunkHash(data.slice().buffer as ArrayBuffer) !== value.chunks[i]) throw new Error('附件分块完整性校验失败')
    if (!reusable) await cacheDownloadChunk(hash, data.slice().buffer as ArrayBuffer)
    check()
    combined.set(data, i * CHUNK_SIZE)
  }
  await decryptBytes(key, value.ivB64, combined.buffer); check()
  await clearDownloadChunks(value.chunks)
  return { ivB64: value.ivB64, ct: combined.buffer }
}
