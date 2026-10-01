import { describe, expect, it } from 'vitest'
import type { Task } from '@/types'
import { nextScheduledTask } from '../todaySchedule'

const day = '2026-09-29'
const task = (time: string, patch: Partial<Task> = {}): Task => ({ id: time, title: time, date: day, time, done: false, notes: '', priority: 2, repeat: 'none', tags: [], subtasks: [], createdAt: 0, updatedAt: 0, ...patch })

describe('today schedule summary', () => {
  it('skips completed, past, unscheduled and other-day tasks', () => {
    const upcoming = task('11:00')
    const result = nextScheduledTask([task('08:00'), task('10:00', { done: true }), task(''), task('09:30', { date: '2026-09-30' }), upcoming], day, 9 * 60)
    expect(result).toEqual({ task: upcoming, label: '接下来' })
  })
  it('keeps an ongoing appointment ahead of a later one and advances at its end', () => {
    const current = task('09:00', { estimatedMinutes: 60 }), later = task('10:30')
    expect(nextScheduledTask([later, current], day, 9 * 60 + 45)).toEqual({ task: current, label: '此刻安排' })
    expect(nextScheduledTask([later, current], day, 10 * 60)).toEqual({ task: later, label: '接下来' })
  })
  it('uses the existing 30-minute estimate and never calls past work upcoming', () => {
    expect(nextScheduledTask([task('09:00')], day, 9 * 60 + 29)?.label).toBe('此刻安排')
    expect(nextScheduledTask([task('09:00'), task('25:00')], day, 9 * 60 + 30)).toBeNull()
  })
})
