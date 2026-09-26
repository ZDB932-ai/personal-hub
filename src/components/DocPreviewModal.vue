<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from '@lucide/vue'
import { downloadDoc, openDocBuffer, openDocObjectUrl } from '@/stores/docs'
import { toast } from '@/lib/toast'
import type { DocMeta } from '@/types'

const props = defineProps<{
  open: boolean
  meta: DocMeta | null
}>()

const emit = defineEmits<{
  close: []
}>()

type PreviewKind =
  | 'image'
  | 'pdf'
  | 'text'
  | 'audio'
  | 'video'
  | 'docx'
  | 'sheet'
  | 'unknown'

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']
const TEXT_EXTS = [
  'txt', 'md', 'json', 'log', 'xml', 'yaml', 'yml', 'html', 'htm',
  'css', 'js', 'mjs', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp',
  'h', 'sql', 'sh', 'bat', 'ini', 'conf', 'toml', 'vue',
]
const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus']
const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'mkv']

const TEXT_LIMIT = 256 * 1024

const kind = ref<PreviewKind>('unknown')
const loading = ref(false)
const errorMsg = ref('')
const mediaUrl = ref('')
const textContent = ref('')
const textTruncated = ref(false)

const zoom = ref(1)
const rotation = ref(0)
const panX = ref(0)
const panY = ref(0)

const pdfPage = ref(0)
const pdfNumPages = ref(0)
const canvasWrap = ref<HTMLElement | null>(null)
const docxContainer = ref<HTMLElement | null>(null)
const sheetRows = ref<string[][]>([])
const sheetTruncated = ref(false)
const previewPanel = ref<HTMLElement | null>(null)

let pdfjsDoc: any = null
let dragState: { x: number; y: number; px: number; py: number } | null = null

function extOf(meta: DocMeta | null): string {
  if (!meta) return ''
  const parts = meta.name.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

function kindOf(meta: DocMeta | null): PreviewKind {
  const ext = extOf(meta)
  if (IMAGE_EXTS.includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (TEXT_EXTS.includes(ext)) return 'text'
  if (AUDIO_EXTS.includes(ext)) return 'audio'
  if (VIDEO_EXTS.includes(ext)) return 'video'
  if (ext === 'docx') return 'docx'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'sheet'
  return 'unknown'
}

async function loadPdfJs(): Promise<typeof import('pdfjs-dist')> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return pdfjs
}

function resetState(): void {
  kind.value = 'unknown'
  loading.value = false
  errorMsg.value = ''
  if (mediaUrl.value) URL.revokeObjectURL(mediaUrl.value)
  mediaUrl.value = ''
  textContent.value = ''
  textTruncated.value = false
  zoom.value = 1
  rotation.value = 0
  panX.value = 0
  panY.value = 0
  pdfPage.value = 0
  pdfNumPages.value = 0
  sheetRows.value = []
  sheetTruncated.value = false
}

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      if (pdfjsDoc) {
        await pdfjsDoc.destroy().catch(() => {})
        pdfjsDoc = null
      }
      resetState()
      return
    }
    const meta = props.meta
    if (!meta) return
    kind.value = kindOf(meta)
    loading.value = true
    errorMsg.value = ''
    try {
      switch (kind.value) {
        case 'image':
        case 'audio':
        case 'video':
          mediaUrl.value = await openDocObjectUrl(meta)
          break
        case 'text': {
          const buf = await decryptedBuffer(meta)
          let text = new TextDecoder().decode(buf)
          if (text.length > TEXT_LIMIT) {
            text = text.slice(0, TEXT_LIMIT)
            textTruncated.value = true
          }
          textContent.value = text
          break
        }
        case 'sheet': {
          const XLSX = await import('xlsx')
          const buf = await decryptedBuffer(meta)
          const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const all = XLSX.utils.sheet_to_json<string[]>(ws, {
            header: 1,
            raw: false,
            defval: '',
          }) as string[][]
          sheetTruncated.value = all.length > 100 || (all[0]?.length ?? 0) > 30
          sheetRows.value = all.slice(0, 100).map((row) => row.slice(0, 30).map((c) => String(c ?? '')))
          break
        }
        case 'docx': {
          const { renderAsync } = await import('docx-preview')
          const buf = await decryptedBuffer(meta)
          await nextTick()
          if (docxContainer.value) {
            await renderAsync(buf, docxContainer.value, undefined, { inWrapper: false })
          }
          break
        }
        case 'pdf': {
          const pdfjs = await loadPdfJs()
          const buf = await decryptedBuffer(meta)
          pdfjsDoc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
          pdfNumPages.value = pdfjsDoc.numPages
          pdfPage.value = 1
          await nextTick()
          await renderPdfPage()
          break
        }
        default:
          break
      }
    } catch (e) {
      errorMsg.value = e instanceof Error && e.message ? e.message : '文件解密或解析失败'
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener('keydown', onKeydown)
      void nextTick(() => previewPanel.value?.focus())
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

async function decryptedBuffer(meta: DocMeta): Promise<ArrayBuffer> {
  return openDocBuffer(meta)
}

async function renderPdfPage(): Promise<void> {
  if (!pdfjsDoc || !canvasWrap.value) return
  const page = await (pdfjsDoc as any).getPage(pdfPage.value)
  const base = page.getViewport({ scale: 1 })
  const wrapWidth = canvasWrap.value.clientWidth - 32
  const scale = Math.min(2.5, Math.max(0.5, wrapWidth / base.width))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  await page.render({ canvas, viewport }).promise
  canvasWrap.value.replaceChildren(canvas)
}

async function turnPage(delta: number): Promise<void> {
  const target = pdfPage.value + delta
  if (target < 1 || target > pdfNumPages.value) return
  pdfPage.value = target
  loading.value = true
  try {
    await renderPdfPage()
  } finally {
    loading.value = false
  }
}

const unsupportedHint = computed(() => {
  const ext = extOf(props.meta)
  if (ext === 'doc') return '老版 Word(.doc) 是二进制格式，浏览器无法安全解析；建议用 Office/WPS 另存为 .docx 后重新上传'
  if (ext === 'wps') return 'WPS 专有格式暂不支持在线预览，可下载后查看'
  if (['ppt', 'pptx'].includes(ext)) return '演示文稿暂不支持在线预览，可下载后查看'
  if (['zip', 'rar', '7z'].includes(ext)) return '压缩包暂不支持在线预览，可下载后解压查看'
  return '该格式暂不支持在线预览，可下载后查看'
})

const imageTransform = computed(
  () => `translate(${panX.value}px, ${panY.value}px) rotate(${rotation.value}deg) scale(${zoom.value})`,
)

function zoomBy(delta: number): void {
  zoom.value = Math.min(5, Math.max(0.25, +(zoom.value + delta).toFixed(2)))
  if (zoom.value === 1) {
    panX.value = 0
    panY.value = 0
  }
}

function rotateImage(): void {
  rotation.value = (rotation.value + 90) % 360
}

function onWheel(event: WheelEvent): void {
  if (kind.value !== 'image') return
  event.preventDefault()
  zoomBy(event.deltaY < 0 ? 0.2 : -0.2)
}

function onPointerDown(event: PointerEvent): void {
  if (kind.value !== 'image' || zoom.value <= 1) return
  dragState = { x: event.clientX, y: event.clientY, px: panX.value, py: panY.value }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragState) return
  panX.value = dragState.px + (event.clientX - dragState.x)
  panY.value = dragState.py + (event.clientY - dragState.y)
}

