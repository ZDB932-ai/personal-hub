<script setup lang="ts">
import { confirmAction } from '@/lib/confirmAction'
import { computed, reactive, ref, watch } from 'vue'
import {
  ArrowUpDown,
  CircleDot,
  Copy,
  ExternalLink,
  FolderGit2,
  MessageSquare,
  Pencil,
  RefreshCw,
  Search as SearchIcon,
  Star,
  Trash2,
  UserRound,
} from '@lucide/vue'
import {
  formatStars,
  langColor,
  REPO_CATEGORIES,
  REPO_CATEGORY_BADGE,
  removeRepo,
  repos,
  toggleRepoPin,
  updateRepo,
} from '@/stores/repos'
import {
  disconnectGitHub,
  fetchMyRepositories,
  fetchRepoIssues,
  githubCfg,
  githubHasToken,
  saveConnection,
  type IssueBrief,
  type RepoBrief,
} from '@/lib/github'
import { copyText, toast } from '@/lib/toast'
import { formatDate } from '@/lib/utils'
import type { RepoItem } from '@/types'
import RepoModal from '@/components/RepoModal.vue'
import AppSelect from '@/components/AppSelect.vue'
import CardActionMenu from '@/components/CardActionMenu.vue'
import PageHeader from '@/components/PageHeader.vue'
import PasswordInput from '@/components/PasswordInput.vue'

const viewTab = ref<'favorites' | 'mine'>('favorites')
const query = ref('')
const activeCat = ref('全部')
const sortBy = ref<'time' | 'stars'>('time')
const showModal = ref(false)
const editing = ref<RepoItem | null>(null)

const myRepos = ref<RepoBrief[]>([])
const mineLoading = ref(false)
const mineError = ref('')
const mineLoaded = ref(false)
const expanded = ref<string | null>(null)
const issueState = ref<Record<string, { loading: boolean; error: string; list: IssueBrief[] }>>({})

const connectForm = reactive({ username: '', token: '' })
const connectError = ref('')
const connecting = ref(false)

watch(viewTab, (t) => {
  if (t === 'mine') void loadMine()
})

async function loadMine(force = false): Promise<void> {
  if (!githubCfg.value || mineLoading.value) return
  if (mineLoaded.value && !force) return
  mineLoading.value = true
  mineError.value = ''
  try {
    myRepos.value = await fetchMyRepositories()
    mineLoaded.value = true
  } catch (e) {
    mineError.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    mineLoading.value = false
  }
}

async function connect(): Promise<void> {
  connectError.value = ''
  if (!connectForm.username.trim()) {
    connectError.value = '请填写 GitHub 用户名'
    return
  }
  connecting.value = true
  try {
    await saveConnection(connectForm.username.trim(), connectForm.token.trim() || null)
    connectForm.token = ''
    toast('GitHub 已连接')
    mineLoaded.value = false
    await loadMine(true)
  } catch (e) {
    connectError.value = e instanceof Error ? e.message : '连接失败'
  } finally {
    connecting.value = false
  }
}

async function disconnect(): Promise<void> {
  await disconnectGitHub()
  myRepos.value = []
  mineLoaded.value = false
  expanded.value = null
  toast('已断开 GitHub 连接')
}

function toggleIssues(r: RepoBrief): void {
  if (expanded.value === r.fullName) {
    expanded.value = null
    return
  }
  expanded.value = r.fullName
  if (!issueState.value[r.fullName]) {
    issueState.value[r.fullName] = { loading: true, error: '', list: [] }
    fetchRepoIssues(r.fullName)
      .then((list) => {
        issueState.value[r.fullName] = { loading: false, error: '', list }
      })
      .catch((e) => {
        issueState.value[r.fullName] = {
          loading: false,
          error: e instanceof Error ? e.message : 'Issue 加载失败',
          list: [],
        }
      })
  }
}

function openCreate(): void {
  editing.value = null
  showModal.value = true
}

function openEdit(repo: RepoItem): void {
  editing.value = repo
  showModal.value = true
}

async function handleDelete(repo: RepoItem): Promise<void> {
  if (await confirmAction(`确定删除收藏「${repo.fullName}」吗？`)) removeRepo(repo.id)
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return [...repos.value]
    .filter((r) => activeCat.value === '全部' || r.category === activeCat.value)
    .filter(
      (r) =>
        !q ||
        r.fullName.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.note.toLowerCase().includes(q) ||
        r.topics.some((t) => t.toLowerCase().includes(q)),
    )
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (sortBy.value === 'stars') return b.stars - a.stars
      return b.createdAt - a.createdAt
    })
})

