<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Cloud, DatabaseBackup, Info, Palette, Settings, ShieldCheck, X } from '@lucide/vue'
import ModalShell from '@/components/ModalShell.vue'
import AppearanceSection from '@/components/settings/AppearanceSection.vue'
import SecuritySection from '@/components/settings/SecuritySection.vue'
import BackupSection from '@/components/settings/BackupSection.vue'
import RecoverySection from '@/components/settings/RecoverySection.vue'
import SyncSection from '@/components/settings/SyncSection.vue'
import AboutSection from '@/components/settings/AboutSection.vue'
import PetSection from '@/components/settings/PetSection.vue'
import { databaseBusy } from '@/stores/database'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

function close(): void {
  if (!databaseBusy.value) emit('close')
}

type TabKey = 'appearance' | 'pet' | 'security' | 'backup' | 'sync' | 'about'

const tab = ref<TabKey>('appearance')

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
    if (open) tab.value = 'appearance'
  },
)
</script>

<template>
  <ModalShell :open="open" max-width="max-w-2xl" @close="close">
    <div class="flex items-center justify-between">
      <h3 class="flex items-center gap-2 text-lg font-semibold">
        <Settings class="h-5 w-5" />
        设置
      </h3>
      <button
        class="rounded-lg p-1.5 text-t4 transition hover:bg-surface hover:text-t2"
        :disabled="databaseBusy"
        @click="close"
      >
        <X class="h-5 w-5" />
      </button>
    </div>

    <div class="mt-4 grid grid-cols-6 gap-1 rounded-xl border border-line bg-inset p-1">
      <button
        v-for="t in tabs"
        :key="t.key"
        :disabled="databaseBusy"
        class="flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium transition-colors duration-150"
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

    <div class="mt-5 max-h-[62vh] overflow-y-auto pr-1">
      <AppearanceSection v-show="tab === 'appearance'" :open="open" />
      <PetSection v-if="open && tab === 'pet'" />
      <SecuritySection v-show="tab === 'security'" :open="open" />
      <BackupSection v-show="tab === 'backup'" :open="open" />
      <RecoverySection v-if="open && tab === 'backup'" :open="open" />
      <SyncSection v-show="tab === 'sync'" :open="open" />
      <AboutSection v-show="tab === 'about'" />
    </div>
  </ModalShell>
</template>
