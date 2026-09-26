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
let returnFocus: HTMLElement | null = null

function onKeydown(e: KeyboardEvent) {
  if (document.querySelectorAll('[role="dialog"]').item(document.querySelectorAll('[role="dialog"]').length - 1) !== panel.value) return
  if (e.key === 'Escape') emit('close')
  if (e.key === 'Tab') {
    const focusable = Array.from(panel.value?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0)
    const first = focusable[0], last = focusable.at(-1)
    if (!first) { e.preventDefault(); panel.value?.focus() }
    else if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) { e.preventDefault(); last?.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      window.addEventListener('keydown', onKeydown)
      void nextTick(() => panel.value?.focus())
    } else {
      window.removeEventListener('keydown', onKeydown)
      returnFocus?.focus()
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (returnFocus?.isConnected) returnFocus.focus()
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
