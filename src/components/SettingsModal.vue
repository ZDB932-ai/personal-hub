<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowLeft, ChevronRight, Cloud, DatabaseBackup, Heart, Info, ListTodo, Palette, Search, Settings, ShieldCheck, UserRound, X } from '@lucide/vue'
import { isTauriDesktop } from '@/lib/desktop'
import { SETTINGS_SECTIONS, searchSettings, type SettingsDestination, type SettingsKey } from '@/lib/settingsCatalog'
import { interfaceStyle, INTERFACE_STYLES } from '@/stores/theme'
import { databaseBusy } from '@/stores/database'
import ModalShell from '@/components/ModalShell.vue'
import AsyncPanel from '@/components/AsyncPanel.vue'

const props = defineProps<{ open: boolean; initialTab?: SettingsKey }>()
const emit = defineEmits<{ close: [] }>()
const desktop = isTauriDesktop()
const tab = ref<SettingsKey>('appearance')
const query = ref('')
const mobileDetail = ref(false)
const content = ref<HTMLElement | null>(null)
const navigation = ref<HTMLElement | null>(null)
const visited = ref(new Set<SettingsKey>())
const appearanceCategory = ref<string>()
const selectedResult = ref('')
const sections = SETTINGS_SECTIONS.filter(item => desktop || !item.desktopOnly)
const groups = ['个性化', '账户与数据', '帮助'] as const
const current = computed(() => sections.find(item => item.key === tab.value) ?? sections[0]!)
const currentStyle = computed(() => INTERFACE_STYLES.find(item => item.key === interfaceStyle.value)?.label)
const results = computed(() => searchSettings(query.value, desktop))
const searching = computed(() => query.value.trim().length > 0)
const icons = { appearance: Palette, pet: Heart, desktop: ListTodo, account: UserRound, security: ShieldCheck, backup: DatabaseBackup, sync: Cloud, about: Info }
const loaders = {
  appearance: () => import('@/components/settings/AppearanceSection.vue'),
  pet: () => import('@/components/settings/PetSection.vue'),
  desktop: () => import('@/components/settings/DesktopSection.vue'),
  account: () => import('@/components/settings/AccountSection.vue'),
  security: () => import('@/components/settings/SecuritySection.vue'),
  backup: () => import('@/components/settings/BackupPanel.vue'),
  sync: () => import('@/components/settings/SyncSection.vue'),
  about: () => import('@/components/settings/AboutSection.vue'),
}

function close(): void {
  if (!databaseBusy.value) emit('close')
}

async function select(key: SettingsKey, result?: SettingsDestination): Promise<void> {
  if (databaseBusy.value) return
  tab.value = key
  visited.value.add(key)
  selectedResult.value = result?.id ?? ''
  appearanceCategory.value = undefined
  mobileDetail.value = true
  await nextTick()
  if (result?.category) appearanceCategory.value = result.category
  if (content.value) content.value.scrollTop = 0
  content.value?.querySelector<HTMLElement>('.settings-page-title')?.focus({ preventScroll: true })
}

async function back(): Promise<void> {
  mobileDetail.value = false
  await nextTick()
  navigation.value?.querySelector<HTMLElement>('[aria-current="page"]')?.focus({ preventScroll: true })
}

function escape(): boolean {
  if (window.innerWidth >= 800 || !mobileDetail.value) return false
  if (!databaseBusy.value) void back()
  return true
}

function navigate(event: KeyboardEvent): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !(event.target instanceof HTMLButtonElement)) return
  const buttons = Array.from(navigation.value?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []).filter(item => item.getClientRects().length > 0)
  const index = buttons.indexOf(event.target)
  if (index < 0 || !buttons.length) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
  buttons[next]?.focus()
}

watch(() => props.open, open => {
  query.value = ''
  selectedResult.value = ''
  appearanceCategory.value = undefined
  if (open) {
    const initial = sections.some(item => item.key === props.initialTab) ? props.initialTab : undefined
    tab.value = initial ?? tab.value
    visited.value = new Set([tab.value])
    mobileDetail.value = Boolean(initial)
  } else visited.value.clear()
}, { immediate: true })

watch(() => props.initialTab, key => {
  if (props.open && key && sections.some(item => item.key === key)) void select(key)
})
</script>

