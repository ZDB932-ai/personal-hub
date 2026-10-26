<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { monthDates, shiftMonth } from '@/lib/calendar'
import { shiftYMD, weekStartYMD } from '@/lib/utils'

const props = defineProps<{ selected: string; today: string; range: string[] }>()
const emit = defineEmits<{ select: [date: string] }>()
const month = ref(props.selected)
const grid = ref<HTMLElement | null>(null)
watch(() => props.selected, value => { month.value = value })
const dates = computed(() => monthDates(month.value))
const title = computed(() => `${month.value.slice(0, 4)}年${Number(month.value.slice(5, 7))}月`)
const focusDate = computed(() => dates.value.includes(props.selected) ? props.selected : `${month.value.slice(0, 7)}-01`)
async function moveFocus(event: KeyboardEvent, date: string): Promise<void> {
  const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  let next: string | undefined
  if (event.key in offsets) next = shiftYMD(date, offsets[event.key])
  if (event.key === 'Home') next = weekStartYMD(date)
  if (event.key === 'End') next = shiftYMD(weekStartYMD(date), 6)
  if (event.key === 'PageUp' || event.key === 'PageDown') next = shiftMonth(date, event.key === 'PageUp' ? -1 : 1)
  if (!next) return
  event.preventDefault()
  emit('select', next)
  await nextTick()
  grid.value?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus()
}
</script>

<template>
  <section class="mini-month" aria-label="迷你月历">
    <div class="flex items-center justify-between"><h2 class="text-sm font-semibold text-t1" aria-live="polite">{{ title }}</h2><div class="flex"><button class="calendar-icon ui-icon-button" aria-label="迷你月历上个月" @click="month = shiftMonth(month, -1)"><ChevronLeft class="h-4 w-4" /></button><button class="calendar-icon ui-icon-button" aria-label="迷你月历下个月" @click="month = shiftMonth(month, 1)"><ChevronRight class="h-4 w-4" /></button></div></div>
    <div ref="grid" class="mini-month-grid">
      <span v-for="day in ['一', '二', '三', '四', '五', '六', '日']" :key="day" class="mini-weekday">{{ day }}</span>
      <button v-for="date in dates" :key="date" :data-date="date" class="mini-date" :class="{ 'is-outside': date.slice(0, 7) !== month.slice(0, 7), 'is-range': range.length === 7 && range.includes(date), 'is-selected': date === selected, 'is-today': date === today }" :tabindex="date === focusDate ? 0 : -1" :aria-label="`选择 ${date}${date === today ? '，今天' : ''}`" :aria-pressed="date === selected" :aria-current="date === today ? 'date' : undefined" @click="emit('select', date)" @keydown="moveFocus($event, date)">{{ Number(date.slice(8)) }}</button>
    </div>
  </section>
</template>

<style scoped>
.mini-month-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px 0; }
.mini-weekday { padding: 8px 0; text-align: center; color: var(--tk-t3); font-size: 11px; }
.mini-date { height: 32px; width: 100%; border-radius: 50%; color: var(--tk-t2); font-size: 12px; font-variant-numeric: tabular-nums; }
.mini-date.is-outside { color: var(--tk-t4); opacity: .65; }
.mini-date:hover, .mini-date.is-range { background: color-mix(in srgb, var(--tk-primary) 8%, transparent); }
.mini-date.is-selected { outline: 1px solid var(--tk-primary); outline-offset: -3px; color: var(--tk-primary); font-weight: 600; }
.mini-date.is-today { background: var(--tk-primary); color: var(--tk-ink); opacity: 1; font-weight: 600; }
.mini-date:focus-visible { outline: 2px solid var(--tk-primary); outline-offset: 1px; }
</style>
