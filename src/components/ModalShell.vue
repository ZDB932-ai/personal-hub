<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  maxWidth?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const panel = ref<HTMLElement | null>(null)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener('keydown', onKeydown)
      void nextTick(() => panel.value?.focus())
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Transition name="modal">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        class="absolute inset-0 bg-black/60"
        aria-hidden="true"
        @click="$emit('close')"
      ></div>
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        aria-label="对话框"
        tabindex="-1"
        class="modal-panel relative max-h-[85vh] w-full overflow-y-auto rounded-xl border border-line bg-elevated p-6 shadow-2xl shadow-black/50"
        :class="maxWidth ?? 'max-w-lg'"
      >
        <slot />
      </div>
    </div>
  </Transition>
</template>