function catCount(cat: string): number {
  if (cat === '全部') return repos.value.length
  return repos.value.filter((r) => r.category === cat).length
}

function toggleCategory(repo: RepoItem, value: string): void {
  updateRepo(repo.id, { category: value })
  toast(`已归类到「${value}」`)
}

const categoryOptions = REPO_CATEGORIES.filter((c) => c !== '全部').map((c) => ({
  value: c,
  label: c,
}))

const sortOptions = [
  { value: 'time', label: '按时间' },
  { value: 'stars', label: '按星数' },
]

const hasFavoriteFilters = computed(() => activeCat.value !== '全部' || Boolean(query.value.trim()))

function clearFavoriteFilters(): void {
  activeCat.value = '全部'
  query.value = ''
}
</script>

<template>
  <div>
    <PageHeader title="项目收藏" eyebrow="知识与资料">
      <template #description>
        <span v-if="viewTab === 'favorites'">已收藏 {{ repos.length }} 个 GitHub 项目</span>
        <span v-else-if="githubCfg">查看 {{ githubCfg.username }} 的仓库与 Issue</span>
        <span v-else>连接 GitHub 后查看自己的仓库与 Issue</span>
      </template>
      <template #actions>
        <button v-if="viewTab === 'favorites'" class="ui-primary-button" @click="openCreate">收藏项目</button>
        <button v-else-if="githubCfg" :disabled="mineLoading" class="ui-secondary-button gap-2" @click="loadMine(true)">
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': mineLoading }" />
          刷新仓库
        </button>
      </template>
    </PageHeader>

    <div class="control-bar mt-4">
      <div role="tablist" aria-label="项目视图" class="filter-rail">
        <button role="tab" :aria-selected="viewTab === 'favorites'" class="filter-chip" :class="{ 'is-active': viewTab === 'favorites' }" @click="viewTab = 'favorites'">
          <Star class="h-3.5 w-3.5" />
          我的收藏（{{ repos.length }}）
        </button>
        <button role="tab" :aria-selected="viewTab === 'mine'" class="filter-chip" :class="{ 'is-active': viewTab === 'mine' }" @click="viewTab = 'mine'">
          <UserRound class="h-3.5 w-3.5" />
          我的项目
        </button>
      </div>
    </div>

    <template v-if="viewTab === 'favorites'">
    <div class="control-bar mt-3">
      <label class="control-search w-full sm:w-56">
        <SearchIcon class="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-t4" />
        <input
          v-model="query"
          placeholder="搜索名称 / 描述 / 备注 / 标签"
          aria-label="搜索收藏项目"
          class="control-input py-2 pl-9 pr-3 text-xs"
        />
      </label>
      <div class="relative w-28 shrink-0">
        <ArrowUpDown class="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-t4" />
        <AppSelect v-model="sortBy" :options="sortOptions" size="sm" trigger-class="pl-9" />
      </div>
      <div class="filter-rail min-w-0 flex-1">
        <button
          v-for="cat in REPO_CATEGORIES"
          :key="cat"
          class="filter-chip"
          :class="{ 'is-active': activeCat === cat }"
          @click="activeCat = cat"
        >
          {{ cat }}
          <span class="ml-1 opacity-60">{{ catCount(cat) }}</span>
        </button>
      </div>
      <button v-if="hasFavoriteFilters" class="filter-reset" @click="clearFavoriteFilters">清除筛选</button>
      <span class="ml-auto shrink-0 text-xs tabular-nums text-t4">显示 {{ filtered.length }} / {{ repos.length }} 项</span>
    </div>

    <div v-if="repos.length === 0" class="empty-state mt-8">
      <FolderGit2 class="mx-auto h-10 w-10 text-t4" />
      <p class="mt-4 text-sm font-medium text-t2">还没有收藏任何项目</p>
      <p class="mt-1 text-xs text-t4">粘贴 GitHub 链接或搜索项目名称，将常用项目集中保存。</p>
      <button class="ui-primary-button mt-4" @click="openCreate">收藏项目</button>
    </div>

    <div v-else-if="filtered.length === 0" class="empty-state mt-8">
      <SearchIcon class="mx-auto h-10 w-10 text-t4" />
      <p class="text-sm font-medium text-t2">没有匹配的项目</p>
      <p class="mt-1 text-xs text-t4">换个关键词或切换分类试试</p>
      <button class="ui-secondary-button mt-4 text-xs" @click="clearFavoriteFilters">清除筛选</button>
    </div>

    <div v-else class="collection-grid mt-6 grid-cols-1 sm:grid-cols-2">
      <article
        v-for="r in filtered"
        :key="r.id"
        class="collection-card relative"
      >
        <div class="flex items-start justify-between gap-2">
          <a
            :href="r.url"
            target="_blank"
            rel="noopener noreferrer"
            class="flex min-w-0 items-center gap-1.5 font-mono text-sm font-semibold text-primary transition hover:text-primary-strong"
            :title="r.fullName"
          >
            <span class="truncate">{{ r.fullName }}</span>
            <ExternalLink class="h-3.5 w-3.5 shrink-0 text-t4" />
          </a>
          <CardActionMenu label="更多项目操作">
            <button class="menu-item" @click="toggleRepoPin(r.id)">
              <Star class="h-3.5 w-3.5" />
              {{ r.pinned ? '取消置顶' : '置顶' }}
            </button>
            <button class="menu-item" @click="openEdit(r)">
              <Pencil class="h-3.5 w-3.5" />
              编辑
            </button>
            <button class="menu-item is-danger" @click="handleDelete(r)">
              <Trash2 class="h-3.5 w-3.5" />
              删除
            </button>
          </CardActionMenu>
        </div>

        <p v-if="r.description" class="mt-2 line-clamp-2 min-h-8 text-xs leading-relaxed text-t3">
          {{ r.description }}
        </p>
        <p v-else class="mt-2 min-h-8 text-xs italic text-t4">暂无描述</p>

        <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-t4">
          <span v-if="r.language" class="flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full" :style="{ background: langColor(r.language) }"></span>
            {{ r.language }}
          </span>
          <span class="tabular-nums">★ {{ formatStars(r.stars) }}</span>
        </div>

        <div v-if="r.topics.length > 0" class="mt-2 flex flex-wrap gap-1">
          <span v-for="t in r.topics.slice(0, 4)" :key="t" class="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] text-t3">
            #{{ t }}
          </span>
        </div>

        <div class="mt-3 flex items-center gap-2">
          <div class="w-28">
            <AppSelect
              :model-value="r.category"
              :options="categoryOptions"
              size="sm"
              :trigger-class="REPO_CATEGORY_BADGE[r.category] ?? REPO_CATEGORY_BADGE['其他']"
              @update:model-value="toggleCategory(r, $event as string)"
            />
          </div>
          <span v-if="r.pinned" class="rounded-md bg-warn/15 px-1.5 py-0.5 text-[10px] text-warn">置顶</span>
        </div>

        <button
          v-if="r.note"
          class="mt-2.5 flex w-full items-center gap-2 rounded-lg bg-inset px-3 py-2 text-left text-xs text-t2 transition hover:bg-inset"
          title="点击复制备注"
          @click="copyText(r.note, '备注')"
        >
          <span class="min-w-0 flex-1 truncate">{{ r.note }}</span>
          <Copy class="h-3 w-3 shrink-0" />
        </button>
      </article>
    </div>
    </template>

    <div v-show="viewTab === 'mine'">
      <div v-if="!githubCfg" class="mt-6 max-w-md rounded-xl border border-line bg-surface p-5">
        <h3 class="flex items-center gap-2 text-sm font-semibold">
          <UserRound class="h-4 w-4 text-primary" />
          连接 GitHub
        </h3>
        <p class="mt-1.5 text-xs leading-relaxed text-t4">
          填写用户名查看公开仓库与 Issue；提供 Token 可额外查看私有仓库并提升限额。Classic Token（ghp_ 开头，勾选 repo 权限）或
          Fine-grained Token（github_pat_ 开头，选择仓库资源 + Metadata 只读）均可；有 Token 时用户名可随意填写，将自动识别。
        </p>
        <div class="mt-4 space-y-3">
          <input
            v-model="connectForm.username"
            placeholder="GitHub 用户名（非邮箱；有 Token 时可随意填）"
            class="control-input px-3"
            @keydown.enter="connect"
          />
          <PasswordInput
            v-model="connectForm.token"
            placeholder="Personal Access Token（选填，可点击眼睛查看）"
          />
          <p v-if="connectError" class="text-xs text-danger">{{ connectError }}</p>
          <button
            :disabled="connecting || !connectForm.username.trim()"
            class="ui-primary-button w-full disabled:opacity-40"
            @click="connect"
          >
            {{ connecting ? '连接中…' : '保存并加载' }}
          </button>
          <p class="text-[11px] leading-relaxed text-t4">
            Token 经主密钥加密后保存在本机，不会明文落盘、不会同步到云端。
          </p>
        </div>
      </div>

      <div v-else>
        <div class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <p class="text-sm">
            已连接
            <b class="font-mono text-primary">{{ githubCfg.username }}</b>
            <span class="badge ml-2" :class="githubHasToken ? 'badge-emerald' : 'badge-slate'">
              {{ githubHasToken ? '含私有仓库' : '仅公开仓库' }}
            </span>
          </p>
          <div class="flex items-center gap-2">
            <button
              :disabled="mineLoading"
              class="ui-secondary-button min-h-9 gap-1.5 px-3 text-xs disabled:opacity-40"
              @click="loadMine(true)"
            >
              <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': mineLoading }" />
              刷新
            </button>
            <button
              class="ui-danger-button min-h-9 px-3 text-xs"
              @click="disconnect"
            >
              断开
            </button>
          </div>
        </div>

        <p v-if="mineError" class="mt-4 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">
          {{ mineError }}
        </p>

        <div v-if="mineLoading" class="mt-4 space-y-3">
          <div v-for="i in 4" :key="i" class="skeleton h-16 rounded-xl"></div>
        </div>

        <div v-else-if="myRepos.length === 0 && !mineError" class="mt-10 rounded-xl border border-dashed border-line py-14 text-center">
          <FolderGit2 class="mx-auto h-10 w-10 text-t4" />
          <p class="mt-4 text-sm font-medium text-t2">该账号下没有可见仓库</p>
        </div>

        <div v-else class="mt-4 space-y-3">
          <div
            v-for="r in myRepos"
            :key="r.fullName"
            class="overflow-hidden rounded-xl border border-line bg-surface transition-colors duration-150"
            :class="expanded === r.fullName ? 'border-primary/40' : ''"
          >
            <button
              class="flex w-full items-center gap-3 p-4 text-left"
              @click="toggleIssues(r)"
            >
              <svg
                class="h-4 w-4 shrink-0 text-t4 transition-transform duration-150"
                :class="expanded === r.fullName ? 'rotate-90' : ''"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
              <div class="min-w-0 flex-1">
                <p class="truncate font-mono text-sm font-semibold text-primary">{{ r.fullName }}</p>
                <p v-if="r.description" class="mt-0.5 truncate text-xs text-t4">{{ r.description }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-2.5 text-xs text-t4">
                <span
                  v-if="r.privateFlag"
                  class="flex items-center gap-1 rounded-md bg-warn/15 px-1.5 py-0.5 text-[10px] text-warn"
                >
                  私有
                </span>
                <span v-if="r.language" class="hidden items-center gap-1.5 sm:flex">
                  <span class="h-2.5 w-2.5 rounded-full" :style="{ background: langColor(r.language) }"></span>
                  {{ r.language }}
                </span>
                <span class="tabular-nums">★ {{ formatStars(r.stars) }}</span>
                <span
                  class="flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 tabular-nums"
                  :class="r.issues > 0 ? 'text-info' : 'text-t4'"
                  :title="`开放 Issue ${r.issues} 个`"
                >
                  <CircleDot class="h-3.5 w-3.5" />
                  {{ r.issues }}
                </span>
                <span class="hidden tabular-nums md:inline">{{ formatDate(r.updatedAt) }}</span>
              </div>
            </button>

            <div v-if="expanded === r.fullName" class="border-t border-line bg-inset px-4 py-3">
              <div v-if="issueState[r.fullName]?.loading" class="space-y-2">
                <div v-for="i in 3" :key="i" class="skeleton h-9 rounded-lg"></div>
              </div>
              <div v-else-if="issueState[r.fullName]?.error" class="text-xs text-danger">
                {{ issueState[r.fullName].error }}
              </div>
              <p v-else-if="issueState[r.fullName]?.list.length === 0" class="py-2 text-center text-xs text-t4">
                暂无开放的 Issue
              </p>
              <ul v-else class="space-y-1">
                <li v-for="issue in issueState[r.fullName].list" :key="issue.number">
                  <a
                    :href="issue.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-surface-2"
                  >
                    <CircleDot class="h-3.5 w-3.5 shrink-0 text-ok" />
                    <span class="min-w-0 flex-1 truncate text-xs text-t2">{{ issue.title }}</span>
                    <span class="hidden shrink-0 items-center gap-1 text-[11px] tabular-nums text-t4 sm:flex">
                      <MessageSquare class="h-3 w-3" />
                      {{ issue.comments }}
                    </span>
                    <span class="shrink-0 text-[11px] tabular-nums text-t4">{{ formatDate(issue.updatedAt) }}</span>
                  </a>
                </li>
                <li class="pt-1">
                  <a
                    :href="`${r.url}/issues`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-block px-2 text-[11px] font-medium text-primary hover:text-primary-strong"
                  >
                    查看全部 Issue →
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>

    <RepoModal :open="showModal" :entry="editing" @close="showModal = false" />
  </div>
</template>
