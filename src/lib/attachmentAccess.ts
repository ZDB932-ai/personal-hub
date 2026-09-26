import { ref } from 'vue'
import type { DocMeta } from '@/types'

export const attachmentDownloadMode = ref<'always' | 'on-demand'>(typeof localStorage !== 'undefined' && localStorage.getItem('xk.attachments.download') === 'on-demand' ? 'on-demand' : 'always')
let download: ((meta: DocMeta) => Promise<void>) | undefined

export function setAttachmentDownloadMode(value: 'always' | 'on-demand'): void {
  localStorage.setItem('xk.attachments.download', value)
  attachmentDownloadMode.value = value
}

export function bindAttachmentDownload(handler?: (meta: DocMeta) => Promise<void>): void {
  download = handler
}

export async function ensureAttachmentDownloaded(meta: DocMeta): Promise<void> {
  if (!download) throw new Error('附件不在本机，请先连接同步服务再打开')
  await download(meta)
}
