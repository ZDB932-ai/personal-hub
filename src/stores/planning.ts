import { ref } from 'vue'
import type {
  LongPlan,
  LongPlanHorizon,
  LongPlanStatus,
  PlannerEnergy,
  PlannerState,
  Task,
  TaskPriority,
  WeeklyPlan,
} from '@/types'
import { todayYMD, uid, weekDates, weekStartYMD } from '@/lib/utils'
import { addTask, tasks } from './tasks'
import { estimatedMinutes, scheduleWithinCapacity } from '@/lib/planningCapacity'
import { protectedIntervals, taskMinutesOnDate } from '@/lib/attention'

export interface WeeklyPlanInput {
  estimatedMinutes?: number
  title: string
  notes: string
  weekStart: string
  priority: TaskPriority
  sessions: number
  preferredWeekdays: number[]
  longPlanId?: string
}

export interface LongPlanInput {
  deferredUntil?: string
  title: string
  description: string
  area: string
  horizon: LongPlanHorizon
  targetDate: string
  nextStep: string
  status: LongPlanStatus
}

export interface WeekScheduleEntry {
  date: string
  title: string
  position: number
}

export interface WeekScheduleDraft {
  planId: string
  entries: WeekScheduleEntry[]
  unscheduled: number
  skippedRestDays: number
}

export interface WeeklyPlanRemoval {
  plan: WeeklyPlan
  tasks: Task[]
}

export const weeklyPlans = ref<WeeklyPlan[]>([])
export const longPlans = ref<LongPlan[]>([])
export const planner = ref<PlannerState>({ energy: 'steady', restDates: [], dayEnergies: [] })

const VALID_ENERGY: PlannerEnergy[] = ['gentle', 'steady', 'focused']
const VALID_STATUS: LongPlanStatus[] = ['active', 'paused', 'completed', 'wish']
const VALID_HORIZON: LongPlanHorizon[] = ['month', 'quarter', 'year', 'custom']

