<script setup lang="ts">
import { toasts } from '@/lib/toast'
import { AlertCircle, CheckCircle2 } from '@lucide/vue'
</script>

<template>
  <div
    class="pointer-events-none fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2 md:bottom-6"
  >
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        :role="t.type === 'error' ? 'alert' : 'status'"
        class="flex items-center gap-2 rounded-full border bg-elevated px-4 py-2 text-sm"
        :class="
          t.type === 'success'
            ? 'border-ok/30 text-ok'
            : 'border-danger/30 text-danger'
        "
      >
        <CheckCircle2 v-if="t.type === 'success'" class="h-4 w-4" />
        <AlertCircle v-else class="h-4 w-4" />
        {{ t.message }}
      </div>
    </TransitionGroup>
  </div>
</template>
