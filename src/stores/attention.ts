import { addMemo, memos, updateMemo, removeMemo } from './memos'
import { addTask, tasks, updateTask } from './tasks'
import { planner } from './planning'
import { validCalendarDate } from '@/lib/attention'
import { shiftYMD, toYMD, uid } from '@/lib/utils'
import type { ProtectedTime } from '@/types'

export function saveResume(id: string, field: 'resumeNote' | 'resumeNextStep', value: string): void {
  const task = tasks.value.find(item => item.id === id)
  if (!task || task.done) return
  updateTask(id, { [field]: value.slice(0, 2000), resumeUpdatedAt: Date.now() })
}

export function captureSpark(content: string, taskId?: string) {
  const text = content.trim()
  if (!text) return null
  return addMemo({ title: text.split('\n')[0]!.slice(0, 40), content: text, color: 'amber', pinned: false, captureStatus: 'inbox', capturedFromTaskId: tasks.value.some(task => task.id === taskId) ? taskId : undefined })
}

export function promoteSpark(id: string) {
  const memo = memos.value.find(item => item.id === id)
  if (!memo || memo.captureStatus === 'draft') return null
  const existing = tasks.value.find(task => task.links?.some(link => link.kind === 'memos' && link.id === id))
  if (existing && memo.ideaStage === 'growing') return null
  if (existing) { updateMemo(id, { ideaStage: 'growing', captureStatus: 'kept' }); return existing }
  if (memo.captureStatus !== 'inbox' && !memo.ideaStage) return null
  const task = addTask({ title: memo.title || memo.content.slice(0, 80), notes: '', date: '', time: '', priority: 2, repeat: 'none', links: [{ kind: 'memos', id }], estimatedMinutes: 15 })
  updateMemo(id, { captureStatus: 'kept', ideaStage: 'growing' })
  return task
}

export function protectTime(input: Omit<ProtectedTime, 'id'>): void {
  if (!validCalendarDate(input.date) || !Number.isInteger(input.start) || !Number.isInteger(input.end) || input.start < 0 || input.end > 1440 || input.end <= input.start) throw new Error('请选择有效日期，结束时间需晚于开始时间')
  planner.value.protectedTimes = [...(planner.value.protectedTimes ?? []), { ...input, label: input.label.trim() || '留给自己', id: uid() }]
}

export function releaseTime(id: string): void { planner.value.protectedTimes = (planner.value.protectedTimes ?? []).filter(item => item.id !== id) }

export function pocketDraft(taskId?: string) {
  return memos.value.find(memo => memo.captureStatus === 'draft' && memo.capturedFromTaskId === taskId)
}

export function writePocketDraft(content: string, taskId?: string): void {
  const current = pocketDraft(taskId)
  if (!content) { if (current) removeMemo(current.id); return }
  const patch = { content: content.slice(0, 2000), title: content.trim().split('\n')[0]!.slice(0, 40) || '灵感草稿' }
  if (current) updateMemo(current.id, patch)
  else addMemo({ ...patch, capturedFromTaskId: taskId, captureStatus: 'draft', color: 'amber', pinned: false })
}

export async function collectPocketDraft(taskId: string | undefined, save: () => Promise<unknown>): Promise<boolean> {
  const draft = pocketDraft(taskId)
  if (!draft?.content.trim()) return false
  const content = draft.content
  updateMemo(draft.id, { captureStatus: 'inbox' })
  try { await save(); return true }
  catch (error) {
    const current = memos.value.find(memo => memo.id === draft.id)
    if (current?.captureStatus === 'inbox' && current.content === content) updateMemo(current.id, { captureStatus: 'draft' })
    throw error
  }
}

export function closeDay(date: string, openingNote: string, moveIds: string[]): void {
  if (!validCalendarDate(date)) throw new Error('收尾日期无效')
  const done = tasks.value.filter(task => task.done && task.doneAt && toYMD(new Date(task.doneAt)) === date)
  const content = done.length ? `今天留下：\n${done.map(task => `· ${task.title}`).join('\n')}` : '今天也给自己留了一点空间。'
  const patch = { title: `${date} · 一天收尾`, content, openingNote: openingNote.trim().slice(0, 2000), closingDate: date }
  const record = memos.value.find(memo => memo.closingDate === date)
  if (record) updateMemo(record.id, patch)
  else addMemo({ ...patch, color: 'emerald', pinned: false })
  for (const task of tasks.value.filter(task => !task.done && task.date === date && moveIds.includes(task.id))) updateTask(task.id, { date: shiftYMD(date, 1), time: '' })
}
