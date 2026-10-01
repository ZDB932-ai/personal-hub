import type { LongPlan, ProtectedTime, Task, WeeklyPlan } from '@/types'
import { withoutProtected } from './attention'
import { freeSlots } from './calendar'
import { estimatedMinutes } from './planningCapacity'
import { toYMD } from './utils'

export function taskPlans(task: Pick<Task, 'weeklyPlanId' | 'longPlanId'>, weeks: WeeklyPlan[], goals: LongPlan[]) {
  const weekly = weeks.find(plan => plan.id === task.weeklyPlanId)
  const goalId = weekly ? weekly.longPlanId : task.longPlanId
  return { weekly, goal: goals.find(plan => plan.id === goalId) }
}

export function availableWindows(tasks: Task[], date: string, remaining: number, now: Date, duration = 30, protectedTimes: ProtectedTime[] = []) {
  const today = toYMD(now)
  if (date < today || remaining < duration) return []
  const earliest = date === today ? Math.ceil((now.getHours() * 60 + now.getMinutes() + (now.getSeconds() ? 1 : 0)) / 15) * 15 : 0
  return withoutProtected(freeSlots(tasks, date, duration), protectedTimes, date).map(slot => ({ start: Math.max(slot.start, earliest), end: slot.end })).filter(slot => slot.end - slot.start >= duration)
}

export function suggestUnscheduledTask(tasks: Task[], date: string, remaining: number, now: Date, weeks: WeeklyPlan[], goals: LongPlan[], protectedTimes: ProtectedTime[] = []) {
  const candidates = tasks.filter(task => {
    const context = taskPlans(task, weeks, goals)
    return !task.done && !task.date && (!context.goal || (context.goal.status === 'active' && (!context.goal.deferredUntil || context.goal.deferredUntil <= date))) && estimatedMinutes(task.estimatedMinutes) <= remaining
  }).sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  for (const task of candidates) {
    const minutes = estimatedMinutes(task.estimatedMinutes)
    const slot = availableWindows(tasks, date, remaining, now, minutes, protectedTimes)[0]
    if (slot) return { task, start: slot.start, minutes }
  }
  return null
}

export function goalTasks(goalId: string, tasks: Task[], weeks: WeeklyPlan[], goals: LongPlan[]): Task[] {
  return tasks.filter(task => taskPlans(task, weeks, goals).goal?.id === goalId)
}
