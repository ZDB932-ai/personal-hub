<script setup lang="ts">
import { localCloudAccount } from '@/stores/lock'
import CloudAccountSection from './CloudAccountSection.vue'
import LocalAccountSection from './LocalAccountSection.vue'

defineProps<{ open: boolean }>()
</script>

<template>
  <div class="settings-stack">
    <CloudAccountSection v-if="localCloudAccount" :open="open" />
    <LocalAccountSection v-else :open="open" />
  </div>
</template>