<template>
  <ModalShell :open="open" max-width="max-w-6xl" label="设置" :escape-handler="escape" mobile-sheet panel-class="settings-panel" @close="close">
    <template #header>
      <div class="settings-window-heading">
        <div class="settings-window-title">
          <button v-if="mobileDetail" type="button" class="settings-back ui-icon-button" aria-label="返回设置分类" :disabled="databaseBusy" @click="back"><ArrowLeft class="h-5 w-5" /></button>
          <Settings class="settings-heading-icon h-5 w-5" aria-hidden="true" />
          <h2>设置</h2>
          <span class="settings-product-name">Personal Hub</span>
        </div>
        <div class="settings-window-tools">
          <span class="settings-style-label"><Palette class="h-3.5 w-3.5" aria-hidden="true" />{{ currentStyle }}</span>
          <button type="button" class="ui-icon-button" aria-label="关闭设置" :disabled="databaseBusy" @click="close"><X class="h-5 w-5" /></button>
        </div>
      </div>
    </template>

    <div class="settings-layout" :class="{ 'is-detail': mobileDetail }" :aria-busy="databaseBusy">
      <aside class="settings-sidebar">
        <div class="settings-search">
          <Search class="h-4 w-4" aria-hidden="true" />
          <input v-model="query" type="search" aria-label="搜索设置" placeholder="搜索设置" autocomplete="off" :disabled="databaseBusy" data-modal-autofocus @keydown.enter.prevent="results[0] && select(results[0].section, results[0])" />
          <button v-if="query" type="button" aria-label="清除设置搜索" :disabled="databaseBusy" @click="query = ''"><X class="h-4 w-4" /></button>
        </div>
        <nav ref="navigation" class="settings-navigation" aria-label="设置分类" @keydown="navigate">
          <template v-if="searching">
            <p class="settings-group-label" role="status" aria-live="polite">{{ results.length ? `${results.length} 项相关设置` : '没有找到相关设置' }}</p>
            <div v-if="results.length" class="settings-search-results">
              <button v-for="result in results" :key="result.id" type="button" class="settings-nav-item settings-search-result" :aria-current="selectedResult === result.id ? 'page' : undefined" :disabled="databaseBusy" @click="select(result.section, result)">
                <component :is="icons[result.section]" class="settings-nav-icon" aria-hidden="true" />
                <span><strong>{{ result.label }}</strong><small>{{ result.description }}</small></span>
                <ChevronRight class="settings-nav-chevron" aria-hidden="true" />
              </button>
            </div>
            <div v-else class="settings-search-empty"><p>试试“壁纸”“密码”或“备份”。</p><button type="button" class="ui-secondary-button" @click="query = ''">查看所有设置</button></div>
          </template>
          <template v-else>
            <section v-for="group in groups" :key="group" class="settings-nav-group">
              <h3 class="settings-group-label">{{ group }}</h3>
              <button v-for="section in sections.filter(item => item.group === group)" :key="section.key" type="button" class="settings-nav-item" :aria-current="tab === section.key ? 'page' : undefined" :aria-controls="`settings-page-${section.key}`" :disabled="databaseBusy" @click="select(section.key)">
                <component :is="icons[section.key]" class="settings-nav-icon" aria-hidden="true" />
                <span><strong>{{ section.label }}</strong><small>{{ section.description }}</small></span>
                <ChevronRight class="settings-nav-chevron" aria-hidden="true" />
              </button>
            </section>
          </template>
        </nav>
        <p class="settings-navigation-footnote">Personal Hub</p>
      </aside>
      <main ref="content" class="settings-content settings-page-scroll" :aria-label="current.label">
        <header class="settings-page-heading">
          <p class="settings-page-eyebrow">{{ current.group }}</p>
          <h2 class="settings-page-title" tabindex="-1">{{ current.label }}</h2>
          <p class="settings-page-description">{{ current.description }}</p>
        </header>
        <section v-for="section in sections" v-show="tab === section.key" :id="`settings-page-${section.key}`" :key="section.key" class="settings-section-content" :aria-label="section.label">
          <AsyncPanel v-if="open && visited.has(section.key) && (section.key !== 'pet' || tab === 'pet')" :loader="loaders[section.key]" :label="section.label" :open="open" :initial-category="section.key === 'appearance' ? appearanceCategory : undefined" />
        </section>
      </main>
    </div>
  </ModalShell>
</template>
