<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Plus, Link2 } from '@lucide/vue'
import type { Task } from '@/types'
import { dayBlocks, lunarLabel, minuteLabel } from '@/lib/calendar'

const props = defineProps<{ dates: string[]; tasks: Task[]; selected: string; today: string; now: Date }>()
const emit = defineEmits<{ select: [date: string]; create: [date: string, time: string]; edit: [task: Task] }>()
const scroll = ref<HTMLElement | null>(null)
const days = computed(() => props.dates.map(date => ({ date, blocks: dayBlocks(props.tasks, date), floating: props.tasks.filter(t => t.date === date && !t.time) })))
const columns = computed(() => `64px repeat(${props.dates.length}, minmax(0, 1fr))`)
const nowMinutes = computed(() => props.now.getHours() * 60 + props.now.getMinutes())
const zoneLabel = computed(() => {
  const offset = -props.now.getTimezoneOffset()
  return `GMT${offset >= 0 ? '+' : '−'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`
})
function scrollToTime(): void { if (scroll.value) scroll.value.scrollTop = Math.max(0, props.dates.includes(props.today) ? nowMinutes.value / 60 * 72 - 144 : 8 * 72) }
onMounted(scrollToTime)
defineExpose({ scrollToTime })
</script>

<template>
  <div ref="scroll" class="calendar-timeline" aria-label="时间轴" tabindex="0">
    <div class="timeline-sheet" :class="{ 'single-day': dates.length === 1 }">
      <div class="timeline-head" :style="{ gridTemplateColumns: columns }">
        <span class="timeline-zone">{{ zoneLabel }}</span>
        <button v-for="day in days" :key="day.date" class="timeline-day-heading" :class="{ 'is-selected': day.date === selected, 'is-today': day.date === today }" :aria-label="`查看 ${day.date} 的安排`" :aria-current="day.date === today ? 'date' : undefined" @click="emit('select', day.date)">
          <span class="timeline-weekday">{{ new Date(`${day.date}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' }) }}</span>
          <span class="timeline-day-number">{{ Number(day.date.slice(8)) }}</span>
          <span class="timeline-lunar">{{ lunarLabel(day.date) }}</span>
        </button>
        <span class="timeline-all-day-label">不定时</span>
        <div v-for="day in days" :key="`floating-${day.date}`" class="timeline-floating">
          <button class="timeline-floating-add" :aria-label="`${day.date} 添加不定时任务`" @click="emit('create', day.date, '')"><Plus class="h-3 w-3" /></button>
          <div v-if="day.floating.length" class="timeline-floating-list"><button v-for="task in day.floating" :key="task.id" class="timeline-floating-event" :class="{ 'is-done': task.done }" :title="task.title" @click="emit('edit', task)">{{ task.title }}</button></div>
        </div>
      </div>
      <div class="timeline-body" :style="{ gridTemplateColumns: columns }">
        <div class="timeline-hours"><div v-for="hour in 24" :key="hour" class="timeline-hour-label"><span>{{ minuteLabel((hour - 1) * 60) }}</span></div></div>
        <div v-for="day in days" :key="day.date" class="timeline-day-column">
          <button v-for="slot in 48" :key="slot" class="timeline-slot" :class="{ 'hour-start': slot % 2 === 1 }" :aria-label="`${day.date} ${minuteLabel((slot - 1) * 30)} 新建任务`" @click="emit('create', day.date, minuteLabel((slot - 1) * 30))"></button>
          <button v-for="block in day.blocks" :key="block.task.id" class="timeline-event" :class="{ 'is-done': block.task.done, 'is-linked': block.task.links?.some(link => link.kind === 'memos'), 'is-short': block.end - block.start <= 30 }" :style="{ top: `${block.start / 60 * 72}px`, height: `${Math.max(2, (block.end - block.start) / 60 * 72 - 2)}px`, left: `calc(${block.lane / block.lanes * 100}% + 3px)`, width: `calc(${100 / block.lanes}% - 6px)` }" :aria-label="`编辑 ${block.task.title} · ${minuteLabel(block.start)}–${minuteLabel(block.end)}`" :title="`${block.task.title} · ${minuteLabel(block.start)}–${minuteLabel(block.end)}${block.continued ? '（接前日）' : ''}${block.continues ? '（延至次日）' : ''}`" @click="emit('edit', block.task)">
            <span class="timeline-event-title"><Link2 v-if="block.task.links?.some(link => link.kind === 'memos')" class="h-3 w-3 shrink-0" /><span class="truncate">{{ block.task.done ? '已完成 · ' : '' }}{{ block.task.title }}</span></span>
            <span class="timeline-event-time">{{ block.continued ? '接前日 · ' : '' }}{{ minuteLabel(block.start) }}–{{ minuteLabel(block.end) }}{{ block.continues ? ' →' : '' }}</span>
          </button>
          <div v-if="day.date === today" class="timeline-now" :style="{ top: `${nowMinutes / 60 * 72}px` }" role="img" :aria-label="`当前时间 ${minuteLabel(nowMinutes)}`"><span></span></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.calendar-timeline { height: 100%; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--tk-line) transparent; }
.timeline-sheet { min-width: 700px; }
.timeline-sheet.single-day { min-width: 0; }
.timeline-head, .timeline-body { display: grid; }
.timeline-head { position: sticky; top: 0; z-index: 10; background: var(--tk-surface); border-bottom: 1px solid var(--tk-line); }
.timeline-day-heading { display: flex; align-items: center; flex-direction: column; gap: 4px; padding: 16px 4px 8px; color: var(--tk-t2); }
.timeline-weekday { font-size: 12px; }
.timeline-day-number { display: flex; width: 44px; height: 44px; align-items: center; justify-content: center; border-radius: 50%; font-size: 26px; line-height: 1; font-variant-numeric: tabular-nums; font-weight: 400; }
.timeline-lunar { font-size: 11px; color: var(--tk-t3); }
.timeline-day-heading:hover .timeline-day-number { background: var(--tk-surface-2); }
.timeline-day-heading.is-selected:not(.is-today) .timeline-day-number { background: color-mix(in srgb, var(--tk-primary) 10%, var(--tk-surface)); color: var(--tk-primary); }
.timeline-day-heading.is-today .timeline-day-number { background: var(--tk-primary); color: var(--tk-ink); }
.timeline-day-heading.is-today .timeline-weekday { color: var(--tk-primary); font-weight: 600; }
.timeline-zone { align-self: end; padding: 8px 4px; font-size: 10px; color: var(--tk-t3); text-align: center; }
.timeline-all-day-label { display: flex; justify-content: flex-end; align-items: center; padding-right: 8px; font-size: 11px; color: var(--tk-t3); }
.timeline-floating { position: relative; min-width: 0; min-height: 44px; border-left: 1px solid color-mix(in srgb, var(--tk-line) 60%, transparent); padding: 4px 24px 4px 4px; }
.timeline-floating-add { position: absolute; right: 0; top: 0; display: flex; width: 100%; min-height: 44px; align-items: center; justify-content: flex-end; padding-right: 8px; color: var(--tk-t4); }
.timeline-floating-add:hover { background: color-mix(in srgb, var(--tk-primary) 6%, transparent); }
.timeline-floating-list { position: relative; max-height: 100px; overflow: auto; pointer-events: none; }
.timeline-floating-event { pointer-events: auto; display: block; width: 100%; min-height: 28px; margin: 2px 0; padding: 4px 8px; border-radius: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; font-size: 12px; background: color-mix(in srgb, var(--tk-primary) 12%, var(--tk-surface)); color: var(--tk-primary); }
.timeline-body { height: 1728px; }
.timeline-hour-label { height: 72px; padding: 0 8px 0 0; text-align: right; color: var(--tk-t3); font-size: 11px; font-variant-numeric: tabular-nums; }
.timeline-hour-label span { display: inline-block; transform: translateY(-50%); background: var(--tk-surface); }
.timeline-hour-label:first-child span { transform: none; }
.timeline-day-column { position: relative; min-width: 0; border-left: 1px solid color-mix(in srgb, var(--tk-line) 70%, transparent); }
.timeline-slot { display: block; height: 36px; width: 100%; }
.timeline-slot.hour-start { border-top: 1px solid color-mix(in srgb, var(--tk-line) 75%, transparent); }
.timeline-slot:hover, .timeline-slot:focus-visible { background: color-mix(in srgb, var(--tk-primary) 6%, transparent); }
.timeline-event { position: absolute; z-index: 1; border-radius: 8px; border-left: 3px solid var(--tk-primary); background: color-mix(in srgb, var(--tk-primary) 14%, var(--tk-surface)); color: var(--tk-t1); overflow: hidden; padding: 4px 8px; text-align: left; font-size: 12px; line-height: 16px; }
.timeline-event.is-linked { border-left-color: var(--tk-info); background: color-mix(in srgb, var(--tk-info) 12%, var(--tk-surface)); }
.timeline-event:hover { filter: brightness(.97); }
.timeline-event:focus-visible { z-index: 3; }
.timeline-event-title { display: flex; align-items: center; gap: 4px; font-weight: 600; }
.timeline-event-time { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.timeline-event.is-short { padding: 0 4px; }
.is-done { text-decoration: line-through; opacity: .65; }
.timeline-now { position: absolute; z-index: 4; left: 0; right: 0; border-top: 2px solid var(--tk-danger); pointer-events: none; }
.timeline-now span { position: absolute; top: -5px; left: -5px; width: 8px; height: 8px; border-radius: 50%; background: var(--tk-danger); }
</style>
