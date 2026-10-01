<script setup lang="ts">
import type { Task } from '@/types'
defineProps<{ task: Task }>()
</script>
<template>
  <details v-if="task.resumeNote || task.resumeNextStep" class="my-3 rounded-lg border border-line bg-inset p-3">
    <summary class="min-h-11 cursor-pointer text-sm text-primary">当时留下的继续线索</summary>
    <p v-if="task.resumeNote" class="whitespace-pre-wrap break-words text-sm leading-7 text-t2">做到哪里了：{{ task.resumeNote }}</p>
    <p v-if="task.resumeNextStep" class="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-t2">下一步：{{ task.resumeNextStep }}</p>
  </details>
</template>
