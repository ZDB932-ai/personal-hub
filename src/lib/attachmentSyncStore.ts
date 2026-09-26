import { ref } from 'vue'
import { docMetas } from '@/stores/docs'
import { getActiveKey } from './keyring'
import { databaseBusy } from '@/stores/database'
import { blobRevision, getBlob, putBlob } from './docdb'
import { attachmentBlobId, downloadAttachment, uploadAttachment } from './attachmentSync'
import type { RecordSyncTransport } from './recordSyncWire'
import { decryptBytes } from './crypto'
import { attachmentDownloadMode } from './attachmentAccess'
import type { DocMeta } from '@/types'

export const attachmentProgress = ref('')
const verified = new WeakMap<RecordSyncTransport, { key: CryptoKey; items: Map<string, string> }>()
const signature = (meta: DocMeta) => JSON.stringify([meta.blobId ?? meta.id, blobRevision(meta.blobId ?? meta.id), meta.attachment, meta.size])

export async function syncAttachments(transport: RecordSyncTransport, active: () => boolean, force = false, requested?: DocMeta): Promise<void> {
  const api = transport.attachments
  if (!api) { if (docMetas.value.length) throw new Error('服务器版本不支持附件同步，请升级服务端'); return }
  const key = getActiveKey()
  const check = () => { if (!key || getActiveKey() !== key || databaseBusy.value || !active()) throw new Error('附件同步已暂停') }
  check()
  let cache = verified.get(transport)
  if (!cache || cache.key !== key) { cache = { key: key!, items: new Map() }; verified.set(transport, cache) }
  if (force) cache.items.clear()
  try {
    for (const meta of requested ? [requested] : [...docMetas.value]) {
      check()
      if (cache.items.get(meta.id) === signature(meta)) continue
      const present = () => docMetas.value.includes(meta)
      const saved = JSON.stringify(meta.attachment)
      const local = await getBlob(meta.blobId ?? meta.id); check()
      if (!present()) continue
      if (local) {
        attachmentProgress.value = `正在检查或上传：${meta.name}`
        const plain = await decryptBytes(key!, local.ivB64, local.ct); check()
        if (plain.byteLength !== meta.size) throw new Error(`附件「${meta.name}」大小校验失败`)
        const descriptor = await uploadAttachment(api, local, check)
        if (present() && JSON.stringify(meta.attachment) === saved && JSON.stringify(descriptor) !== saved) meta.attachment = descriptor
      } else if (meta.attachment) {
        if (!requested && attachmentDownloadMode.value === 'on-demand') continue
        attachmentProgress.value = `正在下载：${meta.name}`
        const descriptor = JSON.parse(saved!)
        const downloaded = await downloadAttachment(api, descriptor, key!, meta.size, check)
        if (!present() || JSON.stringify(meta.attachment) !== saved) continue
        await putBlob(attachmentBlobId(descriptor), downloaded); check()
        if (present() && JSON.stringify(meta.attachment) === saved) meta.blobId = attachmentBlobId(descriptor)
      } else throw new Error(`附件「${meta.name}」不在本机且源设备尚未上传，请在源设备同步`)
      if (present()) cache.items.set(meta.id, signature(meta))
    }
  } finally { attachmentProgress.value = '' }
}
