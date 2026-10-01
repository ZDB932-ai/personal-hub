import type { Memo, Task } from '@/types'
import { shiftYMD, toYMD, weekStartYMD } from '@/lib/utils'
import { estimatedMinutes } from '@/lib/planningCapacity'

const lunarFormatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' })
const lunarDays = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十']

export function lunarLabel(date: string, month = false): string {
  const parts = lunarFormatter.formatToParts(new Date(`${date}T12:00:00`))
  const day = Number(parts.find(part => part.type === 'day')?.value)
  const monthLabel = parts.find(part => part.type === 'month')?.value ?? ''
  return month || day === 1 ? monthLabel : lunarDays[day - 1] ?? ''
}

export function monthDates(date: string): string[] {
  const start = weekStartYMD(`${date.slice(0, 7)}-01`)
  return Array.from({ length: 42 }, (_, i) => shiftYMD(start, i))
}

export function shiftMonth(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00`)
  const day = value.getDate()
  value.setDate(1)
  value.setMonth(value.getMonth() + amount)
  const last = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate()
  value.setDate(Math.min(day, last))
  return toYMD(value)
}

export function timeMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function minuteLabel(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

export interface CalendarBlock {
  task: Task
  start: number
  end: number
  continued: boolean
  continues: boolean
  lane: number
  lanes: number
}

export const TIMELINE_HOUR_HEIGHT = 96
export const TIMELINE_MIN_EVENT_HEIGHT = 44

export function timelineBlocks(tasks: Task[], date: string) {
  const blocks = dayBlocks(tasks, date).map(block => ({
    ...block,
    top: block.start / 60 * TIMELINE_HOUR_HEIGHT,
    height: Math.max(TIMELINE_MIN_EVENT_HEIGHT, (block.end - block.start) / 60 * TIMELINE_HOUR_HEIGHT - 2),
  }))
  let group: typeof blocks = []
  let ends: number[] = []
  let groupEnd = -1
  const finish = () => { for (const block of group) block.lanes = ends.length }
  for (const block of blocks) {
    if (block.top >= groupEnd) { finish(); group = []; ends = []; groupEnd = -1 }
    let lane = ends.findIndex(end => end <= block.top)
    if (lane < 0) lane = ends.length
    ends[lane] = block.top + block.height + 2
    block.lane = lane
    group.push(block)
    groupEnd = Math.max(groupEnd, ends[lane]!)
  }
  finish()
  return blocks
}

export function dayBlocks(tasks: Task[], date: string): CalendarBlock[] {
  const blocks: CalendarBlock[] = []
  for (const task of tasks) {
    if (!task.time || !task.date) continue
    const start = timeMinutes(task.time)
    if (!Number.isFinite(start)) continue
    const end = start + estimatedMinutes(task.estimatedMinutes)
    if (task.date === date) blocks.push({ task, start, end: Math.min(end, 1440), continued: false, continues: end > 1440, lane: 0, lanes: 1 })
    else if (shiftYMD(task.date, 1) === date && end > 1440) blocks.push({ task, start: 0, end: end - 1440, continued: true, continues: false, lane: 0, lanes: 1 })
  }
  blocks.sort((a, b) => a.start - b.start || b.end - a.end || a.task.id.localeCompare(b.task.id))
  let group: CalendarBlock[] = []
  let ends: number[] = []
  let groupEnd = -1
  const finish = () => { for (const block of group) block.lanes = ends.length }
  for (const block of blocks) {
    if (block.start >= groupEnd) { finish(); group = []; ends = []; groupEnd = -1 }
    let lane = ends.findIndex(end => end <= block.start)
    if (lane < 0) lane = ends.length
    ends[lane] = block.end
    block.lane = lane
    group.push(block)
    groupEnd = Math.max(groupEnd, block.end)
  }
  finish()
  return blocks
}

export function freeSlots(tasks: Task[], date: string, duration = 30): { start: number; end: number }[] {
  const blocks = dayBlocks(tasks.filter(t => !t.done), date)
  let cursor = 9 * 60
  const slots: { start: number; end: number }[] = []
  for (const block of blocks) {
    const start = Math.max(9 * 60, Math.min(18 * 60, block.start))
    const end = Math.max(9 * 60, Math.min(18 * 60, block.end))
    if (start - cursor >= duration) slots.push({ start: cursor, end: start })
    cursor = Math.max(cursor, end)
  }
  if (18 * 60 - cursor >= duration) slots.push({ start: cursor, end: 18 * 60 })
  return slots
}

export function memoDraft(memo: Memo): Partial<Task> {
  return {
    title: (memo.title || memo.content.split('\n').find(line => line.trim()) || '备忘录任务').slice(0, 120),
    links: [{ kind: 'memos', id: memo.id }],
    tags: [...new Set([...memo.content.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map(match => match[1]))].slice(0, 5),
    estimatedMinutes: 30,
  }
}
