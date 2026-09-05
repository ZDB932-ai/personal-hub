<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useRoute } from 'vue-router'
import {
  Bot,
  Boxes,
  CalendarCheck,
  ChevronRight,
  FolderGit2,
  FolderLock,
  KeyRound,
  LayoutDashboard,
  Lock,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  StickyNote,
  X,
} from '@lucide/vue'
import ToastHost from './components/ToastHost.vue'
import LockScreen from './components/LockScreen.vue'
import SettingsModal from './components/SettingsModal.vue'
import { isGated, lockApp } from './stores/lock'
import { bindAutoPush, isSyncConfigured, syncConfig, syncNow, syncing } from './lib/sync'
import { bindNativeScheduleWatcher, startReminders, stopReminders } from './lib/reminders'
import { wallpaperConfig, wallpaperUrl } from './lib/wallpaper'
import { toast } from './lib/toast'
import { isTauriDesktop, openExternalUrl } from './lib/desktop'

const route = useRoute()
const showSettings = ref(false)
const mobileMoreOpen = ref(false)

const dashboardNav = { to: '/', label: '总览', icon: LayoutDashboard }
const todayNav = { to: '/today', label: '计划', icon: CalendarCheck }
const memosNav = { to: '/memos', label: '备忘录', icon: StickyNote }
const reposNav = { to: '/repos', label: '仓库', icon: FolderGit2 }
const aiNav = { to: '/ai', label: 'AI', icon: Bot }
const agentLibraryNav = { to: '/agent-library', label: 'Agent 资源库', icon: Boxes }
const docsNav = { to: '/docs', label: '资料库', icon: FolderLock }
const vaultNav = { to: '/vault', label: '密码库', icon: KeyRound }

const navGroups = [
  { label: '工作区', items: [dashboardNav, todayNav, memosNav] },
  { label: '资源', items: [reposNav, aiNav, agentLibraryNav, docsNav] },
  { label: '隐私', items: [vaultNav] },
]

const mobileNavItems = [dashboardNav, todayNav, memosNav, aiNav, vaultNav]
const mobileOverflowItems = [reposNav, agentLibraryNav, docsNav]
const isOverflowRoute = computed(() => mobileOverflowItems.some((item) => item.to === route.path))

function handleLock() {
  mobileMoreOpen.value = false
  lockApp()
  toast('已锁定')
}

function openSettings() {
  mobileMoreOpen.value = false
  showSettings.value = true
}

function handleExternalLink(event: MouseEvent): void {
  if (!isTauriDesktop()) return
  const source = event.target
  if (!(source instanceof Element)) return
  const anchor = source.closest<HTMLAnchorElement>('a[target="_blank"][href]')
  if (!anchor || !/^https?:\/\//i.test(anchor.href)) return
  event.preventDefault()
  void openExternalUrl(anchor.href)
}

let unbindAutoPush: (() => void) | null = null
let unbindNativeSchedule: (() => void) | null = null
let unlistenDesktopLock: (() => void) | null = null

onMounted(() => {
  document.addEventListener('click', handleExternalLink)
  unbindAutoPush = bindAutoPush()
  unbindNativeSchedule = bindNativeScheduleWatcher()
  if (isTauriDesktop()) {
    void import('@tauri-apps/api/event')
      .then(({ listen }) => listen('desktop://lock', () => handleLock()))
      .then((unlisten) => {
        unlistenDesktopLock = unlisten
      })
      .catch(() => {})
  }
  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/local-notifications').then(({ LocalNotifications }) =>
      LocalNotifications.addListener('localNotificationActionPerformed', () => {
        location.hash = '#/today'
      }),
    )
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleExternalLink)
  stopReminders()
  unbindAutoPush?.()
  unbindNativeSchedule?.()
  unlistenDesktopLock?.()
})

watch(
  isGated,
  (gated) => {
    if (!gated) {
      if (!Capacitor.isNativePlatform()) startReminders()
      void import('./lib/aiopencode').then(({ hydrateAiSecrets }) => hydrateAiSecrets().catch(() => {}))
      if (isSyncConfigured.value && syncConfig.value?.autoSync) {
        void syncNow()
      }
      return
    }
    stopReminders()
    void import('./lib/aiopencode').then(({ clearAiSecretsFromMemory }) => clearAiSecretsFromMemory())
  },
  { immediate: true },
)
</script>

