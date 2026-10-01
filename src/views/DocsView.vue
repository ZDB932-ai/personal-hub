<script setup lang="ts">
import { confirmAction } from '@/lib/confirmAction'
import { cancelTextExtraction, extractDocumentText, indexedText, textProgress } from '@/lib/documentText'
import { computed, onMounted, ref } from 'vue'
import {
  ArrowUpDown,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  File as FileIcon,
  FileText,
  FolderLock,
  Image as ImageIcon,
  PenLine,
  Star,
  Trash2,
  Upload,
} from '@lucide/vue'
import {
  docMetas,
  downloadDoc,
  DOC_CATEGORIES,
  DOC_CATEGORY_BADGE,
  importDoc,
  removeDoc,
  updateDocMeta,
} from '@/stores/docs'
import { copyText, toast } from '@/lib/toast'
import { formatSize } from '@/lib/utils'
import type { DocMeta } from '@/types'
import DocThumb from '@/components/DocThumb.vue'
import EditDocModal from '@/components/EditDocModal.vue'
import DocPreviewModal from '@/components/DocPreviewModal.vue'
import AppSelect from '@/components/AppSelect.vue'
import PageHeader from '@/components/PageHeader.vue'

const query = ref('')
async function extractText(meta: DocMeta): Promise<void> {
  try { await extractDocumentText(meta); toast('已加入本次解锁会话的正文搜索') }
  catch (error) { toast(error instanceof Error ? error.message : '提取失败', 'error') }
}
const activeCat = ref('全部')
const uploading = ref(false)
const sortBy = ref<'time' | 'name' | 'size'>('time')

const manageMode = ref(false)
const selectedIds = ref(new Set<string>())

const previewOpen = ref(false)
const previewMeta = ref<DocMeta | null>(null)

const editOpen = ref(false)
const editingMeta = ref<DocMeta | null>(null)

const storage = ref<{ usage: number; quota: number } | null>(null)

onMounted(() => {
  void navigator.storage?.persist?.().catch(() => {})
  refreshStorage()
})

function refreshStorage(): void {
  void navigator.storage
    ?.estimate?.()
    .then((est) => {
      storage.value = { usage: est.usage ?? 0, quota: est.quota ?? 0 }
    })
    .catch(() => {})
}

async function handleFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0) return
  uploading.value = true
  let ok = 0
  let failMsg = ''
  for (const f of files) {
    try {
      await importDoc(f)
      ok++
    } catch (e) {
      failMsg = e instanceof Error ? e.message : String(e)
      break
    }
  }
  uploading.value = false
  if (ok > 0) refreshStorage()
  if (ok > 0) toast(`${ok} 个文件已加密入库`)
  else if (failMsg) toast(failMsg, 'error')
}

function mimeIcon(meta: DocMeta): typeof ImageIcon {
  if (meta.mime.startsWith('image/') || isImageExt(meta)) return ImageIcon
  if (meta.mime === 'application/pdf' || extOf(meta) === 'pdf') return FileText
  return FileIcon
}

function mimeColor(meta: DocMeta): string {
  if (meta.mime.startsWith('image/') || isImageExt(meta)) return 'bg-warn text-ink'
  if (meta.mime === 'application/pdf' || extOf(meta) === 'pdf') return 'bg-danger text-white'
  return 'bg-info text-white'
}

function extOf(meta: DocMeta): string {
  const parts = meta.name.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']

function isImageExt(meta: DocMeta): boolean {
  return IMAGE_EXTS.includes(extOf(meta))
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = docMetas.value
    .filter((d) => activeCat.value === '全部' || d.category === activeCat.value)
    .filter(
      (d) =>
        !q ||
        d.name.toLowerCase().includes(q) ||
        indexedText(d).toLowerCase().includes(q) ||
        d.note.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)),
    )
  return list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (sortBy.value === 'name') return a.name.localeCompare(b.name, 'zh-CN')
    if (sortBy.value === 'size') return b.size - a.size
    return b.createdAt - a.createdAt
  })
})

