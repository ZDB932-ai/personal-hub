<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useRoute } from 'vue-router'
import {
  Bot,
  Boxes,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  FolderGit2,
  FolderLock,
  KeyRound,
  LayoutDashboard,
  Lock,
  MoreHorizontal,
  Settings,
  Search,
  ShieldCheck,
  StickyNote,
  X,
} from '@lucide/vue'
import ToastHost from './components/ToastHost.vue'
import StorageWarning from './components/StorageWarning.vue'
import HubTools from './components/HubTools.vue'
import { hubSearchOpen } from './stores/hub'
import LockScreen from './components/LockScreen.vue'
import SettingsModal from './components/SettingsModal.vue'
import WallpaperLayer from './components/WallpaperLayer.vue'
import { isGated, lockApp } from './stores/lock'
import { bindAutoPush, isSyncConfigured, syncConfig, syncNow, syncStatusText } from './lib/sync'
import { bindNativeScheduleWatcher, reminderError, retryReminders, startReminders, stopReminders } from './lib/reminders'
import { wallpaperConfig, wallpaperUrl, wallpaperPanelStyle } from './lib/wallpaper'
import { toast } from './lib/toast'
import { isTauriDesktop, openExternalUrl } from './lib/desktop'

const route = useRoute()
const showSettings = ref(false)
const mobileMoreOpen = ref(false)

const dashboardNav = { to: '/', label: '总览', icon: LayoutDashboard }
const todayNav = { to: '/today', label: '计划', icon: CalendarCheck }
const calendarNav = { to: '/calendar', label: '日历', icon: CalendarDays }
const memosNav = { to: '/memos', label: '备忘录', icon: StickyNote }
const reposNav = { to: '/repos', label: '仓库', icon: FolderGit2 }
const aiNav = { to: '/ai', label: 'AI', icon: Bot }
const agentLibraryNav = { to: '/agent-library', label: 'Agent 资源库', icon: Boxes }
const docsNav = { to: '/docs', label: '资料库', icon: FolderLock }
const vaultNav = { to: '/vault', label: '密码库', icon: KeyRound }

const navGroups = [
  { label: '工作区', items: [dashboardNav, todayNav, calendarNav, memosNav] },
  { label: '资源', items: [reposNav, aiNav, agentLibraryNav, docsNav] },
  { label: '隐私', items: [vaultNav] },
]

const mobileNavItems = [dashboardNav, todayNav, memosNav, aiNav, vaultNav]
const mobileOverflowItems = [calendarNav, reposNav, agentLibraryNav, docsNav]
const isOverflowRoute = computed(() => mobileOverflowItems.some((item) => item.to === route.path))

