<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Check, ChevronDown } from '@lucide/vue'
defineOptions({ inheritAttrs: false })

interface Option {
  value: string | number
  label: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number
    options: (Option | string | number)[]
    placeholder?: string
    disabled?: boolean
    size?: 'sm' | 'md'
    triggerClass?: string
  }>(),
  {
    placeholder: '请选择',
    disabled: false,
    size: 'md',
    triggerClass: '',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const norm = computed<Option[]>(() =>
  props.options.map((o) => (typeof o === 'object' ? o : { value: o, label: String(o) })),
)

const selected = computed(() => norm.value.find((o) => o.value === props.modelValue))

const open = ref(false)
const activeIndex = ref(-1)
const trigger = ref<HTMLButtonElement | null>(null)
const listStyle = ref<Record<string, string>>({})

const POP_ID = `app-select-${Math.random().toString(36).slice(2, 8)}`

function place(): void {
  const r = trigger.value?.getBoundingClientRect()
  if (!r) return
  const itemH = props.size === 'sm' ? 30 : 36
  const h = Math.min(norm.value.length, 8) * itemH + 8
  const spaceBelow = window.innerHeight - r.bottom
  const above = spaceBelow < h + 12 && r.top > spaceBelow
  const top = above ? Math.max(8, r.top - h - 6) : r.bottom + 6
  const width = Math.max(r.width, 176)
  const left = Math.min(r.left, window.innerWidth - width - 8)
  listStyle.value = {
    top: `${Math.max(8, top)}px`,
    left: `${Math.max(8, left)}px`,
    minWidth: `${r.width}px`,
  }
}

function onOutside(e: PointerEvent): void {
  const target = e.target as Node
  if (trigger.value?.contains(target)) return
  const pop = document.getElementById(POP_ID)
  if (pop?.contains(target)) return
  close(false)
}

function onScroll(): void {
  place()
}

const onResize = (): void => close(false)

function openList(): void {
  if (props.disabled || open.value) return
  open.value = true
  activeIndex.value = Math.max(
    0,
    norm.value.findIndex((o) => o.value === props.modelValue),
  )
  place()
  document.addEventListener('pointerdown', onOutside, true)
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onScroll, true)
  void nextTick(() => document.getElementById(POP_ID)?.focus())
}

function close(refocus = true): void {
  if (!open.value) return
  open.value = false
  document.removeEventListener('pointerdown', onOutside, true)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onScroll, true)
  if (refocus) trigger.value?.focus()
}

function choose(o: Option): void {
  emit('update:modelValue', o.value)
  close()
}

function onTriggerKey(e: KeyboardEvent): void {
  if (props.disabled) return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    openList()
  }
}

function onListKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % norm.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + norm.value.length) % norm.value.length
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    const o = norm.value[activeIndex.value]
    if (o) choose(o)
  } else if (e.key === 'Home') {
    e.preventDefault()
    activeIndex.value = 0
  } else if (e.key === 'End') {
    e.preventDefault()
    activeIndex.value = norm.value.length - 1
  }
}

watch(open, (v) => {
  if (v) void nextTick(place)
})

onBeforeUnmount(() => close(false))
</script>

<template>
  <button
    v-bind="$attrs"
    ref="trigger"
    type="button"
    role="combobox"
    aria-haspopup="listbox"
    :aria-expanded="open"
    :disabled="disabled"
    class="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface text-t2 outline-none transition-colors duration-150 hover:border-primary/40 focus-visible:border-primary/60 disabled:cursor-not-allowed disabled:opacity-40"
    :class="[size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2.5 text-sm', triggerClass]"
    @click="open ? close() : openList()"
    @keydown="onTriggerKey"
  >
    <span class="min-w-0 truncate" :class="selected ? '' : 'text-t4'">
      {{ selected?.label ?? placeholder }}
    </span>
    <ChevronDown
      class="h-4 w-4 shrink-0 text-t4 transition-transform duration-150"
      :class="open ? 'rotate-180' : ''"
    />
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      :id="POP_ID"
      role="listbox"
      tabindex="-1"
      :style="listStyle"
      class="fixed z-[95] max-h-72 min-w-32 overflow-y-auto rounded-lg border border-line bg-elevated p-1 outline-none"
      @keydown="onListKey"
    >
      <button
        v-for="(o, i) in norm"
        :key="o.value"
        type="button"
        role="option"
        :aria-selected="o.value === modelValue"
        class="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors duration-150"
        :class="[
          o.value === modelValue ? 'text-primary' : 'text-t2',
          i === activeIndex ? 'bg-surface-2' : '',
          size === 'sm' ? 'text-xs' : 'text-sm',
        ]"
        @mouseenter="activeIndex = i"
        @click.stop="choose(o)"
      >
        <span class="min-w-0 truncate">{{ o.label }}</span>
        <Check v-if="o.value === modelValue" class="h-3.5 w-3.5 shrink-0" />
      </button>
    </div>
  </Teleport>
</template>
