<script lang="ts">
let scrollLocks = 0
let previousOverflow = ''
</script>

<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  maxWidth?: string
  mobileSheet?: boolean
  panelClass?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const panel = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null
let ownsScrollLock = false

function releaseScrollLock() {
  if (!ownsScrollLock) return
  ownsScrollLock = false
  if (--scrollLocks === 0) document.documentElement.style.overflow = previousOverflow
}

function onKeydown(e: KeyboardEvent) {
  if (document.querySelectorAll('[role="dialog"]').item(document.querySelectorAll('[role="dialog"]').length - 1) !== panel.value) return
  if (!props.open || e.isComposing || e.defaultPrevented) return
  if (e.key === 'Escape') { e.preventDefault(); emit('close') }
  if (e.key === 'Tab') {
    const focusable = Array.from(panel.value?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0)
    const first = focusable[0], last = focusable.at(-1)
    if (!first) { e.preventDefault(); panel.value?.focus() }
    else if (!panel.value?.contains(document.activeElement) || document.activeElement === panel.value) { e.preventDefault(); (e.shiftKey ? last : first)?.focus() }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      if (!ownsScrollLock) {
        if (scrollLocks++ === 0) {
          previousOverflow = document.documentElement.style.overflow
          document.documentElement.style.overflow = 'hidden'
        }
        ownsScrollLock = true
      }
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      window.addEventListener('keydown', onKeydown)
      void nextTick(() => {
        if (!props.open || !panel.value || panel.value.contains(document.activeElement)) return
        const target = panel.value.querySelector<HTMLElement>('[data-modal-autofocus]')
        ;(target ?? panel.value).focus({ preventScroll: true })
      })
    } else {
      releaseScrollLock()
      window.removeEventListener('keydown', onKeydown)
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  releaseScrollLock()
  window.removeEventListener('keydown', onKeydown)
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
})
</script>

<template>
  <Teleport to="body">
  <Transition name="modal">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      :class="{ 'modal-sheet-host': mobileSheet }"
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
        class="modal-panel relative max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-xl border border-line bg-elevated p-4 shadow-2xl shadow-black/50 sm:p-6"
        :class="[maxWidth ?? 'max-w-lg', panelClass, { 'modal-with-regions': $slots.header || $slots.footer, 'modal-mobile-sheet': mobileSheet }]"
      >
        <div v-if="$slots.header" class="modal-region-header"><slot name="header" /></div>
        <div v-if="$slots.header || $slots.footer" class="modal-region-body"><slot /></div>
        <slot v-else />
        <div v-if="$slots.footer" class="modal-region-footer"><slot name="footer" /></div>
      </div>
    </div>
  </Transition>
  </Teleport>
</template>
