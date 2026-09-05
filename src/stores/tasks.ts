import { ref } from 'vue'
import type { SubTask, Task, TaskPriority, TaskRepeat } from '@/types'
import { nextOccurrence, uid } from '@/lib/utils'

export const tasks = ref<Task[]>([])

export function normalizeTask(t: Task): Task {
  return {
    ...t,
    focusDate: typeof t.focusDate === 'string' ? t.focusDate : undefined,
    weeklyPlanId: typeof t.weeklyPlanId === 'string' ? t.weeklyPlanId : undefined,
    longPlanId: typeof t.longPlanId === 'string' ? t.longPlanId : undefined,
    scheduledBy: t.scheduledBy === 'weekly-auto' ? 'weekly-auto' : t.scheduledBy === 'manual' ? 'manual' : undefined,
    scheduleLocked: Boolean(t.scheduleLocked),
    tags: Array.isArray(t.tags) ? t.tags : [],
    subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
  }
}

export interface TaskDraft {
  title: string
  notes: string
  date: string
  time: string
  priority: TaskPriority
  repeat: TaskRepeat
  tags?: string[]
  subtasks?: SubTask[]
  weeklyPlanId?: string
  longPlanId?: string
  scheduledBy?: 'manual' | 'weekly-auto'
  scheduleLocked?: boolean
}

export function addTask(draft: TaskDraft): Task {
  const now = Date.now()
  const task: Task = {
    id: uid(),
    done: false,
    createdAt: now,
    updatedAt: now,
    tags: draft.tags ?? [],
    subtasks: draft.subtasks ?? [],
    ...draft,
  }
  tasks.value.push(task)
  return task
}

export function updateTask(id: string, patch: Partial<Task>): void {
  const t = tasks.value.find((x) => x.id === id)
  if (!t) return
  const movedFromWeeklyPlan = Boolean(t.weeklyPlanId && 'date' in patch && patch.date !== t.date)
  Object.assign(t, patch, movedFromWeeklyPlan ? { scheduledBy: 'manual', scheduleLocked: true } : {}, { updatedAt: Date.now() })
}

export function removeTask(id: string): void {
  const i = tasks.value.findIndex((t) => t.id === id)
  if (i >= 0) tasks.value.splice(i, 1)
}

export function setTaskFocus(id: string, focusDate?: string): void {
  const t = tasks.value.find((x) => x.id === id)
  if (!t) return
  t.focusDate = focusDate
  t.updatedAt = Date.now()
}

export function toggleTaskDone(id: string): void {
  const t = tasks.value.find((x) => x.id === id)
  if (!t) return
  t.done = !t.done
  t.doneAt = t.done ? Date.now() : undefined
  if (t.done) t.focusDate = undefined
  t.updatedAt = Date.now()
  if (t.done && t.repeat !== 'none' && t.date) {
    const next = nextOccurrence(t.date, t.repeat)
    const now = Date.now()
    tasks.value.push({
      ...t,
      id: uid(),
      date: next,
      done: false,
      doneAt: undefined,
      focusDate: undefined,
      weeklyPlanId: undefined,
      longPlanId: undefined,
      scheduledBy: undefined,
      scheduleLocked: undefined,
      lastRemindedTs: undefined,
      subtasks: (t.subtasks ?? []).map((s) => ({ ...s, done: false })),
      createdAt: now,
      updatedAt: now,
    })
  }
}

export function addSubTask(taskId: string, title: string): void {
  const t = tasks.value.find((x) => x.id === taskId)
  const v = title.trim()
  if (!t || !v) return
  t.subtasks.push({ id: uid(), title: v, done: false })
  t.updatedAt = Date.now()
}

export function toggleSubTask(taskId: string, subId: string): void {
  const t = tasks.value.find((x) => x.id === taskId)
  const s = t?.subtasks.find((x) => x.id === subId)
  if (t && s) {
    s.done = !s.done
    t.updatedAt = Date.now()
  }
}

export function removeSubTask(taskId: string, subId: string): void {
  const t = tasks.value.find((x) => x.id === taskId)
  if (!t) return
  const i = t.subtasks.findIndex((x) => x.id === subId)
  if (i >= 0) {
    t.subtasks.splice(i, 1)
    t.updatedAt = Date.now()
  }
}
