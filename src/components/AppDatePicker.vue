<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { CalendarDays, ChevronLeft, ChevronRight } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    ariaLabel?: string
  }>(),
  {
    ariaLabel: '选择日期',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const root = ref<HTMLElement | null>(null)
const open = ref(false)

function fromYMD(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

function toYMD(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const cursor = ref(fromYMD(props.modelValue) ?? new Date())
const today = toYMD(new Date())
const weekdays = ['一', '二', '三', '四', '五', '六', '日']

const monthLabel = computed(() => `${cursor.value.getFullYear()}年${cursor.value.getMonth() + 1}月`)
const displayValue = computed(() => {
  const date = fromYMD(props.modelValue)
  if (!date) return '选择日期'
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
})

const days = computed(() => {
  const year = cursor.value.getFullYear()
  const month = cursor.value.getMonth()
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    return {
      date,
      value: toYMD(date),
      inMonth: date.getMonth() === month,
    }
  })
})

function shiftMonth(amount: number): void {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + amount, 1)
}

function choose(date: Date): void {
  emit('update:modelValue', toYMD(date))
  cursor.value = new Date(date.getFullYear(), date.getMonth(), 1)
  open.value = false
}

function toggle(): void {
  open.value = !open.value
}

function handlePointerDown(event: MouseEvent): void {
  if (root.value?.contains(event.target as Node)) return
  open.value = false
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false
}

watch(
  () => props.modelValue,
  (value) => {
    const date = fromYMD(value)
    if (date) cursor.value = new Date(date.getFullYear(), date.getMonth(), 1)
  },
)

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="root" class="date-picker">
    <button
      type="button"
      class="date-picker-trigger"
      :aria-label="ariaLabel"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="truncate">{{ displayValue }}</span>
      <CalendarDays class="h-4 w-4 shrink-0" aria-hidden="true" />
    </button>

    <div v-if="open" class="date-picker-popover" role="dialog" aria-label="选择日期">
      <div class="date-picker-header">
        <button type="button" class="date-picker-nav" aria-label="上个月" @click="shiftMonth(-1)">
          <ChevronLeft class="h-4 w-4" />
        </button>
        <p class="text-sm font-semibold text-t1">{{ monthLabel }}</p>
        <button type="button" class="date-picker-nav" aria-label="下个月" @click="shiftMonth(1)">
          <ChevronRight class="h-4 w-4" />
        </button>
      </div>

      <div class="date-picker-weekdays">
        <span v-for="day in weekdays" :key="day">{{ day }}</span>
      </div>
      <div class="date-picker-grid">
        <button
          v-for="day in days"
          :key="day.value"
          type="button"
          class="date-picker-day"
          :class="{
            'is-outside': !day.inMonth,
            'is-selected': day.value === modelValue,
            'is-today': day.value === today && day.value !== modelValue,
          }"
          :aria-label="`${day.date.getFullYear()}年${day.date.getMonth() + 1}月${day.date.getDate()}日`"
          :aria-pressed="day.value === modelValue"
          @click="choose(day.date)"
        >
          {{ day.date.getDate() }}
        </button>
      </div>

      <div class="date-picker-footer">
        <button type="button" class="date-picker-today" @click="choose(new Date())">今天</button>
      </div>
    </div>
  </div>
</template>
