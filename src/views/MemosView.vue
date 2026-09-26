<script setup lang="ts">
import { confirmAction } from '@/lib/confirmAction'
import { computed, ref } from 'vue'
import {
  CalendarDays,
  ListPlus,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search as SearchIcon,
  StickyNote,
  Tag as TagIcon,
  Trash2,
} from '@lucide/vue'
import { addTask, tasks } from '@/stores/tasks'
import {
  addMemo,
  memoCardClass,
  memos,
  MEMO_COLORS,
  removeMemo,
  toggleMemoPin,
  updateMemo,
} from '@/stores/memos'
import MemoModal from '@/components/MemoModal.vue'
import CardActionMenu from '@/components/CardActionMenu.vue'
import PageHeader from '@/components/PageHeader.vue'
import { toast } from '@/lib/toast'
import { todayYMD } from '@/lib/utils'
import type { Memo } from '@/types'

const searchQ = ref('')
const activeTag = ref<string | null>(null)
const showModal = ref(false)
const editing = ref<Memo | null>(null)

function openCreate(): void {
  editing.value = null
  showModal.value = true
}

function openEdit(memo: Memo): void {
  editing.value = memo
  showModal.value = true
}

async function handleDelete(memo: Memo): Promise<void> {
  if (await confirmAction('确定删除这条便签吗？')) removeMemo(memo.id)
}

const TAG_RE = /#([\p{L}\p{N}_-]+)/gu

function extractTags(content: string): string[] {
  return [...content.matchAll(TAG_RE)].map((m) => m[1])
}

const allTags = computed(() => {
  const s = new Set<string>()
  for (const m of memos.value) {
    for (const t of extractTags(m.content)) s.add(t)
  }
  return [...s].sort()
})

function match(m: Memo): boolean {
  if (activeTag.value && !extractTags(m.content).includes(activeTag.value)) return false
  const q = searchQ.value.trim().toLowerCase()
  if (!q) return true
  return `${m.title} ${m.content}`.toLowerCase().includes(q)
}

const sorted = computed(() =>
  [...memos.value]
    .filter(match)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return b.updatedAt - a.updatedAt
    }),
)

const hasFilters = computed(() => Boolean(activeTag.value || searchQ.value.trim()))

function clearFilters(): void {
  activeTag.value = null
  searchQ.value = ''
}

function quickAdd(): void {
  const colors = MEMO_COLORS
  const pick = colors[memos.value.length % colors.length]?.key ?? 'slate'
  addMemo({ title: '', content: '新便签', color: pick, pinned: false })
}

interface MemoLine {
  type: 'check' | 'text'
  done: boolean
  text: string
}

function parseLines(memo: Memo): MemoLine[] {
  return memo.content.split('\n').map((line) => {
    const m = line.match(/^\[( |x|X)\]\s*(.*)$/)
    if (m) return { type: 'check' as const, done: m[1].toLowerCase() === 'x', text: m[2] }
    return { type: 'text' as const, done: false, text: line }
  })
}

function toggleCheckLine(memo: Memo, index: number): void {
  const lines = memo.content.split('\n')
  lines[index] = lines[index].replace(/^\[( |x|X)\]/, (p) =>
    p.toLowerCase() === '[x]' ? '[ ]' : '[x]',
  )
  updateMemo(memo.id, { content: lines.join('\n') })
}

function convertToTask(memo: Memo): void {
  const firstLine =
    memo.content
      .split('\n')
      .map((l) => l.replace(/^\[( |x|X)\]\s*/, '').trim())
      .find((l) => l.length > 0) ?? ''
  const title = (memo.title || firstLine || '备忘录任务').slice(0, 40)
  addTask({
    title,
    notes: memo.content,
    links: [{ kind: 'memos', id: memo.id }],
    date: todayYMD(),
    time: '',
    priority: 2,
    repeat: 'none',
    tags: extractTags(memo.content).slice(0, 3),
  })
  toast('已转为今日任务，去「计划」查看')
}