async function handleLock() {
  mobileMoreOpen.value = false
  try {
    await lockApp()
    toast('已锁定')
  } catch {
    toast('保存失败，暂未锁定，请检查本机存储空间', 'error')
  }
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
  unbindNativeSchedule = bindNativeScheduleWatcher(() => !isGated.value)
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
  <div v-if="!isGated && reminderError" role="alert" class="fixed inset-x-4 top-4 z-[100] mx-auto max-w-xl rounded-xl border border-warn/40 bg-surface p-4 text-sm text-t1">
    <p class="text-warn">{{ reminderError }}</p>
    <button class="mt-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-t2" @click="retryReminders">重试提醒</button>
  </div>

  <div v-else class="relative min-h-screen" :style="wallpaperPanelStyle" :class="{ 'calendar-app-shell': route.path === '/calendar', 'has-wallpaper': wallpaperUrl, 'wallpaper-reading': wallpaperUrl && wallpaperConfig.readingSurface && !wallpaperConfig.transparentPanels, 'transparent-panels': wallpaperUrl && wallpaperConfig.transparentPanels }">
    <WallpaperLayer />

    <aside v-if="route.path === '/calendar'" class="calendar-app-rail">
      <RouterLink to="/" class="calendar-rail-home" aria-label="返回总览" title="返回总览"><img src="/app-icon.png" alt="" class="h-8 w-8" /></RouterLink>
      <nav aria-label="主导航" class="calendar-rail-links">
        <RouterLink v-for="item in navGroups.flatMap(group => group.items)" :key="item.to" :to="item.to" class="calendar-rail-link" :class="{ 'is-active': route.path === item.to }" :aria-label="item.label" :title="item.label" :aria-current="route.path === item.to ? 'page' : undefined"><component :is="item.icon" class="h-5 w-5" /></RouterLink>
      </nav>
      <div class="calendar-rail-footer"><button class="calendar-rail-link" aria-label="搜索与收集" title="搜索与收集" @click="hubSearchOpen = true"><Search class="h-5 w-5" /></button><button class="calendar-rail-link" aria-label="设置" title="设置" @click="openSettings"><Settings class="h-5 w-5" /></button><button class="calendar-rail-link" aria-label="锁定" title="锁定" @click="handleLock"><Lock class="h-5 w-5" /></button></div>
    </aside>
    <aside v-else class="app-sidebar desktop-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-chrome md:flex">
      <div class="sidebar-brand">
        <img src="/app-icon.png" alt="" class="sidebar-brand-mark" />
        <div class="min-w-0">
          <p class="text-sm font-semibold text-t1">Personal Hub</p>
          <p class="mt-0.5 text-xs text-t4">个人信息管理台</p>
        </div>
      </div>

      <nav class="sidebar-nav" aria-label="主导航">
        <button class="ui-secondary-button mb-4 w-full gap-2" @click="hubSearchOpen = true"><Search class="h-4 w-4" />搜索与收集 <span class="ml-auto text-xs text-t4">Ctrl K</span></button>
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
          <span class="shrink-0 text-[10px]">{{ syncStatusText }}</span>
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
        <img src="/app-icon.png" alt="" class="h-8 w-8 rounded-lg" />
        <span class="text-sm font-semibold">Personal Hub</span>
      </div>
      <div class="flex items-center gap-1">
        <button aria-label="搜索与收集" class="ui-icon-button h-11 w-11" @click="hubSearchOpen = true"><Search class="h-4 w-4" /></button>
        <button
          aria-label="打开设置"
          class="flex h-11 w-11 items-center justify-center rounded-lg text-t3 transition-colors duration-150 hover:bg-surface hover:text-t2"
          @click="openSettings"
        >
          <Settings class="h-4 w-4" />
        </button>
        <button
          aria-label="锁定应用"
          class="flex h-11 w-11 items-center justify-center rounded-lg text-t3 transition-colors duration-150 hover:bg-surface hover:text-t2"
          @click="handleLock"
        >
          <Lock class="h-4 w-4" />
        </button>
      </div>
    </header>

    <main class="desktop-main relative z-10 min-w-0 pb-24 md:pb-10 md:pl-64">
      <div class="mx-auto w-full max-w-7xl px-4 py-6 md:px-10 md:py-9" :class="{ 'calendar-page-frame': route.path === '/calendar' }">
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
    <HubTools />
    <ToastHost />
    <StorageWarning v-if="!isGated" />
  </div>
</template>

<style>
.calendar-app-rail { display: none; }
html .calendar-app-shell .desktop-main > .calendar-page-frame { max-width: none; min-height: 0; padding: 0; border: 0; background: transparent; }
html .calendar-app-shell .desktop-main { padding: 8px 8px calc(64px + env(safe-area-inset-bottom)); }
@media (min-width: 768px) {
  html .calendar-app-shell .desktop-main { padding: 12px 12px 12px 76px; }
  .calendar-app-rail { position: fixed; inset: 12px auto 12px 8px; z-index: 40; display: flex; width: 56px; flex-direction: column; align-items: center; gap: 16px; overflow-y: auto; }
  .calendar-rail-home, .calendar-rail-link { display: flex; width: 44px; min-height: 44px; align-items: center; justify-content: center; border-radius: 12px; color: var(--tk-t3); }
  .calendar-rail-links, .calendar-rail-footer { display: flex; flex-direction: column; gap: 4px; }
  .calendar-rail-footer { margin-top: auto; }
  .calendar-rail-link:hover { background: var(--tk-surface-2); color: var(--tk-t1); }
  .calendar-rail-link.is-active { background: color-mix(in srgb, var(--tk-primary) 12%, var(--tk-surface)); color: var(--tk-primary); }
}
</style>
