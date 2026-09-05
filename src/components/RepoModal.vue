<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import ModalShell from '@/components/ModalShell.vue'
import AppSelect from '@/components/AppSelect.vue'
import { Search, X } from '@lucide/vue'
import {
  addRepo,
  fetchRepoMeta,
  langColor,
  parseRepoInput,
  REPO_CATEGORIES,
  updateRepo,
  type GitHubRepoMeta,
} from '@/stores/repos'
import { searchRepositories, type RepoBrief } from '@/lib/github'
import { toast } from '@/lib/toast'
import type { RepoItem } from '@/types'

const props = defineProps<{
  open: boolean
  entry: RepoItem | null
}>()

const emit = defineEmits<{
  close: []
}>()

const form = reactive({
  address: '',
  category: '工具效率',
  note: '',
  pinned: false,
})
const meta = ref<GitHubRepoMeta | null>(null)
const searchResults = ref<RepoBrief[] | null>(null)
const fetching = ref(false)
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    meta.value = null
    searchResults.value = null
    fetching.value = false
    if (props.entry) {
      form.address = props.entry.url
      form.category = props.entry.category
      form.note = props.entry.note
      form.pinned = props.entry.pinned
      meta.value = {
        fullName: props.entry.fullName,
        url: props.entry.url,
        description: props.entry.description,
        language: props.entry.language,
        topics: [...props.entry.topics],
        stars: props.entry.stars,
        license: '',
        homepage: '',
        updatedAt: '',
        readme: '',
      }
    } else {
      Object.assign(form, { address: '', category: '工具效率', note: '', pinned: false })
    }
  },
  { immediate: true },
)

function applyBrief(r: RepoBrief): void {
  meta.value = {
    fullName: r.fullName,
    url: r.url,
    description: r.description,
    language: r.language,
    topics: [],
    stars: r.stars,
    license: '',
    homepage: '',
    updatedAt: '',
    readme: '',
  }
  form.address = r.fullName
  searchResults.value = null
}

