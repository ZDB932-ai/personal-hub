<script setup lang="ts">
import { computed } from 'vue'
import { tasks } from '@/stores/tasks'
import { dayCapacity, dayLoad, planner } from '@/stores/planning'
import { taskMinutesOnDate } from '@/lib/attention'
import { estimatedMinutes } from '@/lib/planningCapacity'
import { dayBlocks, timeMinutes } from '@/lib/calendar'
import { shiftYMD } from '@/lib/utils'
const props = defineProps<{ date: string; time: string; minutes?: number | ''; taskId?: string }>()
const current = computed(() => tasks.value.find(task => task.id === props.taskId))
const proposed = computed(() => ({ date: props.date, time: props.time, estimatedMinutes: Number(props.minutes) || undefined, done: current.value?.done ?? false }))
const projectedOn = (date: string) => dayLoad(date) - (current.value ? taskMinutesOnDate(current.value, date) : 0) + taskMinutesOnDate(proposed.value, date)
const projected = computed(() => projectedOn(props.date))
const nextDate = computed(() => shiftYMD(props.date, 1))
const spills = computed(() => taskMinutesOnDate(proposed.value, nextDate.value) > 0)
const protectedConflict = computed(() => {
  if (!props.date || !props.time || current.value?.done) return 0
  const start = timeMinutes(props.time), end = start + estimatedMinutes(Number(props.minutes))
  return (planner.value.protectedTimes ?? []).filter(item =>
    (item.date === props.date && item.start < end && item.end > start) ||
    (end > 1440 && item.date === shiftYMD(props.date, 1) && item.start < end - 1440),
  ).length
})
const conflict = computed(() => {
  if (!props.date || !props.time || current.value?.done) return 0
  const start = timeMinutes(props.time), end = start + estimatedMinutes(Number(props.minutes))
  const others = tasks.value.filter(task => task.id !== props.taskId && !task.done)
  const overlapping = dayBlocks(others, props.date).filter(block => block.start < end && block.end > start)
  if (end > 1440) overlapping.push(...dayBlocks(others, shiftYMD(props.date, 1)).filter(block => block.start < end - 1440))
  return new Set(overlapping.map(block => block.task.id)).size
})
</script>
<template>
  <div v-if="date" class="rounded-lg border border-line bg-inset p-3 text-xs leading-5" aria-live="polite">
    <p :class="projected > dayCapacity(date) ? 'text-warn' : 'text-t3'">{{ planner.restDates.includes(date) ? '这天是留白日' : `保存后待办预计 ${projected} / 可用 ${dayCapacity(date)} 分钟` }}。{{ projected > dayCapacity(date) ? '可以缩短时长或选择另一天，也可保留这次安排。' : '与每日计划的精力和容量共用。' }}</p>
    <p v-if="spills" :class="projectedOn(nextDate) > dayCapacity(nextDate) ? 'text-warn' : 'text-t3'">跨日部分计入 {{ nextDate }}：待办预计 {{ projectedOn(nextDate) }} / 可用 {{ dayCapacity(nextDate) }} 分钟。</p>
    <p v-if="protectedConflict" class="text-warn">这次安排进入了保护的留白，可以调整，也可手动保留。</p>
    <p v-if="conflict" class="text-warn">与 {{ conflict }} 项未完成任务时间重叠，可调整开始时间。</p>
  </div>
</template>
