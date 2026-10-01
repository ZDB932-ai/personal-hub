<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CalendarDays, Play, Search, X } from '@lucide/vue'
import ModalShell from './ModalShell.vue'
import { hubSearchOpen, hubSelection, openHubItem, type HubKind } from '@/stores/hub'
import { tasks } from '@/stores/tasks'
import { memos } from '@/stores/memos'
import { docMetas, importDoc } from '@/stores/docs'
import { repos } from '@/stores/repos'
import { entries } from '@/stores/vault'
import { hubLabels, searchHub } from '@/lib/hubSearch'
import { toast } from '@/lib/toast'
import { indexedText } from '@/lib/documentText'

const TaskModal = defineAsyncComponent(() => import('./TaskModal.vue'))
const MemoModal = defineAsyncComponent(() => import('./MemoModal.vue'))
const RepoModal = defineAsyncComponent(() => import('./RepoModal.vue'))
const EntryModal = defineAsyncComponent(() => import('./EntryModal.vue'))
const DocPreviewModal = defineAsyncComponent(() => import('./DocPreviewModal.vue'))
const router = useRouter()
function locateTask(id: string): void { hubSearchOpen.value = false; void router.push({ path: '/calendar', query: { task: id } }) }
const query = ref('')
const kind = ref('all')
const input = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const data = computed(() => ({ tasks: tasks.value, memos: memos.value, docMetas: docMetas.value.map(meta => ({ ...meta, note: `${meta.note}\n${indexedText(meta)}` })), repos: repos.value, entries: entries.value }))
const results = computed(() => hubSearchOpen.value ? searchHub(data.value, query.value, kind.value) : [])
const selectedTask = computed(() => tasks.value.find(x => x.id === hubSelection.value?.id) ?? null)
const selectedMemo = computed(() => memos.value.find(x => x.id === hubSelection.value?.id) ?? null)
const selectedRepo = computed(() => repos.value.find(x => x.id === hubSelection.value?.id) ?? null)
const selectedEntry = computed(() => entries.value.find(x => x.id === hubSelection.value?.id) ?? null)
const selectedDoc = computed(() => docMetas.value.find(x => x.id === hubSelection.value?.id) ?? null)
watch(hubSearchOpen, async open => { if (open) { query.value = ''; kind.value = 'all'; await nextTick(); input.value?.focus() } })
function shortcut(event: KeyboardEvent) {
  if (!hubSearchOpen.value && document.querySelector('[role="dialog"]')) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); hubSelection.value = null; hubSearchOpen.value = !hubSearchOpen.value }
}
window.addEventListener('keydown', shortcut)
onUnmounted(() => { window.removeEventListener('keydown', shortcut); hubSearchOpen.value = false; hubSelection.value = null; query.value = '' })
async function upload(event: Event) {
  const files = (event.target as HTMLInputElement).files
  if (!files?.length) return
  uploading.value = true
  try { for (const file of files) await importDoc(file); toast('已加密保存到资料库') }
  catch (error) { toast(error instanceof Error ? error.message : '导入失败', 'error') }
  finally { uploading.value = false; if (fileInput.value) fileInput.value.value = '' }
}
</script>

<template>
  <ModalShell :open="hubSearchOpen" max-width="max-w-2xl" @close="hubSearchOpen = false">
    <div class="flex items-center justify-between gap-3"><h3 class="text-lg font-semibold text-t1">全局搜索与收集</h3><button aria-label="关闭搜索" class="ui-icon-button" @click="hubSearchOpen = false"><X class="h-5 w-5" /></button></div>
    <label class="control-search mt-4 block"><Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t4" /><input ref="input" v-model="query" class="control-input py-2 pl-9 pr-3" aria-label="搜索所有内容" placeholder="搜索任务、便签、资料、仓库、账号" @keydown.enter.prevent="results[0] && openHubItem(results[0].kind, results[0].id)" /></label>
    <div class="mt-3 flex flex-wrap gap-2"><button class="filter-chip min-h-11" :class="{ 'is-active': kind === 'all' }" @click="kind = 'all'">全部</button><button v-for="(label, key) in hubLabels" :key="key" class="filter-chip min-h-11" :class="{ 'is-active': kind === key }" @click="kind = key">{{ label }}</button></div>
    <div v-if="!query.trim()" class="mt-5 grid grid-cols-2 gap-3">
      <button v-for="target in (['tasks', 'memos', 'repos', 'entries'] as HubKind[])" :key="target" class="ui-secondary-button min-h-11" @click="openHubItem(target)">新建{{ hubLabels[target] }}</button>
      <button class="ui-secondary-button min-h-11" :disabled="uploading" @click="fileInput?.click()">{{ uploading ? '正在加密导入…' : '收集文件' }}</button>
    </div>
    <ul v-else class="mt-4 max-h-80 space-y-2 overflow-y-auto">
      <li v-for="item in results" :key="`${item.kind}:${item.id}`" class="flex items-center gap-2"><button class="min-w-0 flex-1 rounded-lg border border-line p-3 text-left hover:bg-surface-2" @click="openHubItem(item.kind, item.id)"><span class="text-xs text-primary">{{ hubLabels[item.kind] }}</span><p class="truncate text-sm text-t1">{{ item.title }}</p><p class="truncate text-xs text-t3">{{ item.detail }}</p></button><RouterLink v-if="item.kind === 'tasks'" :to="{ path: '/focus', query: { task: item.id } }" class="ui-icon-button shrink-0" :aria-label="`打开专注 ${item.title}`" @click="hubSearchOpen = false"><Play class="h-5 w-5" /></RouterLink><button v-if="item.kind === 'tasks' && tasks.some(task => task.id === item.id && task.date)" class="ui-icon-button shrink-0" :aria-label="`在日历定位 ${item.title}`" title="在日历定位" @click="locateTask(item.id)"><CalendarDays class="h-5 w-5" /></button></li>
      <li v-if="!results.length" class="p-4 text-sm text-t3">没有找到匹配内容，可以换个关键词。</li>
    </ul>
    <p class="mt-4 text-xs text-t4">Ctrl / ⌘ + K 打开。账号仅搜索名称、用户名、网址与分类，不搜索密码或验证码。最多显示 80 项。</p>
    <input ref="fileInput" type="file" multiple hidden @change="upload" />
  </ModalShell>
  <TaskModal v-if="hubSelection?.kind === 'tasks'" :open="true" :entry="selectedTask" @close="hubSelection = null" />
  <MemoModal v-if="hubSelection?.kind === 'memos'" :open="true" :entry="selectedMemo" @close="hubSelection = null" />
  <RepoModal v-if="hubSelection?.kind === 'repos'" :open="true" :entry="selectedRepo" @close="hubSelection = null" />
  <EntryModal v-if="hubSelection?.kind === 'entries'" :open="true" :entry="selectedEntry" @close="hubSelection = null" />
  <DocPreviewModal v-if="hubSelection?.kind === 'docMetas' && selectedDoc" :open="true" :meta="selectedDoc" @close="hubSelection = null" />
</template>
