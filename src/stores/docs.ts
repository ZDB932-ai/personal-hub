import { ref } from 'vue'
import type { DocMeta } from '@/types'
import { encryptBytes, decryptBytes } from '@/lib/crypto'
import { getActiveKey } from '@/lib/keyring'
import { deleteBlob, getBlob, putBlob } from '@/lib/docdb'
import { uid } from '@/lib/utils'
import { saveFile } from '@/lib/saveFile'
import { ensureAttachmentDownloaded } from '@/lib/attachmentAccess'

export const docMetas = ref<DocMeta[]>([])

export const MAX_DOC_SIZE = 50 * 1024 * 1024

export const DOC_CATEGORIES = ['全部', '证件', '文书合同', '账号凭证', '票据收据', '其他']

export const DOC_CATEGORY_BADGE: Record<string, string> = {
  证件: 'badge badge-amber',
  文书合同: 'badge badge-sky',
  账号凭证: 'badge badge-emerald',
  票据收据: 'badge badge-fuchsia',
  其他: 'badge badge-slate',
}

export async function importDoc(file: File): Promise<DocMeta> {
  if (file.size > MAX_DOC_SIZE) {
    throw new Error(`「${file.name}」超过 50MB 上限`)
  }
  const key = getActiveKey()
  if (!key) throw new Error('数据已锁定，无法写入')
  const buf = await file.arrayBuffer()
  const { ivB64, ct } = await encryptBytes(key, buf)
  if (getActiveKey() !== key) throw new Error('数据已锁定或密钥已变更，请重新上传')
  const id = uid()
  await putBlob(id, { ivB64, ct })
  if (getActiveKey() !== key) {
    await deleteBlob(id)
    throw new Error('数据已锁定或密钥已变更，请重新上传')
  }
  const meta: DocMeta = {
    id,
    name: file.name,
    category: '其他',
    tags: [],
    note: '',
    size: file.size,
    mime: file.type || 'application/octet-stream',
    pinned: false,
    createdAt: Date.now(),
  }
  docMetas.value.push(meta)
  return meta
}

export async function openDocBuffer(meta: DocMeta, allowDownload = true): Promise<ArrayBuffer> {
  const key = getActiveKey()
  if (!key) throw new Error('数据已锁定')
  let rec = await getBlob(meta.blobId ?? meta.id)
  if (!rec && meta.attachment && allowDownload) {
    await ensureAttachmentDownloaded(meta)
    rec = await getBlob(meta.blobId ?? meta.id)
  }
  if (!rec) throw new Error(meta.attachment ? '附件尚未下载完成，请在同步设置中同步后重试' : '文件数据在本设备不存在，请在源设备同步附件')
  const plain = await decryptBytes(key, rec.ivB64, rec.ct)
  if (getActiveKey() !== key) throw new Error('数据已锁定或密钥已变更')
  return plain
}

export async function openDocObjectUrl(meta: DocMeta, allowDownload = true): Promise<string> {
  const pt = await openDocBuffer(meta, allowDownload)
  const blob = new Blob([pt], { type: meta.mime })
  return URL.createObjectURL(blob)
}

export async function downloadDoc(meta: DocMeta): Promise<void> {
  const key = getActiveKey()
  const bytes = await openDocBuffer(meta)
  await saveFile(new Blob([bytes], { type: meta.mime }), meta.name, () => getActiveKey() === key)
}

export async function removeDoc(id: string): Promise<void> {
  const i = docMetas.value.findIndex((d) => d.id === id)
  if (i >= 0) docMetas.value.splice(i, 1)
}

export function updateDocMeta(id: string, patch: Partial<DocMeta>): void {
  const d = docMetas.value.find((x) => x.id === id)
  if (d) Object.assign(d, patch)
}
