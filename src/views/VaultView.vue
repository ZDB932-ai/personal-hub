<script setup lang="ts">
import { confirmAction } from '@/lib/confirmAction'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from '@lucide/vue'
import { entries, removeEntry, toggleEntryPin, touchEntry } from '@/stores/vault'
import EntryModal from '@/components/EntryModal.vue'
import AppSelect from '@/components/AppSelect.vue'
import CardActionMenu from '@/components/CardActionMenu.vue'
import PageHeader from '@/components/PageHeader.vue'
import { generateTotp, parseTotpInput } from '@/lib/totp'
import {
  CATEGORY_BADGE,
  FILTER_CATEGORIES,
  formatDate,
} from '@/lib/utils'
import { copyText } from '@/lib/toast'
import type { VaultEntry } from '@/types'

const query = ref('')
const activeCat = ref('全部')
const showModal = ref(false)
const editing = ref<VaultEntry | null>(null)
const revealed = ref(new Set<string>())
const searchInput = ref<HTMLInputElement | null>(null)
const hideTimers = new Map<string, ReturnType<typeof setTimeout>>()

function openCreate() {
  editing.value = null
  showModal.value = true
}

function openEdit(item: VaultEntry) {
  editing.value = item
  showModal.value = true
}

async function handleDelete(item: VaultEntry) {
  if (await confirmAction(`确定删除「${item.title}」吗？`)) {
    removeEntry(item.id)
  }
}

function toggleReveal(id: string) {
  const next = new Set(revealed.value)
  const existing = hideTimers.get(id)
  if (existing) {
    clearTimeout(existing)
    hideTimers.delete(id)
  }
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
    hideTimers.set(
      id,
      setTimeout(() => {
        const s = new Set(revealed.value)
        s.delete(id)
        revealed.value = s
        hideTimers.delete(id)
      }, 20000),
    )
  }
  revealed.value = next
}

function onGlobalKey(e: KeyboardEvent) {
  if (e.key !== '/') return
  const target = e.target as HTMLElement
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  e.preventDefault()
  searchInput.value?.focus()
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

const sortBy = ref<'default' | 'recent' | 'name'>('default')
const sortOptions = [
  { value: 'default', label: '按更新' },
  { value: 'recent', label: '按使用' },
  { value: 'name', label: '按名称' },
]

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return entries.value
    .filter((e) => activeCat.value === '全部' || e.category === activeCat.value)
    .filter(
      (e) =>
        !q ||
        e.title.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        e.url.toLowerCase().includes(q) ||
        e.notes.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      if ((a.pinned ?? false) !== (b.pinned ?? false)) return a.pinned ? -1 : 1
      if (sortBy.value === 'recent') {
        return (b.lastUsedAt ?? b.updatedAt) - (a.lastUsedAt ?? a.updatedAt)
      }
      if (sortBy.value === 'name') return a.title.localeCompare(b.title, 'zh-CN')
      return b.updatedAt - a.updatedAt
    })
})

const hasFilters = computed(() => activeCat.value !== '全部' || Boolean(query.value.trim()))

function clearFilters(): void {
  activeCat.value = '全部'
  query.value = ''
}

function catCount(cat: string): number {
  if (cat === '全部') return entries.value.length
  return entries.value.filter((e) => e.category === cat).length
}

const totpCodes = ref<Record<string, { code: string; remaining: number; period: number }>>({})
const totpRevealed = ref(new Set<string>())
const nowTick = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | undefined

async function refreshTotp(): Promise<void> {
  for (const e of entries.value) {
    if (!e.totp || !totpRevealed.value.has(e.id)) continue
    try {
      const cfg = parseTotpInput(e.totp)
      const r = await generateTotp(cfg, nowTick.value)
      totpCodes.value[e.id] = { ...r, period: cfg.period }
    } catch {
      totpCodes.value[e.id] = { code: '------', remaining: 0, period: 30 }
    }
  }
}

function toggleTotpReveal(id: string): void {
  const next = new Set(totpRevealed.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
    nowTick.value = Date.now()
  }
  totpRevealed.value = next
  void refreshTotp()
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKey)
  void refreshTotp()
  tickTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKey)
  if (tickTimer) clearInterval(tickTimer)
  for (const t of hideTimers.values()) clearTimeout(t)
})

