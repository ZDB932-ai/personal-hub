<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Leaf, Sparkles } from '@lucide/vue'
import { dayCapacity, dayLoad, planner, plannerEnergyForDate, setPlannerDayEnergy, toggleRestDate } from '@/stores/planning'
import { tasks } from '@/stores/tasks'
import { longPlans, weeklyPlans } from '@/stores/planning'
import { availableWindows, suggestUnscheduledTask } from '@/lib/calendarConnections'
import { minuteLabel } from '@/lib/calendar'
import GapMenu from './GapMenu.vue'
import ProtectedTimeEditor from './ProtectedTimeEditor.vue'
import PlanningCapacity from './PlanningCapacity.vue'
import type { PlannerEnergy, Task } from '@/types'
const props = defineProps<{ date: string; now: Date }>()
const emit = defineEmits<{ create: [date: string, time: string]; suggest: [task: Task, date: string, time: string] }>()
const customize = ref(false)
const dismissed = ref('')
watch(() => props.date, () => { dismissed.value = ''; customize.value = false })
const capacity = computed(() => dayCapacity(props.date))
const load = computed(() => dayLoad(props.date))
const remaining = computed(() => Math.max(0, capacity.value - load.value))
const rest = computed(() => planner.value.restDates.includes(props.date))
const suggestion = computed(() => suggestUnscheduledTask(tasks.value, props.date, remaining.value, props.now, weeklyPlans.value, longPlans.value, planner.value.protectedTimes))
const windows = computed(() => availableWindows(tasks.value, props.date, remaining.value, props.now, 30, planner.value.protectedTimes))
const energies: { value: PlannerEnergy; label: string }[] = [{ value: 'gentle', label: '温和' }, { value: 'steady', label: '平稳' }, { value: 'focused', label: '有余力' }]
</script>
<template>
  <section class="mb-6 rounded-xl border border-line bg-inset p-3" aria-label="当天节奏">
    <div class="flex items-center justify-between"><h3 class="flex items-center gap-2 text-sm font-semibold text-t1"><Leaf class="h-4 w-4 text-primary" />这一天，留多少空间</h3><button class="min-h-11 text-xs text-primary hover:underline" :aria-expanded="customize" @click="customize = !customize">设置</button></div>
    <div class="flex gap-1" role="group" aria-label="日历当天精力"><button v-for="energy in energies" :key="energy.value" class="min-h-11 min-w-0 flex-1 rounded-lg text-xs hover:bg-surface" :class="plannerEnergyForDate(date) === energy.value ? 'bg-primary/10 text-primary' : 'text-t3'" :aria-pressed="plannerEnergyForDate(date) === energy.value" @click="setPlannerDayEnergy(date, energy.value)">{{ energy.label }}</button></div>
    <p class="mt-3 text-xs leading-5" :class="load > capacity ? 'text-warn' : 'text-t3'">{{ rest ? '留白日 · 暂不推荐新安排' : `待办 ${load} / 可用 ${capacity} 分钟` }}{{ !rest && remaining ? ` · 还可留 ${remaining} 分钟` : '' }}</p>
    <div class="my-3 h-1 overflow-hidden rounded-full bg-line" role="meter" aria-label="当天容量使用" :aria-valuenow="Math.min(load, capacity)" :aria-valuemin="0" :aria-valuemax="Math.max(1, capacity)" :aria-valuetext="`待办 ${load} 分钟，可用 ${capacity} 分钟`"><div class="h-full" :class="load > capacity ? 'bg-warn' : 'bg-primary'" :style="{ width: `${Math.min(100, capacity ? load / capacity * 100 : 100)}%` }"></div></div>
    <p v-if="load > capacity" class="text-xs leading-5 text-warn">已有安排超出 {{ load - capacity }} 分钟，可以调整，也可以先保留。不会自动移动任务。</p>
    <template v-if="customize"><label class="mt-3 flex min-h-11 items-center gap-2 text-xs text-t2"><input type="checkbox" :checked="rest" class="accent-primary" @change="toggleRestDate(date)" />这一天留白</label><PlanningCapacity :date="date" /></template>
    <div v-if="suggestion && suggestion.task.id !== dismissed" class="mt-4 border-t border-line pt-3">
      <p class="flex items-center gap-2 text-xs font-medium text-primary"><Sparkles class="h-3.5 w-3.5" />空档里，安放一小步</p>
      <p class="mt-2 break-words text-sm text-t1">{{ suggestion.task.title }}</p>
      <p class="mt-1 text-xs leading-5 text-t3">收集箱中的 {{ suggestion.minutes }} 分钟任务，能放进 {{ minuteLabel(suggestion.start) }} 的空档和当天容量。</p>
      <div class="mt-2 flex items-center justify-between"><button class="min-h-11 text-xs text-primary hover:underline" @click="emit('suggest', suggestion.task, date, minuteLabel(suggestion.start))">预览这次安排</button><button class="min-h-11 text-xs text-t3 hover:underline" @click="dismissed = suggestion.task.id">先留白</button></div>
    </div>
    <GapMenu :date="date" :now="now" @suggest="(task, date, time) => emit('suggest', task, date, time)" /><ProtectedTimeEditor :date="date" />
    <details class="mt-3"><summary class="flex min-h-11 cursor-pointer items-center text-xs text-primary">留白窗口 · {{ windows.length }} 段可安排</summary><p class="mb-2 text-xs leading-5 text-t3">09:00–18:00 的未来空档，且剩余容量至少 30 分钟。避开保护的留白，不受日历筛选影响。</p><button v-for="slot in windows" :key="slot.start" class="mb-2 flex min-h-11 w-full items-center justify-between rounded-lg bg-surface px-3 text-xs text-primary hover:bg-primary/10" @click="emit('create', date, minuteLabel(slot.start))"><span>{{ minuteLabel(slot.start) }}–{{ minuteLabel(slot.end) }}</span><span>安排 30 分钟</span></button><p v-if="!windows.length" class="text-xs leading-5 text-t3">暂不推荐增加安排。可以换一天，或在日历中手动安排。</p></details>
  </section>
</template>