async function loadMeta(): Promise<void> {
  error.value = ''
  const input = form.address.trim()
  if (!input) {
    error.value = '请输入仓库地址或搜索关键词'
    return
  }
  fetching.value = true
  try {
    const parsed = parseRepoInput(input)
    if (parsed) {
      meta.value = await fetchRepoMeta(input)
      searchResults.value = null
    } else {
      const results = await searchRepositories(input)
      if (results.length === 0) {
        error.value = '没有匹配的仓库，换个关键词试试'
      } else {
        searchResults.value = results
        toast(`找到 ${results.length} 个仓库，点击选择`)
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '获取失败'
    const parsed = parseRepoInput(input)
    if (parsed) {
      meta.value = {
        fullName: parsed.fullName,
        url: `https://github.com/${parsed.fullName}`,
        description: '',
        language: '',
        topics: [],
        stars: 0,
        license: '',
        homepage: '',
        updatedAt: '',
        readme: '',
      }
      error.value = `${msg}（已按手动模式保存基本信息）`
    } else {
      error.value = msg
    }
  } finally {
    fetching.value = false
  }
}

function save(): void {
  if (!meta.value) {
    void loadMetaThenSave()
    return
  }
  commit()
}

async function loadMetaThenSave(): Promise<void> {
  await loadMeta()
  if (meta.value) commit()
}

function commit(): void {
  if (!meta.value) return
  if (!form.category) return
  const { license: _license, homepage: _homepage, updatedAt: _updatedAt, readme: _readme, ...repoMeta } = meta.value
  const draft = {
    ...repoMeta,
    category: form.category,
    note: form.note.trim(),
    pinned: form.pinned,
  }
  if (props.entry) {
    updateRepo(props.entry.id, draft)
    toast('已更新')
  } else {
    addRepo(draft)
    toast('已收藏')
  }
  emit('close')
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-t1 placeholder:text-t4 outline-none transition focus:border-primary/60 focus:bg-surface-2 focus:ring-2 focus:ring-primary/25'
</script>

<template>
  <ModalShell :open="open" @close="emit('close')">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold">{{ entry ? '编辑收藏' : '收藏项目' }}</h3>
      <button
        aria-label="关闭"
        class="rounded-lg p-1.5 text-t4 transition hover:bg-surface hover:text-t2"
        @click="emit('close')"
      >
        <X class="h-5 w-5" />
      </button>
    </div>

    <div class="mt-5 space-y-4">
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">仓库地址或关键词（支持链接 / owner/repo / 直接搜词）</span>
        <div class="flex gap-2">
          <input
            v-model="form.address"
            :class="inputCls"
            class="min-w-0 flex-1 font-mono text-xs"
            placeholder="https://github.com/owner/repo 或 vue dashboard"
            @keydown.enter="loadMeta"
          />
          <button
            :disabled="fetching || !form.address.trim()"
            class="flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/15 px-3.5 text-xs font-medium text-primary transition-colors duration-150 hover:bg-primary/25 disabled:opacity-40"
            @click="loadMeta"
          >
            <Search class="h-3.5 w-3.5" :class="{ 'animate-spin': fetching }" />
            {{ fetching ? '查询中' : '获取 / 搜索' }}
          </button>
        </div>
      </label>

      <div
        v-if="searchResults && searchResults.length > 0"
        class="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line bg-inset p-1.5"
      >
        <button
          v-for="r in searchResults"
          :key="r.fullName"
          type="button"
          class="flex w-full items-start gap-2 rounded-lg p-2 text-left transition-colors duration-150 hover:bg-surface-2"
          @click="applyBrief(r)"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate font-mono text-xs font-medium text-primary">{{ r.fullName }}</p>
            <p v-if="r.description" class="mt-0.5 truncate text-[11px] text-t4">{{ r.description }}</p>
          </div>
          <span class="mt-0.5 shrink-0 text-[11px] tabular-nums text-t4">★ {{ r.stars }}</span>
        </button>
        <p class="px-2 pb-1 pt-0.5 text-[10px] text-t4">点击结果即可填入，继续选择分类后收藏</p>
      </div>

      <div v-if="meta" class="space-y-2.5 rounded-xl border border-line bg-inset p-3.5">
        <p class="font-mono text-sm font-medium text-primary">{{ meta.fullName }}</p>
        <p v-if="meta.description" class="line-clamp-2 text-xs leading-relaxed text-t3">
          {{ meta.description }}
        </p>
        <div class="flex flex-wrap items-center gap-2 text-xs text-t4">
          <span v-if="meta.language" class="flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full" :style="{ background: langColor(meta.language) }"></span>
            {{ meta.language }}
          </span>
          <span>★ {{ meta.stars.toLocaleString() }}</span>
        </div>
        <div v-if="meta.topics.length > 0" class="flex flex-wrap gap-1">
          <span v-for="t in meta.topics" :key="t" class="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] text-t3">
            #{{ t }}
          </span>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-t3">分类</span>
          <AppSelect
            v-model="form.category"
            :options="REPO_CATEGORIES.filter((x) => x !== '全部').map((c) => ({ value: c, label: c }))"
          />
        </label>
        <label class="flex items-end pb-1">
          <span class="flex cursor-pointer items-center gap-2 text-xs text-t3">
            <input v-model="form.pinned" type="checkbox" class="accent-primary" />
            置顶
          </span>
        </label>
      </div>

      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">备注（为什么收藏 / 打算怎么用）</span>
        <textarea v-model="form.note" rows="2" :class="inputCls" placeholder="选填，如：下个项目试试它的方案"></textarea>
      </label>

      <p v-if="error" class="rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs text-warn">
        {{ error }}
      </p>
    </div>

    <div class="mt-6 flex justify-end gap-3">
      <button
        class="rounded-lg px-4 py-2.5 text-sm font-medium text-t3 transition hover:bg-surface hover:text-t2"
        @click="emit('close')"
      >
        取消
      </button>
      <button
        :disabled="fetching"
        class="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-primary-strong disabled:opacity-40"
        @click="save"
      >
        {{ entry ? '保存修改' : '收藏' }}
      </button>
    </div>
  </ModalShell>
</template>