function catCount(cat: string): number {
  if (cat === '全部') return docMetas.value.length
  return docMetas.value.filter((d) => d.category === cat).length
}

function openPreview(meta: DocMeta): void {
  previewMeta.value = meta
  previewOpen.value = true
}

function openEdit(meta: DocMeta): void {
  editingMeta.value = meta
  editOpen.value = true
}

function updatePin(meta: DocMeta): void {
  updateDocMeta(meta.id, { pinned: !meta.pinned })
}

function updateCategory(meta: DocMeta, value: string): void {
  updateDocMeta(meta.id, { category: value })
}

const docCategoryOptions = DOC_CATEGORIES.filter((c) => c !== '全部').map((c) => ({
  value: c,
  label: c,
}))

const sortOptions = [
  { value: 'time', label: '按时间' },
  { value: 'name', label: '按名称' },
  { value: 'size', label: '按大小' },
]

const hasFilters = computed(() => activeCat.value !== '全部' || Boolean(query.value.trim()))

function clearFilters(): void {
  activeCat.value = '全部'
  query.value = ''
}

async function handleDownload(meta: DocMeta): Promise<void> {
  try {
    await downloadDoc(meta)
  } catch (e) {
    toast(e instanceof Error ? e.message : '下载失败', 'error')
  }
}

async function handleDelete(meta: DocMeta): Promise<void> {
  if (!await confirmAction(`确定删除「${meta.name}」吗？文件数据将一并清除。`)) return
  void removeDoc(meta.id).then(refreshStorage)
}

function toggleManage(): void {
  manageMode.value = !manageMode.value
  selectedIds.value = new Set()
}

function toggleSelect(id: string): void {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function selectAllVisible(): void {
  if (selectedIds.value.size >= filtered.value.length) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(filtered.value.map((d) => d.id))
  }
}

async function batchDelete(): Promise<void> {
  const ids = [...selectedIds.value]
  if (ids.length === 0) return
  if (!await confirmAction(`确定删除选中的 ${ids.length} 个文件吗？数据将一并清除。`)) return
  for (const id of ids) await removeDoc(id)
  selectedIds.value = new Set()
  refreshStorage()
  toast(`已删除 ${ids.length} 个文件`)
}
</script>

