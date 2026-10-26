import { tasks, addTask, toggleTaskDone, toggleSubTask } from '@/stores/tasks'
import { completeWithProgress } from './taskCompletion'
import { parseQuickInput } from './quickparse'
import { toYMD } from './utils'
import type { TodoRequest, TodoSelection } from './desktopTodoProtocol'

export function applyTodoAction(request: TodoRequest, selection: TodoSelection): string | undefined {
  if (request.action === 'add') {
    const text = request.text?.trim() ?? ''
    if (!text || text.length > 500) throw new Error('请输入 1–500 字的任务')
    const parsed = parseQuickInput(text)
    if (!parsed.title.trim()) throw new Error('请输入任务标题')
    const task = addTask({ title: parsed.title, date: parsed.date ?? toYMD(new Date()), time: parsed.time ?? '', notes: '', priority: 2, repeat: 'none', tags: [...new Set([...parsed.tags, ...(selection.source === 'tag' && selection.tag ? [selection.tag] : [])])] })
    return task.id
  }
  const task = tasks.value.find(item => item.id === request.taskId)
  if (!task) throw new Error('任务已被移除，请刷新清单')
  if (request.action === 'done') {
    if (typeof request.value !== 'boolean') throw new Error('任务状态无效')
    if (task.done !== request.value) {
      if (request.value) completeWithProgress(task.id, { note: '', nextTitle: '' })
      else toggleTaskDone(task.id)
    }
  } else if (request.action === 'subtask') {
    const child = task.subtasks.find(item => item.id === request.subtaskId)
    if (!child || typeof request.value !== 'boolean') throw new Error('子任务状态已变化')
    if (child.done !== request.value) toggleSubTask(task.id, child.id)
  } else if (request.action !== 'move') throw new Error('不支持的任务操作')
}
