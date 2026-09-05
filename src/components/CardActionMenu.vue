<script setup lang="ts">
import { MoreHorizontal } from '@lucide/vue'

withDefaults(
  defineProps<{
    label?: string
  }>(),
  {
    label: '更多操作',
  },
)
</script>

<template>
  <details class="relative shrink-0">
    <summary
      :aria-label="label"
      class="flex h-9 w-9 list-none items-center justify-center rounded-lg text-t4 transition-colors duration-150 hover:bg-surface-2 hover:text-t2 [&::-webkit-details-marker]:hidden"
    >
      <MoreHorizontal class="h-4 w-4" />
    </summary>
    <div class="absolute right-0 top-10 z-20 w-32 rounded-lg border border-line bg-elevated p-1">
      <slot />
    </div>
  </details>
</template>