function onPointerUp(): void {
  dragState = null
}

async function handleDownload(): Promise<void> {
  if (!props.meta) return
  try {
    await downloadDoc(props.meta)
  } catch (error) {
    toast(error instanceof Error ? error.message : '下载失败', 'error')
  }
}
</script>

<template>
  <Teleport to="body">
      <div v-if="open" class="fixed inset-0 z-[80] flex items-center justify-center p-3 md:p-6">
      <div class="absolute inset-0 bg-black/75" aria-hidden="true" @click="emit('close')"></div>

      <div
        ref="previewPanel"
        role="dialog"
        aria-modal="true"
        :aria-label="meta?.name ? `预览 ${meta.name}` : '资料预览'"
        tabindex="-1"
        class="relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line bg-elevated shadow-2xl shadow-black/50"
      >
        <div class="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
          <p class="min-w-0 truncate text-sm font-medium">{{ meta?.name }}</p>
          <div class="flex shrink-0 items-center gap-1.5">
            <template v-if="kind === 'image' && !loading">
              <button aria-label="缩小预览" class="rounded-lg p-2 text-t3 transition hover:bg-surface hover:text-t1" title="缩小" @click="zoomBy(-0.2)">
                <ZoomOut class="h-4 w-4" />
              </button>
              <span class="min-w-12 text-center text-xs tabular-nums text-t4">{{ Math.round(zoom * 100) }}%</span>
              <button aria-label="放大预览" class="rounded-lg p-2 text-t3 transition hover:bg-surface hover:text-t1" title="放大" @click="zoomBy(0.2)">
                <ZoomIn class="h-4 w-4" />
              </button>
              <button aria-label="旋转预览" class="rounded-lg p-2 text-t3 transition hover:bg-surface hover:text-t1" title="旋转" @click="rotateImage">
                <RotateCw class="h-4 w-4" />
              </button>
              <span class="mx-1 h-5 w-px bg-surface-2"></span>
            </template>
            <template v-if="kind === 'pdf' && pdfNumPages > 0">
              <button
                aria-label="上一页"
                class="rounded-lg p-2 text-t3 transition hover:bg-surface hover:text-t1 disabled:opacity-30"
                :disabled="pdfPage <= 1"
                @click="turnPage(-1)"
              >
                <ChevronLeft class="h-4 w-4" />
              </button>
              <span class="text-xs tabular-nums text-t4">{{ pdfPage }} / {{ pdfNumPages }}</span>
              <button
                aria-label="下一页"
                class="rounded-lg p-2 text-t3 transition hover:bg-surface hover:text-t1 disabled:opacity-30"
                :disabled="pdfPage >= pdfNumPages"
                @click="turnPage(1)"
              >
                <ChevronRight class="h-4 w-4" />
              </button>
              <span class="mx-1 h-5 w-px bg-surface-2"></span>
            </template>
            <button class="rounded-lg border border-line px-3 py-1.5 text-xs text-t2 transition hover:bg-surface" @click="handleDownload">
              下载
            </button>
            <button aria-label="关闭预览" class="rounded-lg p-2 text-t3 transition hover:bg-surface hover:text-t1" @click="emit('close')">
              <X class="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          class="relative min-h-[40vh] flex-1 overflow-auto bg-body p-4"
          :class="{ 'flex items-center justify-center overflow-hidden': kind === 'image' }"
          @wheel="onWheel"
        >
          <div v-if="errorMsg" class="py-16 text-center">
            <FileText class="mx-auto h-10 w-10 text-t4" />
            <p class="mt-4 text-sm text-t2">{{ errorMsg }}</p>
            <button class="mt-4 rounded-lg border border-primary/40 bg-primary/12 px-4 py-2 text-xs font-medium text-primary transition hover:bg-primary/20" @click="handleDownload">
              改为下载查看
            </button>
          </div>
            <img
              v-if="kind === 'image'"
              :src="mediaUrl"
              :alt="meta?.name"
              class="max-h-[72vh] max-w-full select-none rounded-xl transition-transform duration-100"
              :class="zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''"
              :style="{ transform: imageTransform }"
              draggable="false"
              @pointerdown="onPointerDown"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @pointercancel="onPointerUp"
              @dblclick="zoom = 1; panX = 0; panY = 0; rotation = 0"
            />

            <div v-else-if="kind === 'pdf'" ref="canvasWrap" class="mx-auto w-full max-w-3xl [&>canvas]:rounded-lg"></div>

            <pre
              v-else-if="kind === 'text'"
              class="mx-auto max-w-3xl whitespace-pre-wrap break-all rounded-xl bg-inset p-4 font-mono text-xs leading-relaxed text-t2"
            >{{ textContent }}<span v-if="textTruncated" class="mt-3 block text-warn/70">…内容过长已截断，完整内容请下载查看</span></pre>

            <audio v-else-if="kind === 'audio'" :src="mediaUrl" controls class="w-full max-w-md"></audio>

            <video v-else-if="kind === 'video'" :src="mediaUrl" controls class="max-h-[70vh] w-full rounded-xl bg-black"></video>

            <div v-else-if="kind === 'docx'" ref="docxContainer" class="docx-view mx-auto max-w-3xl rounded-xl bg-white p-6 text-black"></div>

            <div v-else-if="kind === 'sheet'" class="mx-auto max-w-3xl overflow-auto rounded-xl border border-line">
              <table class="w-full border-collapse text-xs">
                <tbody>
                  <tr v-for="(row, ri) in sheetRows" :key="ri" :class="ri === 0 ? 'bg-primary/12' : ''">
                    <td
                      v-for="(cell, ci) in row"
                      :key="ci"
                      class="border border-line px-2.5 py-1.5 whitespace-nowrap text-t2"
                      :class="ri === 0 ? 'font-semibold text-primary' : ''"
                    >
                      {{ cell }}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-if="sheetTruncated" class="px-3 py-2 text-center text-[11px] text-warn/70">仅显示前 100 行 × 30 列，完整内容请下载</p>
            </div>

            <div v-else class="py-16 text-center">
              <FileText class="mx-auto h-10 w-10 text-t4" />
              <p class="mt-4 text-sm text-t2">{{ unsupportedHint }}</p>
              <button class="mt-4 rounded-lg border border-primary/40 bg-primary/12 px-4 py-2 text-xs font-medium text-primary transition hover:bg-primary/20" @click="handleDownload">
                下载查看
              </button>
            </div>

          <div
            v-if="loading && !errorMsg"
            class="absolute inset-0 z-10 flex items-center justify-center bg-body/70 text-sm text-t3"
          >
            解密并加载中…
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