watch([nowTick, entries], () => void refreshTotp())

function formatCode(code: string): string {
  return code.match(/.{1,3}/g)?.join(' ') ?? code
}
</script>

<template>
  <div>
    <PageHeader title="密码库" eyebrow="隐私">
      <template #description>共 {{ entries.length }} 条账号记录</template>
      <template #actions>
        <button class="ui-primary-button gap-2" @click="openCreate">
          <Plus class="h-4 w-4" />
          新增账号
        </button>
      </template>
    </PageHeader>

    <div class="control-bar mt-4">
      <label class="control-search w-full sm:w-64">
        <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t4" />
        <input
          ref="searchInput"
          v-model="query"
          placeholder="搜索名称 / 用户名 / 备注（按 / 聚焦）"
          aria-label="搜索密码库"
          class="control-input py-2 pl-9 pr-10 text-xs"
        />
        <button
          v-if="query"
          aria-label="清除搜索"
          class="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-t4 transition hover:bg-surface-2 hover:text-t2"
          @click="query = ''; searchInput?.focus()"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </label>
      <div class="w-24 shrink-0">
        <AppSelect v-model="sortBy" :options="sortOptions" size="sm" />
      </div>
      <div class="filter-rail min-w-0 flex-1">
        <button
          v-for="cat in FILTER_CATEGORIES"
          :key="cat"
          class="filter-chip"
          :class="{ 'is-active': activeCat === cat }"
          @click="activeCat = cat"
        >
          {{ cat }}
          <span class="opacity-60">{{ catCount(cat) }}</span>
        </button>
      </div>
      <button v-if="hasFilters" class="filter-reset" @click="clearFilters">清除筛选</button>
      <span class="ml-auto shrink-0 text-xs tabular-nums text-t4">显示 {{ filtered.length }} / {{ entries.length }} 项</span>
    </div>

    <div v-if="entries.length === 0" class="empty-state mt-8">
      <KeyRound class="mx-auto h-10 w-10 text-t4" />
      <p class="mt-4 text-sm font-medium text-t2">还没有保存任何账号</p>
      <p class="mt-1 text-xs text-t4">点击右上角「新增账号」，保存你的第一个账号密码</p>
      <button class="ui-primary-button mt-4" @click="openCreate">新增账号</button>
    </div>

    <div v-else-if="filtered.length === 0" class="empty-state mt-8">
      <Search class="mx-auto h-10 w-10 text-t4" />
      <p class="mt-4 text-sm font-medium text-t2">没有匹配的结果</p>
      <p class="mt-1 text-xs text-t4">换个关键词，或清除筛选条件试试</p>
      <button class="ui-secondary-button mt-4 text-xs" @click="clearFilters">清除筛选</button>
    </div>

    <div v-else class="vault-card-grid mt-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      <article
        v-for="item in filtered"
        :key="item.id"
        class="vault-card relative"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 items-center gap-3">
            <span
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-base font-bold text-primary"
            >
              {{ (item.title || '?').charAt(0).toUpperCase() || '?' }}
            </span>
            <div class="min-w-0">
              <p class="truncate font-medium">{{ item.title }}</p>
              <a
                v-if="item.url"
                :href="item.url"
                target="_blank"
                rel="noopener noreferrer"
                class="block truncate text-xs text-t4 underline-offset-2 hover:text-primary hover:underline"
              >
                {{ hostOf(item.url) }}
              </a>
            </div>
          </div>
          <CardActionMenu label="更多账号操作">
            <button class="menu-item" @click="toggleEntryPin(item.id)">
              <Star class="h-3.5 w-3.5" />
              {{ item.pinned ? '取消置顶' : '置顶' }}
            </button>
            <button class="menu-item" @click="openEdit(item)">
              <Pencil class="h-3.5 w-3.5" />
              编辑
            </button>
            <button class="menu-item is-danger" @click="handleDelete(item)">
              <Trash2 class="h-3.5 w-3.5" />
              删除
            </button>
          </CardActionMenu>
        </div>

        <div class="vault-secrets mt-5 text-sm">
          <div class="vault-secret-row">
            <span class="truncate text-t2">{{ item.username }}</span>
            <button
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-t4 transition hover:bg-surface-2 hover:text-primary"
              aria-label="复制用户名"
              @click="touchEntry(item.id); copyText(item.username, '用户名')"
            >
              <Copy class="h-3.5 w-3.5" />
            </button>
          </div>
          <div class="vault-secret-row">
            <span class="truncate font-mono text-t2">
              {{ revealed.has(item.id) ? item.password : '••••••••••••' }}
            </span>
            <div class="flex shrink-0 items-center gap-0.5">
              <button
                class="flex h-9 w-9 items-center justify-center rounded-md text-t4 transition hover:bg-surface-2 hover:text-t2"
                :aria-label="revealed.has(item.id) ? '隐藏密码' : '显示密码'"
                :aria-pressed="revealed.has(item.id)"
                @click="toggleReveal(item.id); touchEntry(item.id)"
              >
                <EyeOff v-if="revealed.has(item.id)" class="h-3.5 w-3.5" />
                <Eye v-else class="h-3.5 w-3.5" />
              </button>
              <button
                class="flex h-9 w-9 items-center justify-center rounded-md text-t4 transition hover:bg-surface-2 hover:text-primary"
                aria-label="复制密码"
                @click="touchEntry(item.id); copyText(item.password, '密码')"
              >
                <Copy class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="item.totp && !totpRevealed.has(item.id)"
          class="vault-totp-row flex w-full items-center justify-between gap-2 px-3 py-2"
        >
          <span class="flex items-center gap-2 text-xs text-t4">
            <ShieldCheck class="h-3.5 w-3.5" />
            已绑定两步验证
          </span>
          <button
              class="min-h-9 rounded-md px-2 text-xs font-medium text-primary transition-colors duration-150 hover:bg-primary/10"
            @click="toggleTotpReveal(item.id)"
          >
            显示动态码
          </button>
        </div>
        <div
          v-else-if="item.totp && totpRevealed.has(item.id) && totpCodes[item.id]"
          class="vault-totp-row flex items-center justify-between gap-2 px-3 py-2"
        >
          <div class="flex items-center gap-2.5">
            <svg width="26" height="26" viewBox="0 0 26 26" class="-rotate-90">
              <circle cx="13" cy="13" r="10" fill="none" stroke="var(--tk-line)" stroke-width="3" />
              <circle
                cx="13"
                cy="13"
                r="10"
                fill="none"
                stroke="var(--tk-primary)"
                stroke-width="3"
                stroke-linecap="round"
                :stroke-dasharray="2 * Math.PI * 10"
                :stroke-dashoffset="
                  2 * Math.PI * 10 * (1 - totpCodes[item.id].remaining / (totpCodes[item.id].period || 30))
                "
              />
            </svg>
            <span class="font-mono text-sm tracking-[0.18em] text-primary">
              {{ formatCode(totpCodes[item.id].code) }}
            </span>
          </div>
          <div class="flex shrink-0 items-center gap-0.5">
            <button
                class="flex h-9 w-9 items-center justify-center rounded-md text-t4 transition hover:bg-surface-2 hover:text-primary"
                aria-label="复制验证码"
              @click="touchEntry(item.id); copyText(totpCodes[item.id].code, '验证码')"
            >
              <Copy class="h-3.5 w-3.5" />
            </button>
            <button
                class="flex h-9 w-9 items-center justify-center rounded-md text-t4 transition hover:bg-surface-2 hover:text-t2"
                aria-label="隐藏验证码"
              @click="toggleTotpReveal(item.id)"
            >
              <EyeOff class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <p v-if="item.notes" class="mt-3 line-clamp-1 text-xs text-t4" :title="item.notes">
          {{ item.notes }}
        </p>

        <div class="vault-card-footer flex items-center justify-between">
          <span
            class="rounded-lg border px-2.5 py-1 text-xs"
            :class="CATEGORY_BADGE[item.category] ?? CATEGORY_BADGE['其他']"
          >
            {{ item.category }}
          </span>
          <span class="text-xs text-t4">{{ formatDate(item.updatedAt) }}</span>
        </div>
      </article>
    </div>

    <EntryModal :open="showModal" :entry="editing" @close="showModal = false" />
  </div>
</template>
