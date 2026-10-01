import type { ProtectedTime, Task } from '@/types'

export function protectedIntervals(items: ProtectedTime[], date: string) {
  const merged: Array<{ start: number; end: number }> = []
  for (const item of items.filter(item => item.date === date).sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1)
    if (last && item.start <= last.end) last.end = Math.max(last.end, item.end)
    else merged.push({ start: item.start, end: item.end })
  }
  return merged
}

export function focusCandidates(tasks: Task[], date: string): Task[] {
  return tasks.filter(task => !task.done && (!task.date || task.date <= date)).sort((a, b) => Number(b.focusDate === date) - Number(a.focusDate === date) || (b.resumeUpdatedAt ?? 0) - (a.resumeUpdatedAt ?? 0) || b.priority - a.priority || a.createdAt - b.createdAt)
}

export function withoutProtected(windows: Array<{ start: number; end: number }>, items: ProtectedTime[], date: string) {
  let result = windows.map(window => ({ ...window }))
  for (const item of protectedIntervals(items, date)) {
    result = result.flatMap(window => item.end <= window.start || item.start >= window.end ? [window] : [
      ...(item.start > window.start ? [{ start: window.start, end: item.start }] : []),
      ...(item.end < window.end ? [{ start: item.end, end: window.end }] : []),
    ])
  }
  return result
}

export function validCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00`)
  return Number.isFinite(date.getTime()) && date.getFullYear() === Number(value.slice(0, 4)) && date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8))
}

export function taskMinutesOnDate(task: Pick<Task, 'date' | 'time' | 'estimatedMinutes' | 'done'>, date: string): number {
  if (task.done || !task.date) return 0
  const minutes = Number.isInteger(task.estimatedMinutes) && task.estimatedMinutes! > 0 && task.estimatedMinutes! <= 1440 ? task.estimatedMinutes! : 30
  if (!task.time) return task.date === date ? minutes : 0
  const [hours, mins] = task.time.split(':').map(Number)
  const start = hours! * 60 + mins!
  if (!Number.isFinite(start) || start < 0 || start >= 1440) return 0
  if (task.date === date) return Math.min(minutes, 1440 - start)
  const next = new Date(`${task.date}T12:00:00`)
  next.setDate(next.getDate() + 1)
  const nextDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
  return nextDate === date ? Math.max(0, start + minutes - 1440) : 0
}