<template>
  <LockScreen v-if="isGated" />

  <div v-else class="relative min-h-screen">
    <div
      v-if="wallpaperUrl"
      class="pointer-events-none fixed inset-0 z-0 bg-cover bg-center"
      :style="{ backgroundImage: `url('${wallpaperUrl}')` }"
    ></div>
    <div
      v-if="wallpaperUrl"
      class="pointer-events-none fixed inset-0 z-0"
      :style="{ background: `color-mix(in srgb, var(--tk-body) ${wallpaperConfig.dim}%, transparent)` }"
    ></div>

    <aside class="app-sidebar desktop-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-chrome md:flex">
      <div class="sidebar-brand">
        <div class="sidebar-brand-mark">
          P
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-t1">Personal Hub</p>
          <p class="mt-0.5 text-xs text-t4">个人信息管理台</p>
        </div>
      </div>

      <nav class="sidebar-nav" aria-label="主导航">
        <section v-for="group in navGroups" :key="group.label" class="sidebar-group">
          <p class="sidebar-group-label">
            {{ group.label }}
          </p>
          <div class="sidebar-nav-list">
            <RouterLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              :aria-current="route.path === item.to ? 'page' : undefined"
              class="sidebar-link"
              :class="{ 'is-active': route.path === item.to }"
            >
              <span class="sidebar-link-icon">
                <component :is="item.icon" class="h-4 w-4 shrink-0" />
              </span>
              <span class="min-w-0 truncate">{{ item.label }}</span>
            </RouterLink>
          </div>
        </section>
      </nav>

      <div class="sidebar-footer">
        <button
          class="sidebar-security"
          @click="openSettings"
        >
          <ShieldCheck class="h-4 w-4 shrink-0 text-ok" />
          <span class="min-w-0 flex-1">本机加密</span>
          <span class="shrink-0 text-[10px]">{{ syncing ? '同步中' : isSyncConfigured ? '已同步' : '仅本机' }}</span>
        </button>
        <div class="mt-2 flex gap-2">
          <button
            class="ui-secondary-button flex-1 gap-1.5 text-xs"
            @click="openSettings"
          >
            <Settings class="h-3.5 w-3.5" />
            设置
          </button>
          <button
            class="ui-secondary-button flex-1 gap-1.5 text-xs"
            @click="handleLock"
          >
            <Lock class="h-3.5 w-3.5" />
            锁定
          </button>
        </div>
      </div>
    </aside>

    <header
      class="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-chrome px-4 py-3 md:hidden"
    >
      <div class="flex items-center gap-2.5">
        <div
          class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-ink"
        >
          P
        </div>
        <span class="text-sm font-semibold">Personal Hub</span>
      </div>
      <div class="flex items-center gap-1">
        <button
          aria-label="打开设置"
          class="flex h-10 w-10 items-center justify-center rounded-lg text-t3 transition-colors duration-150 hover:bg-surface hover:text-t2"
          @click="openSettings"
        >
          <Settings class="h-4 w-4" />
        </button>
        <button
          aria-label="锁定应用"
          class="flex h-10 w-10 items-center justify-center rounded-lg text-t3 transition-colors duration-150 hover:bg-surface hover:text-t2"
          @click="handleLock"
        >
          <Lock class="h-4 w-4" />
        </button>
      </div>
    </header>

    <main class="desktop-main relative z-10 min-w-0 pb-24 md:pb-10 md:pl-64">
      <div class="mx-auto w-full max-w-7xl px-4 py-6 md:px-10 md:py-9">
        <RouterView v-slot="{ Component }">
          <Transition name="route" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </div>
    </main>

    <nav
      class="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line bg-chrome px-1 pb-[env(safe-area-inset-bottom)] pt-1.5 md:hidden"
    >
      <RouterLink
        v-for="item in mobileNavItems"
        :key="item.to"
        :to="item.to"
        :aria-current="route.path === item.to ? 'page' : undefined"
        class="flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border border-transparent px-1 py-1 text-[11px] font-medium transition-colors duration-150"
        :class="route.path === item.to ? 'border-primary/50 bg-primary/12 text-primary' : 'text-t4'"
      >
        <component :is="item.icon" class="h-4 w-4" />
        {{ item.label }}
      </RouterLink>
      <button
        type="button"
        aria-label="打开更多导航"
        :aria-expanded="mobileMoreOpen"
        class="flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border border-transparent px-1 py-1 text-[11px] font-medium transition-colors duration-150"
        :class="mobileMoreOpen || isOverflowRoute ? 'border-primary/50 bg-primary/12 text-primary' : 'text-t4'"
        @click="mobileMoreOpen = !mobileMoreOpen"
      >
        <MoreHorizontal class="h-4 w-4" />
        更多
      </button>
    </nav>

    <Transition name="sheet">
      <div v-if="mobileMoreOpen" class="fixed inset-0 z-50 md:hidden">
        <button
          aria-label="关闭更多导航"
          class="absolute inset-0 bg-black/60"
          @click="mobileMoreOpen = false"
        ></button>
        <section
          role="dialog"
          aria-modal="true"
          aria-label="更多导航"
          class="absolute inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] border-y border-line bg-elevated px-4 pb-4 pt-3"
        >
          <div class="mx-auto h-px w-10 bg-line"></div>
          <div class="mt-3 flex items-center justify-between">
            <p class="text-sm font-semibold text-t1">更多</p>
            <button
              aria-label="关闭更多导航"
              class="flex h-10 w-10 items-center justify-center rounded-lg text-t4 transition-colors duration-150 hover:bg-surface hover:text-t2"
              @click="mobileMoreOpen = false"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
          <div class="mt-2 grid grid-cols-2 gap-2">
            <RouterLink
              v-for="item in mobileOverflowItems"
              :key="item.to"
              :to="item.to"
              class="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-t2"
              @click="mobileMoreOpen = false"
            >
              <component :is="item.icon" class="h-4 w-4 text-primary" />
              <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
              <ChevronRight class="h-4 w-4 text-t4" />
            </RouterLink>
          </div>
          <div class="mt-2 grid grid-cols-2 gap-2 border-t border-line pt-3">
            <button class="ui-secondary-button gap-2 text-xs" @click="openSettings">
              <Settings class="h-4 w-4" />
              设置
            </button>
            <button class="ui-danger-button gap-2 text-xs" @click="handleLock">
              <Lock class="h-4 w-4" />
              锁定
            </button>
          </div>
        </section>
      </div>
    </Transition>

    <SettingsModal :open="showSettings" @close="showSettings = false" />
    <ToastHost />
  </div>
</template>
