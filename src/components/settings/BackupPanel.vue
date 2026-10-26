<script setup lang="ts">
import BackupSection from './BackupSection.vue'
import RecoverySection from './RecoverySection.vue'
import DeviceSection from './DeviceSection.vue'
import { localCloudAccount } from '@/stores/lock'
defineProps<{ open: boolean }>()
</script>

<template>
  <div class="settings-stack">
    <BackupSection :open="open" />
    <RecoverySection :open="open" />
    <details v-if="!localCloudAccount" class="settings-card settings-disclosure">
      <summary class="settings-section-title">迁移到其他设备</summary>
      <div class="settings-disclosure-body"><DeviceSection :open="open" /></div>
    </details>
    <section v-else class="settings-card"><h3 class="settings-section-title">在其他设备使用</h3><p class="settings-description">安装 Personal Hub 后，使用同一云账号登录。同步完成前，请保留原设备上的数据和备份。</p></section>
  </div>
</template>
