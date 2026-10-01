import { beforeEach, expect, it, vi } from 'vitest'
vi.hoisted(() => Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }))
import { gapChoices, projectStory } from '../attentionJourney'
import { addTask, tasks, toggleTaskDone } from '@/stores/tasks'
import { addMemo, memos } from '@/stores/memos'
import { closeDay, promoteSpark } from '@/stores/attention'
import { addLongPlan, longPlans, weeklyPlans, planner } from '@/stores/planning'
import { validateEntity } from '../payloadSchema'
const date = '2026-09-28'
const make = (title: string, minutes = 15) => addTask({ title, date: '', time: '', notes: '', estimatedMinutes: minutes, priority: 2, repeat: 'none' })
beforeEach(() => { tasks.value = []; memos.value = []; longPlans.value = []; weeklyPlans.value = []; planner.value = { energy: 'steady', restDates: [], dayEnergies: [] } })
it('offers at most three fitting actions and avoids protected time and deferred directions', () => {
  const goal = addLongPlan({ title: '之后', description: '', area: '', horizon: 'quarter', status: 'active', nextStep: '', targetDate: '', deferredUntil: '2026-10-05' })
  make('延后').longPlanId = goal.id
  make('太长', 60)
  for (let i = 0; i < 5; i++) make(`小事 ${i}`)
  const choices = gapChoices(tasks.value, date, 30, new Date(`${date}T09:00:00`), 30, true, [], longPlans.value, [{ id: 'rest', date, start: 540, end: 570, label: '休息' }])
  expect(choices).toHaveLength(3)
  expect(choices.every(choice => choice.start === 570 && choice.task.title.startsWith('小事'))).toBe(true)
  expect(gapChoices(tasks.value, date, 0, new Date(`${date}T09:00:00`), 15, false, [], [], [])).toEqual([])
})
it('incubates a kept idea and reuses its action without duplication', () => {
  const memo = addMemo({ title: '试试', content: '灵感', color: 'amber', pinned: false, captureStatus: 'kept', ideaStage: 'try' })
  const task = promoteSpark(memo.id)!
  expect(task.estimatedMinutes).toBe(15)
  expect(memos.value[0]?.ideaStage).toBe('growing')
  promoteSpark(memo.id)
  expect(tasks.value).toHaveLength(1)
  expect(() => validateEntity('memos', memos.value[0])).not.toThrow()
})
it('story uses actual timestamps, deduplicates linked ideas, and omits private drafts', () => {
  const goal = addLongPlan({ title: '摄影', description: '', area: '', horizon: 'quarter', status: 'active', nextStep: '', targetDate: '' })
  const task = make('作品'); task.longPlanId = goal.id; task.done = true; task.doneAt = Date.now()
  const memo = addMemo({ title: '想法', content: '', color: 'amber', pinned: false, capturedFromTaskId: task.id })
  task.links = [{ kind: 'memos', id: memo.id }]
  addMemo({ title: '草稿', content: '', color: 'amber', pinned: false, capturedFromTaskId: task.id, captureStatus: 'draft' })
  const story = projectStory(goal, tasks.value, [], memos.value)
  expect(story).toHaveLength(4)
  expect(story.filter(node => node.memo)).toHaveLength(1)
})
it('closing only moves explicitly selected unfinished tasks and reuses its daily memo', () => {
  const move = make('移到明天'), stay = make('留在今天'), future = make('以后')
  move.date = stay.date = date; move.time = '23:30'; future.date = '2026-10-01'
  closeDay(date, '先做封面', [move.id, future.id])
  expect(tasks.value.find(task => task.id === move.id)).toMatchObject({ date: '2026-09-29', time: '' })
  expect(stay.date).toBe(date); expect(future.date).toBe('2026-10-01')
  closeDay(date, '先看标题', [move.id])
  expect(memos.value).toHaveLength(1)
  expect(memos.value[0]?.openingNote).toBe('先看标题')
  expect(() => validateEntity('memos', memos.value[0])).not.toThrow()
})
it('repeated actions start without a stale scene bookmark', () => {
  const task = make('每日'); task.date = date; task.repeat = 'daily'; task.sceneSavedAt = 123; task.sceneExpanded = true
  toggleTaskDone(task.id)
  expect(tasks.value[1]?.sceneSavedAt).toBeUndefined()
  expect(tasks.value[1]?.sceneExpanded).toBeUndefined()
})
