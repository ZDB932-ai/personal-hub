import { expect, it } from 'vitest'
import { applyRecord } from '../syncMerge'
import { attachmentBlobId, describeAttachment } from '../attachmentSync'
import { encryptBytes } from '../crypto'
import { rehearsalPayload } from '../syncRehearsal'

it('远端附件版本变化后不复用旧本机文件；元信息更新保留本机位置', async () => {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const a = await describeAttachment(await encryptBytes(key, new Uint8Array([1]).buffer))
  const b = await describeAttachment(await encryptBytes(key, new Uint8Array([2]).buffer))
  const payload = rehearsalPayload()
  const meta = { id: 'doc', blobId: 'old-local', name: 'a', category: '其他', tags: [], note: '', size: 1, mime: 'text/plain', pinned: false, createdAt: 1, attachment: a }
  payload.docMetas = [meta]
  applyRecord(payload, { entity: '["docMetas","doc"]', revision: 1, deleted: false, value: { ...meta, name: 'renamed' } })
  expect(payload.docMetas[0]!.blobId).toBe('old-local')
  applyRecord(payload, { entity: '["docMetas","doc"]', revision: 2, deleted: false, value: { ...meta, attachment: b } })
  expect(payload.docMetas[0]!.blobId).toBe(attachmentBlobId(b))
})
