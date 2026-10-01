import type { LongPlan, Memo, ProtectedTime, Task, WeeklyPlan } from '@/types'
import { availableWindows, taskPlans } from './calendarConnections'
import { estimatedMinutes } from './planningCapacity'

export function gapChoices(tasks: Task[], date: string, remaining: number, now: Date, limit: number, light: boolean, weeks: WeeklyPlan[], goals: LongPlan[], protectedTimes: ProtectedTime[]) {
  return tasks.filter(task => {
    const goal = taskPlans(task, weeks, goals).goal
    return !task.done && !task.date && estimatedMinutes(task.estimatedMinutes) <= Math.min(limit, remaining, light ? 15 : limit) && (!goal || goal.status === 'active' && (!goal.deferredUntil || goal.deferredUntil <= date))
  }).sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt).flatMap(task => {
    const slot = availableWindows(tasks, date, remaining, now, estimatedMinutes(task.estimatedMinutes), protectedTimes)[0]
    return slot ? [{ task, start: slot.start }] : []
  }).slice(0, 3)
}

export function projectStory(goal: LongPlan, tasks: Task[], weeks: WeeklyPlan[], memos: Memo[]) {
  const linked = tasks.filter(task => taskPlans(task, weeks, [goal]).goal?.id === goal.id)
  const nodes: Array<{ key: string; time: number; label: string; title: string; task?: Task; memo?: Memo }> = [
    { key: `goal:${goal.id}`, time: goal.createdAt, label: '最初的方向', title: goal.description || goal.title },
  ]
  for (const task of linked) {
    nodes.push({ key: `start:${task.id}`, time: task.createdAt, label: '开始行动', title: task.title, task })
    if (task.done && task.doneAt) nodes.push({ key: `done:${task.id}`, time: task.doneAt, label: '留下成果', title: task.title, task })
  }
  for (const memo of memos) {
    if (memo.captureStatus === 'draft') continue
    if (linked.some(task => task.id === memo.capturedFromTaskId || task.links?.some(link => link.kind === 'memos' && link.id === memo.id))) nodes.push({ key: `memo:${memo.id}`, time: memo.createdAt, label: '留下想法', title: memo.title || '未命名便签', memo })
  }
  return nodes.sort((a, b) => a.time - b.time || a.key.localeCompare(b.key))
}
