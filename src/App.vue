<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useRoute } from 'vue-router'
import AppNavigation from './components/AppNavigation.vue'
import ProfileModal from './components/ProfileModal.vue'
import './hub-workspace.css'
import ToastHost from './components/ToastHost.vue'
import StorageWarning from './components/StorageWarning.vue'
import HubTools from './components/HubTools.vue'
import { hubSearchOpen } from './stores/hub'
import LockScreen from './components/LockScreen.vue'
import SettingsModal from './components/SettingsModal.vue'
import WallpaperLayer from './components/WallpaperLayer.vue'
import { isGated, lockApp } from './stores/lock'
import { bindAutoPush, isSyncConfigured, syncConfig, syncNow } from './lib/sync'
import { bindNativeScheduleWatcher, reminderError, retryReminders, startReminders, stopReminders } from './lib/reminders'
import { wallpaperConfig, wallpaperUrl, wallpaperPanelStyle } from './lib/wallpaper'
import { toast } from './lib/toast'
import { isTauriDesktop, openExternalUrl } from './lib/desktop'

const route = useRoute()
const focusActive = computed(() => route.path === '/focus' && typeof route.query.task === 'string')
const showSettings = ref(false)
const settingsTab = ref<'appearance' | 'security' | 'sync'>('appearance')
const showProfile = ref(false)
const navigationCollapsed = ref((() => { try { return localStorage.getItem('xk.navigation.collapsed') === 'true' } catch { return false } })())
watch(navigationCollapsed, value => { try { localStorage.setItem('xk.navigation.collapsed', String(value)) } catch {} })

async function handleLock() {
  try { await lockApp(); toast('已锁定') }
  catch { toast('保存失败，暂未锁定，请检查本机存储空间', 'error') }
}

function openSettings(tab: 'appearance' | 'security' | 'sync' = 'appearance') { settingsTab.value = tab; showSettings.value = true }

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

  <div v-if="!isGated" class="hub-shell relative min-h-screen" :style="wallpaperPanelStyle" :class="{ 'nav-collapsed': navigationCollapsed, 'focus-active': focusActive, 'calendar-app-shell': route.path === '/calendar', 'has-wallpaper': wallpaperUrl, 'wallpaper-reading': wallpaperUrl && wallpaperConfig.readingSurface && !wallpaperConfig.transparentPanels, 'transparent-panels': wallpaperUrl && wallpaperConfig.transparentPanels }">
    <WallpaperLayer />

    <AppNavigation v-if="!focusActive" v-model:collapsed="navigationCollapsed" @search="hubSearchOpen = true" @settings="openSettings" @profile="showProfile = true" @lock="handleLock" />

    <main class="desktop-main relative z-10 min-w-0 pb-24 md:pb-10 md:pl-64">
      <div class="mx-auto w-full max-w-7xl px-4 py-6 md:px-10 md:py-9" :class="{ 'calendar-page-frame': route.path === '/calendar' }">
        <RouterView v-slot="{ Component }">
          <Transition name="route" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </div>
    </main>

    <ProfileModal :open="showProfile" @close="showProfile = false" />
    <SettingsModal :open="showSettings" :initial-tab="settingsTab" @close="showSettings = false" />
    <HubTools />
    <ToastHost />
    <StorageWarning v-if="!isGated" />
  </div>
</template>
