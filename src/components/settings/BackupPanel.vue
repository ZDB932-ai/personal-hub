<script setup lang="ts">
import BackupSection from './BackupSection.vue'
import RecoverySection from './RecoverySection.vue'
defineProps<{ open: boolean }>()
</script>

<template>
  <div>
    <BackupSection :open="open" />
    <RecoverySection :open="open" />
  </div>
</template>