<template>
  <div>
    <PageHeader title="资料库" eyebrow="内容">
      <template #description>
        {{ docMetas.length }} 个文件 · 加密保存，随时查找
      </template>
      <template #actions>
        <button class="ui-secondary-button gap-1.5 text-xs" :aria-pressed="manageMode" :class="manageMode ? 'border-warn/40 bg-warn/10 text-warn' : ''" @click="toggleManage">
          <CheckCircle2 class="h-4 w-4" />
          {{ manageMode ? '退出管理' : '批量管理' }}
        </button>
        <label
          class="ui-primary-button cursor-pointer gap-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary"
          :class="{ 'pointer-events-none opacity-60': uploading }"
        >
          <Upload class="h-4 w-4" />
          {{ uploading ? '加密入库中…' : '上传文件' }}
          <input type="file" multiple class="sr-only" aria-label="上传文件" :disabled="uploading" @change="handleFiles" />
        </label>
      </template>
    </PageHeader>
    <details class="resource-guidance"><summary>存储与正文搜索</summary><p>文件加密保存在本机。<span v-if="storage && storage.quota > 0">浏览器存储已用 {{ formatSize(storage.usage) }} / {{ formatSize(storage.quota) }}。</span>在文件的「更多操作」中提取文本或 PDF 正文后即可搜索（≤10 MiB，最多 200 页 / 10 万字符）。正文索引仅在本次解锁期间保留。</p></details>
    <div v-if="textProgress" class="mt-2 flex items-center gap-3 text-xs text-primary"><span>{{ textProgress }}</span><button class="min-h-11 underline" @click="cancelTextExtraction">取消提取</button></div>

    <div class="control-bar mt-4">
      <label class="control-search w-full sm:w-56">
        <FileText class="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-t4" />
        <input
          v-model="query"
          placeholder="搜索名称 / 备注 / 标签"
          aria-label="搜索资料库"
          class="control-input py-2 pl-9 pr-3 text-xs"
        />
      </label>
      <div class="relative w-28 shrink-0">
        <ArrowUpDown class="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-t4" />
        <AppSelect v-model="sortBy" :options="sortOptions" size="sm" trigger-class="pl-9" />
      </div>
      <div class="filter-rail min-w-0 flex-1">
        <button
          v-for="cat in DOC_CATEGORIES"
          :key="cat"
          class="filter-chip"
          :class="{ 'is-active': activeCat === cat }"
          @click="activeCat = cat"
        >
          {{ cat }}
          <span class="ml-1 opacity-60">{{ catCount(cat) }}</span>
        </button>
      </div>
      <button v-if="hasFilters" class="filter-reset" @click="clearFilters">清除筛选</button>
      <span class="w-full shrink-0 text-right text-xs tabular-nums text-t4 sm:ml-auto sm:w-auto">显示 {{ filtered.length }} / {{ docMetas.length }} 项</span>
    </div>

    <div v-if="docMetas.length === 0" class="empty-state mt-8">
      <FolderLock class="mx-auto h-10 w-10 text-t4" />
      <p class="mt-4 text-sm font-medium text-t2">资料库还是空的</p>
      <p class="mt-1 text-xs text-t4">上传证件扫描件、合同、票据等，加密保存随取随用（单文件 ≤ 50MB）</p>
    </div>

    <div v-else-if="filtered.length === 0" class="empty-state mt-8">
      <FileText class="mx-auto h-10 w-10 text-t4" />
      <p class="text-sm font-medium text-t2">没有匹配的文件</p>
      <p class="mt-1 text-xs text-t4">换个关键词或切换分类试试</p>
      <button class="ui-secondary-button mt-4 text-xs" @click="clearFilters">清除筛选</button>
    </div>

    <div v-else class="collection-grid mt-6 grid-cols-1 sm:grid-cols-2">
      <article
        v-for="d in filtered"
        :key="d.id"
        class="collection-card group relative"
        :class="
          manageMode && selectedIds.has(d.id)
            ? 'is-selected'
            : ''
        "
        :role="manageMode ? 'checkbox' : undefined"
        :aria-checked="manageMode ? selectedIds.has(d.id) : undefined"
        :tabindex="manageMode ? 0 : undefined"
        @click="manageMode ? toggleSelect(d.id) : undefined"
        @keydown.enter.self="manageMode ? (toggleSelect(d.id), $event.preventDefault()) : undefined"
        @keydown.space.self="manageMode ? (toggleSelect(d.id), $event.preventDefault()) : undefined"
      >
        <button
          v-if="manageMode"
          class="absolute right-4 top-4 z-10"
          :title="selectedIds.has(d.id) ? '取消选择' : '选择'"
          @click.stop="toggleSelect(d.id)"
        >
          <CheckCircle2 v-if="selectedIds.has(d.id)" class="h-6 w-6 text-primary" />
          <Circle v-else class="h-6 w-6 text-t4" />
        </button>

        <div class="flex items-start gap-3">
          <span
            v-if="isImageExt(d)"
            class="block h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-line"
          >
            <DocThumb :meta="d" />
          </span>
          <span
            v-else
            class="flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-lg"
            :class="mimeColor(d)"
          >
            <component :is="mimeIcon(d)" class="h-5 w-5" />
          </span>
          <div class="min-w-0 flex-1">
            <p v-if="manageMode" class="truncate pr-7 font-medium" :title="d.name">{{ d.name }}</p>
            <button v-else class="block min-h-11 max-w-full truncate text-left font-medium text-t1 hover:text-primary" :title="d.name" @click.stop="openPreview(d)">{{ d.name }}</button>
            <p class="mt-0.5 text-xs text-t4">{{ formatSize(d.size) }} · {{ new Date(d.createdAt).toLocaleDateString('zh-CN') }}</p>
            <div v-if="d.tags.length > 0" class="mt-1.5 flex flex-wrap gap-1">
              <span v-for="tag in d.tags.slice(0, 3)" :key="tag" class="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] text-t3">
                #{{ tag }}
              </span>
            </div>
          </div>
          <button
            v-if="!manageMode"
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-t4 transition-colors duration-150 hover:bg-surface-2 hover:text-t2"
            :aria-label="d.pinned ? '取消收藏' : '收藏置顶'"
            :aria-pressed="d.pinned"
            @click.stop="updatePin(d)"
          >
            <Star class="h-4 w-4" />
          </button>
        </div>

        <details v-if="!manageMode" class="resource-guidance" @click.stop @keydown.stop><summary>更多操作</summary>
        <div class="mt-1 flex items-center gap-2">
          <div class="w-28">
            <AppSelect
              :model-value="d.category"
              :options="docCategoryOptions"
              size="sm"
              :disabled="manageMode"
              :trigger-class="DOC_CATEGORY_BADGE[d.category] ?? DOC_CATEGORY_BADGE['其他']"
              @update:model-value="updateCategory(d, $event as string)"
            />
          </div>
          <span v-if="d.pinned" class="rounded-md bg-warn/15 px-1.5 py-0.5 text-[10px] text-warn">置顶</span>
        </div>
        <button v-if="!manageMode" :disabled="Boolean(textProgress)" class="mt-2 min-h-11 text-left text-xs text-primary disabled:opacity-40" @click.stop="extractText(d)">{{ indexedText(d) ? '重新提取正文' : '提取正文用于搜索' }}</button>
        </details>

        <button
          v-if="d.note"
          class="mt-2.5 flex w-full items-center gap-2 rounded-lg bg-inset px-3 py-2 text-left text-xs text-t2 transition hover:bg-inset disabled:opacity-50"
          title="点击复制备注内容"
          :disabled="manageMode"
          @click.stop="copyText(d.note, '备注')"
        >
          <span class="min-w-0 flex-1 truncate">{{ d.note }}</span>
          <Copy class="h-3 w-3 shrink-0" />
        </button>

        <div v-if="!manageMode" class="mt-3 flex items-center gap-1">
          <button class="flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-t3 transition hover:bg-surface-2 hover:text-primary" @click.stop="openPreview(d)">
            <FileText class="h-3.5 w-3.5" />
            预览
          </button>
          <button class="flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-t3 transition hover:bg-surface-2 hover:text-primary" @click.stop="handleDownload(d)">
            <Download class="h-3.5 w-3.5" />
            下载
          </button>
          <span class="flex-1"></span>
          <button class="flex h-9 w-9 items-center justify-center rounded-lg text-t4 transition hover:bg-surface-2 hover:text-t2" aria-label="编辑文件信息" @click.stop="openEdit(d)">
            <PenLine class="h-4 w-4" />
          </button>
          <button class="flex h-9 w-9 items-center justify-center rounded-lg text-t4 transition hover:bg-danger/10 hover:text-danger" aria-label="删除文件" @click.stop="handleDelete(d)">
            <Trash2 class="h-4 w-4" />
          </button>
        </div>
      </article>
    </div>

    <Teleport to="body">
      <Transition name="toast">
        <div
          v-if="manageMode && selectedIds.size > 0"
          class="fixed inset-x-4 bottom-20 z-[70] mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-line bg-elevated px-5 py-3 md:bottom-6"
        >
          <span class="text-sm">已选 <b class="text-primary">{{ selectedIds.size }}</b> 个</span>
          <div class="flex items-center gap-2">
            <button class="ui-secondary-button px-3 text-xs" @click="selectAllVisible">
              {{ selectedIds.size >= filtered.length ? '全不选' : '全选' }}
            </button>
            <button class="ui-danger-button px-3 text-xs" @click="batchDelete">
              批量删除
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <DocPreviewModal :open="previewOpen" :meta="previewMeta" @close="previewOpen = false" />
    <EditDocModal :open="editOpen" :meta="editingMeta" @close="editOpen = false" />
  </div>
</template>
