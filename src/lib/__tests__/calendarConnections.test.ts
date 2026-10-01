import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.hoisted(() => { Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }) })
import { availableWindows, goalTasks, suggestUnscheduledTask, taskPlans } from '../calendarConnections'
import { completeWithProgress } from '../taskCompletion'
import { addTask, tasks } from '@/stores/tasks'
import { memos } from '@/stores/memos'
import { addLongPlan, addWeeklyPlan, dayCapacity, dayLoad, longPlans, planner, weeklyPlans } from '@/stores/planning'
import type { Task } from '@/types'

const date = '2026-09-28'
const now = new Date(`${date}T09:07:01`)
function task(id: string, patch: Partial<Task> = {}): Task { return { id, title: id, date: '', time: '', notes: '', priority: 2, repeat: 'none', done: false, tags: [], subtasks: [], createdAt: 1, updatedAt: 1, ...patch } }
function goal(title: string) { return addLongPlan({ title, description: '', area: '', horizon: 'quarter', targetDate: '', nextStep: '', status: 'active' }) }
beforeEach(() => { tasks.value = []; memos.value = []; longPlans.value = []; weeklyPlans.value = []; planner.value = { energy: 'steady', restDates: [], dayEnergies: [] } })

describe('calendar connections', () => {
  it('uses the current weekly goal after reassignment and direct goals when the source is absent', () => {
    const a = goal('a'), b = goal('b')
    const week = addWeeklyPlan({ title: 'week', notes: '', weekStart: date, priority: 2, sessions: 2, preferredWeekdays: [], longPlanId: b.id })
    const action = task('action', { weeklyPlanId: week.id, longPlanId: a.id })
    expect(taskPlans(action, weeklyPlans.value, longPlans.value).goal?.id).toBe(b.id)
    expect(goalTasks(a.id, [action], weeklyPlans.value, longPlans.value)).toEqual([])
    expect(taskPlans(action, [], longPlans.value).goal?.id).toBe(a.id)
  })
  it('uses future quarter-hour windows and rejects past dates or insufficient capacity', () => {
    expect(availableWindows([], date, 60, now)[0]?.start).toBe(555)
    expect(availableWindows([], '2026-09-27', 300, now)).toEqual([])
    expect(availableWindows([], date, 29, now)).toEqual([])
    expect(availableWindows([], date, 300, new Date(`${date}T17:46:00`))).toEqual([])
  })
  it('fits a pending task around all busy blocks without mutating it', () => {
    const pool = [task('busy', { date, time: '09:00', estimatedMinutes: 60 }), task('too-long', { priority: 3, estimatedMinutes: 120 }), task('fits', { estimatedMinutes: 30 })]
    const before = JSON.stringify(pool)
    const suggestion = suggestUnscheduledTask(pool, date, 60, now, [], [])
    expect(suggestion?.task.id).toBe('fits')
    expect(suggestion?.start).toBe(600)
    expect(JSON.stringify(pool)).toBe(before)
  })
  it('accounts for undated-time loads and rest days; skips paused goals', () => {
    const paused = goal('paused'); paused.status = 'paused'
    tasks.value = [task('floating', { date, estimatedMinutes: 170 }), task('pending', { estimatedMinutes: 15 }), task('paused', { longPlanId: paused.id, priority: 3, estimatedMinutes: 5 })]
    expect(dayLoad(date)).toBe(170)
    expect(suggestUnscheduledTask(tasks.value, date, dayCapacity(date) - dayLoad(date), now, [], longPlans.value)).toBeNull()
    planner.value.restDates = [date]
    expect(dayCapacity(date)).toBe(0)
    expect(availableWindows(tasks.value, date, dayCapacity(date), now, 15)).toEqual([])
  })
  it('saves a linked progress memo and keeps source and goal on an optional next step', () => {
    const direction = goal('作品集')
    direction.nextStep = '整理作品'
    const original = addTask({ ...task('ignored'), title: '整理作品', longPlanId: direction.id, links: [{ kind: 'docMetas', id: 'document' }] })
    expect(completeWithProgress(original.id, { note: '完成初稿', nextTitle: '校对', saveMemo: true })).toBe(true)
    expect(original.done).toBe(true)
    expect(memos.value[0]?.content).toContain('方向：作品集')
    expect(original.links).toContainEqual({ kind: 'memos', id: memos.value[0]?.id })
    const next = tasks.value.find(item => item.title === '校对')!
    expect(next.longPlanId).toBe(direction.id)
    expect(longPlans.value[0]?.nextStep).toBe('校对')
    expect(next.date).toBe('')
    expect(next.links).toEqual([{ kind: 'docMetas', id: 'document' }])
    expect(completeWithProgress(original.id, { note: 'duplicate', nextTitle: 'duplicate', saveMemo: true })).toBe(false)
    expect(memos.value).toHaveLength(1)
    expect(tasks.value).toHaveLength(2)
  })
  it('keeps the new completion record out of the next recurring occurrence', () => {
    const original = addTask({ ...task('ignored'), date, repeat: 'daily', notes: '原始资料', links: [{ kind: 'memos', id: 'source' }] })
    completeWithProgress(original.id, { note: '今天的进展', nextTitle: '', saveMemo: true })
    const next = tasks.value.find(item => item.repeatSourceId === original.id)!
    expect(next.date).toBe('2026-09-29')
    expect(next.notes).toBe('原始资料')
    expect(next.links).toEqual([{ kind: 'memos', id: 'source' }])
    expect(original.notes).toContain('今天的进展')
  })
  it('creates no memo for blank notes or when the user opts out', () => {
    const first = addTask(task('first')), second = addTask(task('second'))
    completeWithProgress(first.id, { note: '  ', nextTitle: '', saveMemo: true })
    completeWithProgress(second.id, { note: '仅在任务中保存', nextTitle: '', saveMemo: false })
    expect(memos.value).toHaveLength(0)
    expect(second.notes).toContain('仅在任务中保存')
  })
})
