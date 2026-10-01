<script setup lang="ts">
import { computed, ref } from 'vue'
import { tasks } from '@/stores/tasks'
import { dayCapacity, dayLoad, longPlans, planner, weeklyPlans } from '@/stores/planning'
import { gapChoices } from '@/lib/attentionJourney'
import { minuteLabel } from '@/lib/calendar'
import { availableWindows } from '@/lib/calendarConnections'
import { protectTime } from '@/stores/attention'
import { flushPendingSave } from '@/stores/database'
import { toast } from '@/lib/toast'
import type { Task } from '@/types'
const props = defineProps<{ date: string; now: Date }>()
const emit = defineEmits<{ suggest: [task: Task, date: string, time: string] }>()
const minutes = ref(15), light = ref(false), busy = ref(false)
const remaining = computed(() => Math.max(0, dayCapacity(props.date) - dayLoad(props.date)))
const choices = computed(() => gapChoices(tasks.value, props.date, remaining.value, props.now, minutes.value, light.value, weeklyPlans.value, longPlans.value, planner.value.protectedTimes ?? []))
const restSlot = computed(() => availableWindows(tasks.value, props.date, 1440, props.now, minutes.value, planner.value.protectedTimes)[0])
async function rest(): Promise<void> {
  if (!restSlot.value || busy.value) return
  busy.value = true
  try { const start = restSlot.value.start; protectTime({ date: props.date, start, end: start + minutes.value, label: '给自己休息' }); await flushPendingSave(); toast('这段空档留给休息') }
  catch { toast('留白尚未保存，请检查存储状态', 'error') }
  finally { busy.value = false }
}
</script>
<template>
  <details class="my-4 border-t border-line pt-3"><summary class="min-h-11 cursor-pointer text-sm text-primary">空档菜单 · 挑一件刚好合适的事</summary>
    <div class="my-3 flex flex-wrap gap-2" role="group" aria-label="空档时长"><button v-for="value in [15, 30, 60]" :key="value" class="filter-chip min-h-11" :class="{ 'is-active': minutes === value }" :aria-pressed="minutes === value" @click="minutes = value">{{ value }} 分钟</button></div>
    <label class="flex min-h-11 items-center gap-2 text-xs text-t2"><input v-model="light" type="checkbox" />想轻松一点，只看 15 分钟内的小事</label>
    <article v-for="choice in choices" :key="choice.task.id" class="my-3 rounded-xl border border-line bg-surface p-3"><p class="break-words text-sm text-t1">{{ choice.task.title }}</p><button class="min-h-11 text-xs text-primary" @click="emit('suggest', choice.task, date, minuteLabel(choice.start))">预览安排 · {{ minuteLabel(choice.start) }}</button></article>
    <p v-if="!choices.length" class="my-3 text-xs leading-6 text-t3">没有恰好合适的待安排任务，不必填满。</p>
    <button class="ui-secondary-button w-full" :disabled="!restSlot || busy" @click="rest">{{ restSlot ? `我想休息 · ${minuteLabel(restSlot.start)} 起 ${minutes} 分钟` : '今天没有足够的未来空档' }}</button>
  </details>
</template>
