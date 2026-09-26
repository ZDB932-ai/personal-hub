import { ref, watch } from 'vue'
import type { DocMeta } from '@/types'
import { getActiveKey } from './keyring'
import { openDocBuffer, docMetas } from '@/stores/docs'

export const documentText = ref<Record<string, { text: string; signature: string }>>({})
export const textProgress = ref('')
let generation = 0
const identity = (meta: DocMeta) => JSON.stringify([meta.blobId ?? meta.id, meta.attachment, meta.size])
export function indexedText(meta: DocMeta): string {
  const item = documentText.value[meta.id]
  return item?.signature === identity(meta) ? item.text : ''
}

export function cancelTextExtraction(): void { generation++; textProgress.value = '' }

watch(getActiveKey, () => { cancelTextExtraction(); documentText.value = {} }, { flush: 'sync' })

export async function extractDocumentText(meta: DocMeta): Promise<void> {
  if (textProgress.value) throw new Error('请等待当前文本提取完成，或先取消')
  if (meta.size > 10 * 1024 * 1024) throw new Error('正文提取暂支持 10 MiB 以内文件')
  const extension = meta.name.split('.').pop()?.toLowerCase()
  const isText = meta.mime.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'log', 'xml'].includes(extension ?? '')
  if (!isText && extension !== 'pdf') throw new Error('暂支持文本文件和含文字的 PDF；扫描件需要 OCR')
  const key = getActiveKey()
  if (!key) throw new Error('请先解锁')
  const epoch = ++generation, signature = identity(meta)
  const check = () => { if (epoch !== generation || key !== getActiveKey() || !docMetas.value.includes(meta) || signature !== identity(meta)) throw new Error('提取已取消或文件已变化') }
  textProgress.value = `正在提取：${meta.name}`
  try {
    const buffer = await openDocBuffer(meta); check()
    let text = ''
    if (isText) text = new TextDecoder().decode(buffer).slice(0, 100000)
    else {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
      check()
      const loading = pdfjs.getDocument({ data: new Uint8Array(buffer) })
      const unwatch = watch(getActiveKey, () => { void loading.destroy() }, { flush: 'sync' })
      try {
        const pdf = await loading.promise
        check()
        for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 200) && text.length < 100000; pageNumber++) {
          check()
          textProgress.value = `正在提取：${meta.name} · 第 ${pageNumber} 页`
          const page = await pdf.getPage(pageNumber)
          const content = await page.getTextContent()
          text += `\n第 ${pageNumber} 页\n` + content.items.map(item => 'str' in item ? item.str : '').join(' ')
          page.cleanup()
        }
      } finally { unwatch(); await loading.destroy() }
    }
    check()
    documentText.value = { ...documentText.value, [meta.id]: { text: text.slice(0, 100000), signature } }
  } finally { if (epoch === generation) textProgress.value = '' }
}
