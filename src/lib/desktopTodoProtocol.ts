import type { Task } from '@/types'

export type TodoPhase = 'unavailable' | 'ready' | 'locking' | 'locked' | 'error' | 'exiting'
export interface TodoSelection { source: 'today' | 'manual' | 'tag'; tag: string; selectedIds: string[]; lockedIds: string[] }
export interface TodoItem {
  id: string
  title: string
  date: string
  time: string
  done: boolean
  priority?: number
  focus?: boolean
  subtasks?: { id: string; title: string; done: boolean }[]
}
export interface TodoView {
  phase: TodoPhase
  epoch: string
  revision: number
  items: TodoItem[]
  capturedAt: number
  source: TodoSelection['source']
  label: string
  saving: boolean
  error: string
  theme: { mode: string; accent: string; style: string }
}
export interface TodoWindowPreferences { enabled: boolean; pinned: boolean; collapsed: boolean; snap: boolean }
export interface TodoRequest {
  id: string
  epoch: string
  revision: number
  action: 'add' | 'done' | 'subtask' | 'move'
  taskId?: string
  subtaskId?: string
  value?: boolean
  text?: string
  direction?: number
  targetId?: string
}
export interface TodoReceipt { id: string; status: 'pending' | 'applied' | 'failed'; error: string }
export interface TodoSnapshot { preferences: TodoWindowPreferences; view: TodoView; receipts: TodoReceipt[] }

export function emptyTodoSelection(): TodoSelection { return { source: 'today', tag: '', selectedIds: [], lockedIds: [] } }
export function normalizeTodoSelection(raw: unknown): TodoSelection {
  const value = raw && typeof raw === 'object' ? raw as Partial<TodoSelection> : {}
  const ids = (v: unknown) => [...new Set(Array.isArray(v) ? v.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200) : [])].slice(0, 5000)
  return { source: value.source === 'manual' || value.source === 'tag' ? value.source : 'today', tag: typeof value.tag === 'string' ? value.tag.slice(0, 100) : '', selectedIds: ids(value.selectedIds), lockedIds: ids(value.lockedIds) }
}
export function selectTodoTasks(tasks: Task[], selection: TodoSelection, day: string): Task[] {
  const order = new Map(selection.selectedIds.map((id, index) => [id, index]))
  return tasks.filter(task => selection.source === 'manual' ? order.has(task.id) : selection.source === 'tag' ? Boolean(selection.tag) && task.tags.includes(selection.tag) : task.date === day || !task.done && Boolean(task.date) && task.date < day)
    .sort((a, b) => selection.source === 'manual' ? order.get(a.id)! - order.get(b.id)! : Number(a.done) - Number(b.done) || Number(b.focusDate === day) - Number(a.focusDate === day) || b.priority - a.priority || (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')))
}
export function projectTodoTasks(tasks: Task[], day: string): TodoItem[] {
  return tasks.map(task => ({ id: task.id, title: task.title, date: task.date, time: task.time, done: task.done, priority: task.priority, focus: task.focusDate === day, subtasks: task.subtasks.map(({ id, title, done }) => ({ id, title, done })) }))
}
export function lockedTodoSnapshot(tasks: Task[], ids: string[]): TodoItem[] {
  const allowed = new Set(ids)
  return tasks.filter(task => allowed.has(task.id)).map(({ id, title, date, time, done }) => ({ id, title, date, time, done }))
}
export function emptyTodoView(): TodoView {
  return { phase: 'unavailable', epoch: '', revision: 0, items: [], capturedAt: 0, source: 'today', label: '今天', saving: false, error: '', theme: { mode: 'light', accent: 'teal', style: 'classic' } }
}
