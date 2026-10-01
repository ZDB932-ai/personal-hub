import type { Task } from '@/types'

export function nextScheduledTask(items: Task[], day: string, minute: number): { task: Task; label: string } | null {
  const timed = items.filter(task => !task.done && task.date === day && /^([01]\d|2[0-3]):[0-5]\d$/.test(task.time))
    .map(task => ({ task, start: Number(task.time.slice(0, 2)) * 60 + Number(task.time.slice(3)), duration: task.estimatedMinutes || 30 }))
    .sort((a, b) => a.start - b.start)
  const current = timed.find(item => item.start <= minute && item.start + item.duration > minute)
  if (current) return { task: current.task, label: '此刻安排' }
  const next = timed.find(item => item.start > minute)
  return next ? { task: next.task, label: '接下来' } : null
}
