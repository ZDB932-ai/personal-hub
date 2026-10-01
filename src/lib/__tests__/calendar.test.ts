import { describe, expect, it, vi } from 'vitest'
vi.hoisted(() => { Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }) })
import { dayBlocks, freeSlots, lunarLabel, memoDraft, monthDates, shiftMonth, timelineBlocks, TIMELINE_MIN_EVENT_HEIGHT } from '../calendar'
import type { Task } from '@/types'

function task(id: string, time: string, duration = 60, date = '2026-09-25'): Task {
  return { id, title: id, time, date, estimatedMinutes: duration, notes: '', priority: 2, repeat: 'none', done: false, tags: [], subtasks: [], createdAt: 1, updatedAt: 1 }
}

describe('calendar dates and layout', () => {
  it('keeps short event cards readable without changing their real time or availability', () => {
    const tasks = [task('a', '09:15', 15), task('b', '09:30', 15)]
    const blocks = timelineBlocks(tasks, '2026-09-25')
    expect(blocks.map(block => block.height)).toEqual([44, 44])
    expect(blocks.map(block => [block.start, block.end])).toEqual([[555, 570], [570, 585]])
    expect(blocks.map(block => block.lane)).toEqual([0, 1])
    expect(dayBlocks(tasks, '2026-09-25').every(block => block.lanes === 1)).toBe(true)
    expect(freeSlots(tasks, '2026-09-25')).toEqual([{ start: 585, end: 1080 }])
  })
  it('never overlaps readable cards in the same display lane, including dense mixed durations', () => {
    const blocks = timelineBlocks([task('a', '09:00', 90), task('b', '09:15', 1), task('c', '09:30', 15), task('d', '09:45', 15), task('e', '11:00', 30)], '2026-09-25')
    for (const a of blocks) for (const b of blocks) {
      if (a === b || a.lane !== b.lane) continue
      expect(a.top + a.height <= b.top || b.top + b.height <= a.top).toBe(true)
    }
    expect(blocks.at(-1)?.lanes).toBe(1)
  })
  it('keeps midnight fragments readable and preserves the next-day continuation', () => {
    const tasks = [task('late', '23:59', 5)]
    const late = timelineBlocks(tasks, '2026-09-25')[0]!
    const next = timelineBlocks(tasks, '2026-09-26')[0]!
    expect(late.height).toBe(TIMELINE_MIN_EVENT_HEIGHT)
    expect(late.continues).toBe(true)
    expect(next.height).toBe(TIMELINE_MIN_EVENT_HEIGHT)
    expect([next.start, next.end, next.continued]).toEqual([0, 4, true])
  })
  it('formats real lunar dates including Mid-Autumn and lunar month starts', () => {
    expect(lunarLabel('2026-09-25')).toBe('十五')
    expect(lunarLabel('2026-09-25', true)).toBe('八月')
    expect(lunarLabel('2026-09-11')).toBe('八月')
  })
  it('starts months on Monday and clamps month-end navigation including leap years', () => {
    const dates = monthDates('2026-02-15')
    expect(dates).toHaveLength(42)
    expect(dates[0]).toBe('2026-01-26')
    expect(dates.at(-1)).toBe('2026-03-08')
    expect(shiftMonth('2024-01-31', 1)).toBe('2024-02-29')
    expect(shiftMonth('2025-01-31', 1)).toBe('2025-02-28')
    expect(shiftMonth('2026-01-31', -1)).toBe('2025-12-31')
  })
  it('assigns separate lanes for overlaps and reuses them for adjacent blocks', () => {
    const blocks = dayBlocks([task('a', '09:00', 120), task('b', '09:30'), task('c', '10:30', 30), task('d', '11:00')], '2026-09-25')
    expect(blocks.map(b => [b.lane, b.lanes])).toEqual([[0, 2], [1, 2], [1, 2], [0, 1]])
  })
  it('splits midnight tasks into both dates without duplicating all-day tasks', () => {
    const tasks = [task('night', '23:30', 120), task('floating', '')]
    expect(dayBlocks(tasks, '2026-09-25').map(b => [b.start, b.end, b.continues])).toEqual([[1410, 1440, true]])
    expect(dayBlocks(tasks, '2026-09-26').map(b => [b.start, b.end, b.continued])).toEqual([[0, 90, true]])
    expect(dayBlocks(tasks, '2026-09-27')).toEqual([])
  })
  it('merges busy intervals and excludes completed and undated work from free slots', () => {
    const tasks = [task('a', '09:00', 120), task('b', '10:00', 120), { ...task('done', '13:00', 120), done: true }, task('inbox', ''), task('late', '17:45', 60)]
    expect(freeSlots(tasks, '2026-09-25')).toEqual([{ start: 720, end: 1065 }])
    expect(freeSlots([task('full', '00:00', 1440)], '2026-09-25')).toEqual([])
    expect(freeSlots([task('carry', '23:00', 720, '2026-09-24')], '2026-09-25')).toEqual([{ start: 660, end: 1080 }])
  })
  it('links memo source and deduplicates tags without copying mutable content', () => {
    const draft = memoDraft({ id: 'memo', title: '会议准备', content: '#工作 #工作\n会议资料', color: 'slate', pinned: false, createdAt: 1, updatedAt: 1 })
    expect(draft.links).toEqual([{ kind: 'memos', id: 'memo' }])
    expect(draft.tags).toEqual(['工作'])
    expect(draft.notes).toBeUndefined()
  })
})