function scheduledTasks(memo: Memo) {
  return tasks.value.filter(task => task.date && task.links?.some(link => link.kind === 'memos' && link.id === memo.id)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
}
</script>

<template>
  <div>
    <PageHeader title="备忘录" eyebrow="日常">
      <template #description>共 {{ memos.length }} 条便签 · 支持 #标签 与 [ ] 清单语法</template>
      <template #actions>
        <RouterLink to="/calendar" class="ui-secondary-button gap-2"><CalendarDays class="h-4 w-4" />日历</RouterLink>
        <button class="ui-secondary-button gap-2" @click="quickAdd">
          <Plus class="mr-1 inline h-4 w-4" />
          快速新建
        </button>
        <button class="ui-primary-button" @click="openCreate">
          新建便签
        </button>
      </template>
    </PageHeader>

    <div v-if="memos.length > 0" class="control-bar mt-4">
      <label class="control-search w-full sm:w-52">
        <SearchIcon class="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-t4" />
        <input
          v-model="searchQ"
          placeholder="搜索标题 / 内容"
          aria-label="搜索便签"
          class="control-input py-2 pl-9 pr-3 text-xs"
        />
      </label>
      <div v-if="allTags.length > 0" class="filter-rail min-w-0 flex-1">
        <button
          v-for="tag in allTags"
          :key="tag"
          class="filter-chip"
          :class="{ 'is-active': activeTag === tag }"
          @click="activeTag = activeTag === tag ? null : tag"
        >
          <TagIcon class="h-3 w-3" />
          {{ tag }}
        </button>
      </div>
      <button
        v-if="hasFilters"
        class="filter-reset"
        @click="clearFilters"
      >
        清除筛选
      </button>
      <span class="ml-auto shrink-0 text-xs tabular-nums text-t4">显示 {{ sorted.length }} / {{ memos.length }} 条</span>
    </div>

    <div v-if="memos.length === 0" class="empty-state mt-8">
      <StickyNote class="mx-auto h-10 w-10 text-t4" />
      <p class="mt-4 text-sm font-medium text-t2">还没有任何便签</p>
      <p class="mt-1 text-xs text-t4">随手记工作要点、线索、灵感；支持 #标签 与 [ ] 清单</p>
      <button class="ui-primary-button mt-4" @click="openCreate">新建便签</button>
    </div>

    <div v-else-if="sorted.length === 0" class="empty-state mt-8">
      <SearchIcon class="mx-auto h-10 w-10 text-t4" />
      <p class="text-sm font-medium text-t2">没有匹配的便签</p>
      <p class="mt-1 text-xs text-t4">换个关键词或标签试试</p>
      <button class="ui-secondary-button mt-4 text-xs" @click="clearFilters">清除筛选</button>
    </div>

    <div v-else class="memo-grid mt-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
      <article
        v-for="m in sorted"
        :key="m.id"
        class="memo-card"
        :class="memoCardClass(m.color)"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <h3 class="truncate text-sm font-semibold text-t1" :title="m.title">{{ m.title || '无标题' }}</h3>
            <p v-if="m.pinned" class="mt-1 flex items-center gap-1 text-[10px] text-warn">
              <Pin class="h-3 w-3" />
              已置顶
            </p>
          </div>
          <CardActionMenu label="更多便签操作">
            <button class="menu-item" @click="toggleMemoPin(m.id)">
              <PinOff v-if="m.pinned" class="h-3.5 w-3.5" />
              <Pin v-else class="h-3.5 w-3.5" />
              {{ m.pinned ? '取消置顶' : '置顶' }}
            </button>
            <button class="menu-item is-primary" @click="convertToTask(m)">
              <ListPlus class="h-3.5 w-3.5" />
              转为任务
            </button>
            <button class="menu-item" @click="openEdit(m)">
              <Pencil class="h-3.5 w-3.5" />
              编辑
            </button>
            <button class="menu-item is-danger" @click="handleDelete(m)">
              <Trash2 class="h-3.5 w-3.5" />
              删除
            </button>
          </CardActionMenu>
        </div>

        <div class="memo-card-content mt-5 text-sm leading-relaxed text-t2">
          <template v-for="(line, idx) in parseLines(m)" :key="idx">
            <label
              v-if="line.type === 'check'"
              class="flex cursor-pointer items-start gap-2 py-0.5"
              @click.prevent="toggleCheckLine(m, idx)"
            >
              <span
                class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors duration-150"
                :class="line.done ? 'border-primary bg-primary' : 'border-t4'"
              >
                <svg v-if="line.done" viewBox="0 0 24 24" fill="none" stroke="var(--tk-ink)" stroke-width="3" class="h-2.5 w-2.5">
                  <path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span class="min-w-0 break-words text-xs" :class="line.done ? 'text-t4 line-through' : 'text-t2'">
                {{ line.text }}
              </span>
            </label>
            <p v-else-if="line.text" class="min-h-5 break-words">{{ line.text }}</p>
          </template>
        </div>

        <div class="mt-3 border-t border-line pt-2">
          <RouterLink :to="{ path: '/calendar', query: { memo: m.id } }" class="inline-flex min-h-11 items-center gap-2 text-xs text-primary hover:underline"><CalendarDays class="h-4 w-4" />安排到日历</RouterLink>
          <RouterLink v-for="task in scheduledTasks(m)" :key="task.id" :to="{ path: '/calendar', query: { date: task.date } }" class="flex min-h-11 items-center gap-2 text-xs text-t3 hover:text-primary"><span>{{ task.date.slice(5) }} {{ task.time || '不定时' }}</span><span class="min-w-0 truncate" :class="{ 'line-through': task.done }">{{ task.title }}</span><span v-if="task.done" class="shrink-0">已完成</span></RouterLink>
        </div>
        <div class="memo-card-footer flex items-center justify-between text-[11px] text-t4">
          <div class="flex min-w-0 flex-wrap items-center gap-1">
            <span
              v-for="tag in extractTags(m.content).slice(0, 3)"
              :key="tag"
              class="flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-primary"
            >
              <TagIcon class="h-2.5 w-2.5" />
              {{ tag }}
            </span>
            <span>{{ m.content.length }} 字</span>
          </div>
          <span class="shrink-0">
            {{ new Date(m.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }}
          </span>
        </div>
      </article>
    </div>

    <MemoModal :open="showModal" :entry="editing" @close="showModal = false" />
  </div>
</template>