export function normalizeWeeklyPlan(plan: WeeklyPlan): WeeklyPlan {
  const sessionValue = Number(plan.sessions)
  const sessions = Number.isFinite(sessionValue) && sessionValue >= 1 ? Math.floor(sessionValue) : 1
  const preferredWeekdays = Array.isArray(plan.preferredWeekdays)
    ? [...new Set(plan.preferredWeekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
    : []
  return {
    ...plan,
    weekStart: weekStartYMD(plan.weekStart || todayYMD()),
    title: String(plan.title ?? ''),
    notes: String(plan.notes ?? ''),
    priority: [1, 2, 3].includes(plan.priority) ? plan.priority : 2,
    sessions,
    preferredWeekdays,
    longPlanId: typeof plan.longPlanId === 'string' ? plan.longPlanId : undefined,
    taskIds: Array.isArray(plan.taskIds) ? plan.taskIds.filter((id): id is string => typeof id === 'string') : [],
  }
}

export function normalizeLongPlan(plan: LongPlan): LongPlan {
  return {
    ...plan,
    title: String(plan.title ?? ''),
    description: String(plan.description ?? ''),
    area: String(plan.area ?? ''),
    horizon: VALID_HORIZON.includes(plan.horizon) ? plan.horizon : 'custom',
    targetDate: typeof plan.targetDate === 'string' ? plan.targetDate : '',
    nextStep: String(plan.nextStep ?? ''),
    status: VALID_STATUS.includes(plan.status) ? plan.status : 'active',
  }
}

export function normalizePlanner(value?: PlannerState): PlannerState {
  const dayEnergyMap = new Map<string, PlannerEnergy>()
  if (Array.isArray(value?.dayEnergies)) {
    for (const item of value.dayEnergies) {
      if (typeof item?.date === 'string' && VALID_ENERGY.includes(item.energy)) {
        dayEnergyMap.set(item.date, item.energy)
      }
    }
  }
  return {
    ...value,
    dayCapacities: Array.isArray(value?.dayCapacities) ? value.dayCapacities.filter(day => typeof day.date === 'string' && Number.isInteger(day.minutes) && day.minutes >= 0 && day.minutes <= 1440) : [],
    energy: value && VALID_ENERGY.includes(value.energy) ? value.energy : 'steady',
    restDates: Array.isArray(value?.restDates)
      ? [...new Set(value.restDates.filter((date): date is string => typeof date === 'string'))].slice(-90)
      : [],
    dayEnergies: [...dayEnergyMap.entries()]
      .slice(-180)
      .map(([date, energy]) => ({ date, energy })),
  }
}

export function resetPlanning(): void {
  weeklyPlans.value = []
  longPlans.value = []
  planner.value = { energy: 'steady', restDates: [], dayEnergies: [] }
}

export function addWeeklyPlan(input: WeeklyPlanInput): WeeklyPlan {
  const now = Date.now()
  const plan = normalizeWeeklyPlan({
    id: uid(),
    ...input,
    weekStart: weekStartYMD(input.weekStart),
    taskIds: [],
    createdAt: now,
    updatedAt: now,
  })
  weeklyPlans.value.push(plan)
  return plan
}

export function updateWeeklyPlan(id: string, patch: Partial<WeeklyPlanInput>): void {
  const plan = weeklyPlans.value.find((item) => item.id === id)
  if (!plan) return
  Object.assign(plan, patch, { updatedAt: Date.now() })
  Object.assign(plan, normalizeWeeklyPlan(plan))
  plan.sessions = Math.max(plan.sessions, linkedTasks(id).length)
}

export function removeWeeklyPlan(id: string): WeeklyPlanRemoval | null {
  const index = weeklyPlans.value.findIndex((item) => item.id === id)
  if (index < 0) return null
  const plan = weeklyPlans.value[index]
  const linked = tasks.value.filter((task) => task.weeklyPlanId === id).map((task) => ({ ...task, tags: [...task.tags], subtasks: task.subtasks.map((subtask) => ({ ...subtask })) }))
  weeklyPlans.value.splice(index, 1)
  tasks.value = tasks.value.filter((task) => task.weeklyPlanId !== id)
  return { plan: { ...plan, preferredWeekdays: [...plan.preferredWeekdays], taskIds: [...plan.taskIds] }, tasks: linked }
}

export function restoreWeeklyPlan(removal: WeeklyPlanRemoval): void {
  if (!weeklyPlans.value.some((plan) => plan.id === removal.plan.id)) {
    weeklyPlans.value.push(normalizeWeeklyPlan({ ...removal.plan, preferredWeekdays: [...removal.plan.preferredWeekdays], taskIds: [...removal.plan.taskIds] }))
  }
  const existing = new Set(tasks.value.map((task) => task.id))
  tasks.value.push(...removal.tasks
    .filter((task) => !existing.has(task.id))
    .map((task) => ({ ...task, tags: [...task.tags], subtasks: task.subtasks.map((subtask) => ({ ...subtask })) })))
}

export function addLongPlan(input: LongPlanInput): LongPlan {
  const now = Date.now()
  const plan = normalizeLongPlan({ id: uid(), ...input, createdAt: now, updatedAt: now })
  longPlans.value.push(plan)
  return plan
}

export function updateLongPlan(id: string, patch: Partial<LongPlanInput>): void {
  const plan = longPlans.value.find((item) => item.id === id)
  if (!plan) return
  Object.assign(plan, patch, { updatedAt: Date.now() })
  Object.assign(plan, normalizeLongPlan(plan))
}

export function removeLongPlan(id: string): void {
  const index = longPlans.value.findIndex((item) => item.id === id)
  if (index < 0) return
  longPlans.value.splice(index, 1)
  for (const weeklyPlan of weeklyPlans.value) {
    if (weeklyPlan.longPlanId === id) {
      weeklyPlan.longPlanId = undefined
      weeklyPlan.updatedAt = Date.now()
    }
  }
  for (const task of tasks.value) {
    if (task.longPlanId === id) {
      task.longPlanId = undefined
      task.updatedAt = Date.now()
    }
  }
}

export function setLongPlanStatus(id: string, status: LongPlanStatus): void {
  const plan = longPlans.value.find((item) => item.id === id)
  if (!plan || !VALID_STATUS.includes(status)) return
  plan.status = status
  plan.updatedAt = Date.now()
}

export function setPlannerEnergy(energy: PlannerEnergy): void {
  if (!VALID_ENERGY.includes(energy)) return
  planner.value.energy = energy
}

export function plannerEnergyForDate(date: string): PlannerEnergy {
  return planner.value.dayEnergies.find((item) => item.date === date)?.energy ?? planner.value.energy
}

export function setPlannerDayEnergy(date: string, energy: PlannerEnergy): void {
  if (!date || !VALID_ENERGY.includes(energy)) return
  const existing = planner.value.dayEnergies.find((item) => item.date === date)
  if (existing) existing.energy = energy
  else planner.value.dayEnergies.push({ date, energy })
  planner.value.dayEnergies = [...planner.value.dayEnergies]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-180)
}

export function toggleRestDate(date: string): void {
  const current = new Set(planner.value.restDates)
  if (current.has(date)) current.delete(date)
  else current.add(date)
  planner.value.restDates = [...current].sort().slice(-90)
}

function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00`).getDay() + 6) % 7
}

function energyPreference(date: string): number {
  return { focused: 0, steady: 1, gentle: 2 }[plannerEnergyForDate(date)]
}

function linkedTasks(planId: string) {
  return tasks.value.filter((task) => task.weeklyPlanId === planId)
}

export function dayCapacity(date: string): number {
  if (planner.value.restDates.includes(date)) return 0
  const base = planner.value.dayCapacities?.find(day => day.date === date)?.minutes ?? { gentle: 60, steady: 180, focused: 300 }[plannerEnergyForDate(date)]
  const reserved = protectedIntervals(planner.value.protectedTimes ?? [], date).reduce((sum, item) => sum + Math.max(0, Math.min(1080, item.end) - Math.max(540, item.start)), 0)
  return Math.min(base, Math.max(0, 540 - reserved))
}

export function dayLoad(date: string): number {
  return tasks.value.reduce((sum, task) => sum + taskMinutesOnDate(task, date), 0)
}

export function setDayCapacity(date: string, minutes?: number): void {
  if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440)) throw new Error('可用时间应为 0–1440 分钟')
  planner.value.dayCapacities = [...(planner.value.dayCapacities ?? []).filter(day => day.date !== date), ...(minutes === undefined ? [] : [{ date, minutes }])]
}

export function createWeekScheduleDraft(planId: string): WeekScheduleDraft | null {
  const plan = weeklyPlans.value.find((item) => item.id === planId)
  if (!plan) return null
  const existing = linkedTasks(plan.id)
  const missing = Math.max(0, plan.sessions - existing.length)
  const allDates = weekDates(plan.weekStart)
  const goal = longPlans.value.find(item => item.id === plan.longPlanId)
  const availableDates = allDates.filter((date) => date >= todayYMD() && !planner.value.restDates.includes(date) && (!goal || (goal.status === 'active' && (!goal.deferredUntil || goal.deferredUntil <= date))))
  const dates = scheduleWithinCapacity(availableDates.map(date => ({ date, capacity: dayCapacity(date), load: dayLoad(date), preferred: plan.preferredWeekdays.includes(weekdayIndex(date)), energy: energyPreference(date) })), missing, estimatedMinutes(plan.estimatedMinutes))
  const entries: WeekScheduleEntry[] = dates.map((date, position) => ({
      date,
      title: plan.sessions > 1 ? `${plan.title} · 第 ${existing.length + position + 1}/${plan.sessions} 次` : plan.title,
      position: existing.length + position + 1,
    }))

  return {
    planId,
    entries,
    unscheduled: missing - entries.length,
    skippedRestDays: allDates.filter(date => planner.value.restDates.includes(date)).length,
  }
}

export function applyWeekScheduleDraft(draft: WeekScheduleDraft): string[] {
  const plan = weeklyPlans.value.find((item) => item.id === draft.planId)
  if (!plan || draft.entries.length === 0) return []
  const fresh = createWeekScheduleDraft(plan.id)
  if (!fresh || JSON.stringify(fresh.entries) !== JSON.stringify(draft.entries)) throw new Error('本周任务或可用时间已变化，请重新预览安排')
  const created = draft.entries.map((entry) =>
    addTask({
      title: entry.title,
      notes: plan.notes,
      date: entry.date,
      time: '',
      priority: plan.priority,
      estimatedMinutes: estimatedMinutes(plan.estimatedMinutes),
      repeat: 'none',
      tags: [],
      weeklyPlanId: plan.id,
      longPlanId: plan.longPlanId,
      scheduledBy: 'weekly-auto',
      scheduleLocked: false,
    }),
  )
  plan.taskIds = [...linkedTasks(plan.id).map((task) => task.id)]
  plan.updatedAt = Date.now()
  return created.map((task) => task.id)
}

export function undoWeekSchedule(planId: string, taskIds: string[]): void {
  const ids = new Set(taskIds)
  tasks.value = tasks.value.filter((task) => !(task.weeklyPlanId === planId && task.scheduledBy === 'weekly-auto' && ids.has(task.id)))
  const plan = weeklyPlans.value.find((item) => item.id === planId)
  if (plan) {
    plan.taskIds = linkedTasks(planId).map((task) => task.id)
    plan.updatedAt = Date.now()
  }
}
