import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.hoisted(() => { Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }) })
import { taskMinutesOnDate, validCalendarDate, focusCandidates, protectedIntervals, withoutProtected } from '../attention'
import { availableWindows, suggestUnscheduledTask } from '../calendarConnections'
import { validateEntity } from '../payloadSchema'
import { collectPocketDraft, pocketDraft, writePocketDraft, captureSpark, promoteSpark, protectTime, releaseTime, saveResume } from '@/stores/attention'
import { addTask, tasks, toggleTaskDone } from '@/stores/tasks'
import { memos } from '@/stores/memos'
import { addLongPlan, addWeeklyPlan, createWeekScheduleDraft, dayCapacity, dayLoad, longPlans, normalizePlanner, planner, weeklyPlans } from '@/stores/planning'
const date = '2026-09-28'
const task = (title: string) => addTask({ title, date, time: '', priority: 2, repeat: 'none', notes: '', estimatedMinutes: 15 })
beforeEach(() => { tasks.value = []; memos.value = []; longPlans.value = []; weeklyPlans.value = []; planner.value = { energy: 'steady', restDates: [], dayEnergies: [] } })

describe('attention workspace', () => {
  it('keeps resume clues on the task without modifying schedule; repeat starts with clean clues', () => {
    const item = task('作品'); item.repeat = 'daily'
    saveResume(item.id, 'resumeNote', '完成封面')
    saveResume(item.id, 'resumeNextStep', '打开第二页')
    expect(tasks.value[0]?.resumeNextStep).toBe('打开第二页')
    expect(tasks.value[0]?.date).toBe(date)
    expect(() => validateEntity('tasks', tasks.value[0])).not.toThrow()
    toggleTaskDone(item.id)
    expect(tasks.value[1]?.resumeNote).toBeUndefined()
    expect(tasks.value[1]?.resumeNextStep).toBeUndefined()
    saveResume(item.id, 'resumeNote', '不应改变完成任务')
    expect(tasks.value[0]?.resumeNote).toBe('完成封面')
  })
  it('prioritizes the daily focus then resumption and excludes completed/future work', () => {
    const old = task('未开始'), resumed = task('继续'), focus = task('重点'), future = task('以后'), done = task('完成')
    resumed.resumeUpdatedAt = 100; focus.focusDate = date; future.date = '2026-10-01'; done.done = true
    expect(focusCandidates(tasks.value, date).map(item => item.id)).toEqual([focus.id, resumed.id, old.id])
  })
  it('captures an idea as a memo and promotes it once with a source reference', () => {
    const source = task('当前任务')
    expect(captureSpark('   ')).toBeNull()
    const memo = captureSpark('一个新点子', source.id)!
    expect(memo.capturedFromTaskId).toBe(source.id)
    expect(memo.captureStatus).toBe('inbox')
    const next = promoteSpark(memo.id)!
    expect(next.date).toBe('')
    expect(next.links).toEqual([{ kind: 'memos', id: memo.id }])
    expect(promoteSpark(memo.id)).toBeNull()
    expect(memos.value[0]?.captureStatus).toBe('kept')
    expect(() => validateEntity('memos', memos.value[0])).not.toThrow()
  })
  it('unions protected time while keeping energy budget separate', () => {
    protectTime({ date, start: 540, end: 600, label: '休息' })
    protectTime({ date, start: 570, end: 630, label: '散步' })
    expect(protectedIntervals(planner.value.protectedTimes!, date)).toEqual([{ start: 540, end: 630 }])
    expect(dayCapacity(date)).toBe(180)
    expect(withoutProtected([{ start: 540, end: 1080 }], planner.value.protectedTimes!, date)).toEqual([{ start: 630, end: 1080 }])
    expect(normalizePlanner(JSON.parse(JSON.stringify(planner.value))).protectedTimes).toHaveLength(2)
    const id = planner.value.protectedTimes![0]!.id
    releaseTime(id)
    expect(dayCapacity(date)).toBe(180)
  })
  it('avoids protected times in both windows and pending-task suggestions', () => {
    protectTime({ date, start: 540, end: 600, label: '散步' })
    const item = task('待办'); item.date = ''
    expect(availableWindows([], date, 120, new Date(`${date}T09:00:00`), 30, planner.value.protectedTimes)[0]?.start).toBe(600)
    expect(suggestUnscheduledTask(tasks.value, date, 120, new Date(`${date}T09:00:00`), [], [], planner.value.protectedTimes)?.start).toBe(600)
  })
  it('rejects malformed protected time at creation and payload ingestion', () => {
    expect(() => protectTime({ date, start: 600, end: 590, label: 'invalid' })).toThrow()
    expect(() => protectTime({ date: '2026-02-31', start: 540, end: 600, label: 'invalid' })).toThrow()
    expect(() => validateEntity('planner', { protectedTimes: [{ id: 'a', date, start: 0, end: 1441, label: 'invalid' }] })).toThrow()
    expect(planner.value.protectedTimes).toBeUndefined()
  })
  it('keeps deferred goals out of suggestions and weekly drafts without moving existing tasks', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(`${date}T09:00:00`))
    try {
      const goal = addLongPlan({ title: '以后再说', description: '', area: '', horizon: 'quarter', targetDate: '', nextStep: '', status: 'active' })
      goal.deferredUntil = '2026-10-05'
      const item = task('想法'); item.longPlanId = goal.id; item.date = ''
      const week = addWeeklyPlan({ title: '行动', notes: '', weekStart: date, priority: 2, sessions: 1, preferredWeekdays: [], longPlanId: goal.id })
      expect(suggestUnscheduledTask(tasks.value, date, 180, new Date(), weeklyPlans.value, longPlans.value)).toBeNull()
      expect(createWeekScheduleDraft(week.id)?.entries).toEqual([])
      expect(item.date).toBe('')
    } finally { vi.useRealTimers() }
  })
})


