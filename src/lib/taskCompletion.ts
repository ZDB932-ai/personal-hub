import { addTask, tasks, toggleTaskDone, updateTask } from '@/stores/tasks'
import { addMemo } from '@/stores/memos'
import { longPlans, weeklyPlans, updateLongPlan } from '@/stores/planning'
import { taskPlans } from './calendarConnections'
import { toYMD } from './utils'

export interface CompletionInput { note: string; nextTitle: string; saveMemo?: boolean }

export function completeWithProgress(id: string, input: CompletionInput): boolean {
  const task = tasks.value.find(item => item.id === id)
  if (!task || task.done) return false
  const sourceLinks = (task.links ?? []).map(link => ({ ...link }))
  const goal = taskPlans(task, weeklyPlans.value, longPlans.value).goal
  const note = input.note.trim()
  toggleTaskDone(id)
  if (note) {
    updateTask(id, { notes: `${task.notes ? `${task.notes}\n\n` : ''}完成记录：${note}` })
    if (input.saveMemo) {
      const memo = addMemo({ title: `进展 · ${task.title}`, content: `${toYMD(new Date())} · 完成「${task.title}」${goal ? `\n方向：${goal.title}` : ''}\n\n${note}`, color: 'emerald', pinned: false })
      updateTask(id, { links: [...sourceLinks, { kind: 'memos', id: memo.id }] })
    }
  }
  if (input.nextTitle.trim()) {
    addTask({ title: input.nextTitle.trim(), notes: '', date: '', time: '', priority: task.priority, repeat: 'none', tags: [...task.tags], links: sourceLinks, longPlanId: goal?.id, estimatedMinutes: task.estimatedMinutes })
    if (goal?.nextStep.trim() === task.title.trim()) updateLongPlan(goal.id, { nextStep: input.nextTitle.trim() })
  }
  return true
}
