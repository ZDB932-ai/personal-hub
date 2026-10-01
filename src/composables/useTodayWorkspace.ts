import { computed, onUnmounted, ref } from 'vue'
import { tasks } from '@/stores/tasks'
import { dayCapacity, dayLoad, longPlans, weeklyPlans } from '@/stores/planning'
import { taskPlans } from '@/lib/calendarConnections'
import { focusCandidates } from '@/lib/attention'
import { shiftYMD, toYMD } from '@/lib/utils'
import { memos } from '@/stores/memos'
import { nextScheduledTask } from '@/lib/todaySchedule'

export function useTodayWorkspace() {
  const now = ref(new Date())
  const timer = setInterval(() => { now.value = new Date() }, 30000)
  onUnmounted(() => clearInterval(timer))
  const day = computed(() => toYMD(now.value))
  const dateLabel = computed(() => now.value.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }))
  const opening = computed(() => memos.value.find(memo => memo.closingDate === shiftYMD(day.value, -1))?.openingNote)
  const daily = computed(() => tasks.value.filter(task => task.date === day.value))
  const pending = computed(() => daily.value.filter(task => !task.done).sort((a, b) => Number(b.focusDate === day.value) - Number(a.focusDate === day.value) || b.priority - a.priority || (a.time || '99').localeCompare(b.time || '99')))
  const completed = computed(() => daily.value.filter(task => task.done))
  const groups = computed(() => [
    { label: '今日重点', items: pending.value.filter(task => task.focusDate === day.value) },
    { label: '其他待办', items: pending.value.filter(task => task.focusDate !== day.value) },
  ].filter(group => group.items.length))
  const next = computed(() => focusCandidates(tasks.value, day.value).filter(task => task.resumeNote || task.resumeNextStep).sort((a, b) => (b.resumeUpdatedAt ?? 0) - (a.resumeUpdatedAt ?? 0)).find(task => {
    const goal = taskPlans(task, weeklyPlans.value, longPlans.value).goal
    return !goal || (goal.status === 'active' && (!goal.deferredUntil || goal.deferredUntil <= day.value))
  }))
  const timed = computed(() => pending.value.filter(task => task.time).sort((a, b) => a.time.localeCompare(b.time)))
  const upcoming = computed(() => nextScheduledTask(daily.value, day.value, now.value.getHours() * 60 + now.value.getMinutes()))
  const overdue = computed(() => tasks.value.filter(task => !task.done && task.date && task.date < day.value).length)
  const capacity = computed(() => dayCapacity(day.value))
  const load = computed(() => dayLoad(day.value))
  return { day, dateLabel, opening, daily, pending, completed, groups, next, timed, upcoming, overdue, capacity, load }
}