describe('attention reliability', () => {
  it('retains encrypted-payload drafts and reuses the same memo after a failed commit', async () => {
    const item = task('来源')
    writePocketDraft('不能丢失的灵感', item.id)
    const id = pocketDraft(item.id)!.id
    expect(() => validateEntity('memos', memos.value[0])).not.toThrow()
    await expect(collectPocketDraft(item.id, async () => { throw new Error('quota') })).rejects.toThrow('quota')
    expect(pocketDraft(item.id)?.content).toBe('不能丢失的灵感')
    await collectPocketDraft(item.id, async () => {})
    expect(memos.value).toHaveLength(1)
    expect(memos.value[0]).toMatchObject({ id, captureStatus: 'inbox' })
    expect(pocketDraft(item.id)).toBeUndefined()
    expect(await collectPocketDraft(item.id, async () => {})).toBe(false)
  })
  it('does not announce capture until persistence returns', async () => {
    writePocketDraft('等待保存')
    let finish!: () => void
    let saved = false
    const capturing = collectPocketDraft(undefined, () => new Promise<void>(resolve => { finish = resolve })).then(() => { saved = true })
    await Promise.resolve()
    expect(saved).toBe(false)
    finish()
    await capturing
    expect(saved).toBe(true)
  })
  it('splits timed capacity across midnight and counts undated-time tasks on their date', () => {
    const item = task('夜间'); item.time = '23:30'; item.estimatedMinutes = 120
    expect(dayLoad(date)).toBe(30)
    expect(dayLoad('2026-09-29')).toBe(90)
    expect(taskMinutesOnDate({ ...item, time: '' }, date)).toBe(120)
    expect(taskMinutesOnDate({ ...item, done: true }, date)).toBe(0)
  })
  it('does not deduct sleeping hours but bounds capacity by the protected daytime windows', () => {
    protectTime({ date, start: 0, end: 480, label: '睡眠' })
    expect(dayCapacity(date)).toBe(180)
    protectTime({ date, start: 540, end: 1020, label: '休息' })
    expect(dayCapacity(date)).toBe(60)
  })
  it('validates real dates at import and sync boundaries too', () => {
    expect(validCalendarDate('2028-02-29')).toBe(true)
    expect(validCalendarDate('2026-02-29')).toBe(false)
    expect(() => validateEntity('planner', { protectedTimes: [{ id: 'bad', date: '2026-02-31', start: 0, end: 30, label: '' }] })).toThrow()
    expect(() => validateEntity('longPlans', { deferredUntil: 'later' })).toThrow()
  })
})
