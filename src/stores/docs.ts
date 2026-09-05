import { ref } from 'vue'
import type { DocMeta } from '@/types'
import { encryptBytes, decryptBytes } from '@/lib/crypto'
import { getActiveKey } from '@/lib/keyring'
import { deleteBlob, getBlob, putBlob } from '@/lib/docdb'
import { uid } from '@/lib/utils'

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
  const id = uid()
  await putBlob(id, { ivB64, ct })
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

export async function openDocBuffer(meta: DocMeta): Promise<ArrayBuffer> {
  const key = getActiveKey()
  if (!key) throw new Error('数据已锁定')
  const rec = await getBlob(meta.id)
  if (!rec) throw new Error('文件数据在本设备不存在')
  return decryptBytes(key, rec.ivB64, rec.ct)
}

export async function openDocObjectUrl(meta: DocMeta): Promise<string> {
  const pt = await openDocBuffer(meta)
  const blob = new Blob([pt], { type: meta.mime })
  return URL.createObjectURL(blob)
}

export async function downloadDoc(meta: DocMeta): Promise<void> {
  const url = await openDocObjectUrl(meta)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = meta.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}

export async function removeDoc(id: string): Promise<void> {
  await deleteBlob(id).catch(() => {})
  const i = docMetas.value.findIndex((d) => d.id === id)
  if (i >= 0) docMetas.value.splice(i, 1)
}

export function updateDocMeta(id: string, patch: Partial<DocMeta>): void {
  const d = docMetas.value.find((x) => x.id === id)
  if (d) Object.assign(d, patch)
}
