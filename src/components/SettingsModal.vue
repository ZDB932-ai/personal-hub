<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Cloud, DatabaseBackup, Info, Palette, Settings, ShieldCheck, X } from '@lucide/vue'
import ModalShell from '@/components/ModalShell.vue'
import AsyncPanel from '@/components/AsyncPanel.vue'
import { databaseBusy } from '@/stores/database'

const props = defineProps<{
  open: boolean
  initialTab?: 'appearance' | 'security' | 'sync'
}>()

const emit = defineEmits<{
  close: []
}>()

function close(): void {
  if (!databaseBusy.value) emit('close')
}

type TabKey = 'appearance' | 'pet' | 'security' | 'backup' | 'sync' | 'about'

const tab = ref<TabKey>('appearance')
const content = ref<HTMLElement | null>(null)
const visited = ref(new Set<TabKey>())
const loaders = {
  appearance: () => import('@/components/settings/AppearanceSection.vue'),
  pet: () => import('@/components/settings/PetSection.vue'),
  security: () => import('@/components/settings/SecuritySection.vue'),
  backup: () => import('@/components/settings/BackupPanel.vue'),
  sync: () => import('@/components/settings/SyncSection.vue'),
  about: () => import('@/components/settings/AboutSection.vue'),
}
watch(tab, async value => {
  if (!props.open) return
  visited.value.add(value)
  await nextTick()
  const scroller = content.value?.closest('.modal-region-body')
  if (scroller) scroller.scrollTop = 0
})

const tabs = computed(() => [
  { key: 'appearance' as TabKey, label: '外观', icon: Palette },
  { key: 'pet' as TabKey, label: '玩偶', icon: Palette },
  { key: 'security' as TabKey, label: '安全', icon: ShieldCheck },
  { key: 'backup' as TabKey, label: '备份', icon: DatabaseBackup },
  { key: 'sync' as TabKey, label: '同步', icon: Cloud },
  { key: 'about' as TabKey, label: '关于', icon: Info },
])

watch(
  () => props.open,
  (open) => {
    if (open) {
      tab.value = props.initialTab ?? 'appearance'
      visited.value = new Set([tab.value])
    } else visited.value.clear()
  },
  { immediate: true },
)
</script>

<template>
  <ModalShell :open="open" max-width="max-w-2xl" mobile-sheet panel-class="settings-panel" @close="close">
    <template #header>
    <div class="flex items-center justify-between">
      <h3 class="flex items-center gap-2 text-lg font-semibold">
        <Settings class="h-5 w-5" />
        设置
      </h3>
      <button
        class="ui-icon-button"
        aria-label="关闭设置"
        :disabled="databaseBusy"
        @click="close"
      >
        <X class="h-5 w-5" />
      </button>
    </div>

    <div class="settings-sections mt-4 grid grid-cols-6 gap-1 rounded-xl border border-line bg-inset p-1" role="group" aria-label="设置分区">
      <button
        v-for="t in tabs"
        :key="t.key"
        :disabled="databaseBusy"
        class="flex min-h-11 items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium transition-colors duration-150"
        :aria-pressed="tab === t.key"
        :class="
          tab === t.key
            ? 'bg-primary/15 text-primary'
            : 'text-t3 hover:bg-surface-2 hover:text-t2'
        "
        @click="tab = t.key"
      >
        <component :is="t.icon" class="h-3.5 w-3.5" />
        {{ t.label }}
      </button>
    </div>
    </template>

    <div ref="content" class="settings-content">
      <template v-for="section in tabs" :key="section.key">
        <AsyncPanel
          v-if="open && visited.has(section.key) && (section.key !== 'pet' || tab === 'pet')"
          v-show="tab === section.key"
          :loader="loaders[section.key]"
          :label="section.label"
          :open="open"
        />
      </template>
    </div>
  </ModalShell>
</template>
