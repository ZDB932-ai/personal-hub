import { validCalendarDate } from './attention'
import type { VaultPayload } from '@/types'

export const collectionKinds = ['entries', 'tasks', 'weeklyPlans', 'longPlans', 'agentResources', 'memos', 'docMetas', 'repos'] as const
export type CollectionKind = typeof collectionKinds[number]
const strings = ['id', 'title', 'name', 'nickname', 'bio', 'email', 'phone', 'birthday', 'location', 'github', 'blog', 'username', 'password', 'url', 'notes', 'category', 'date', 'time', 'content', 'color', 'mime', 'note', 'fullName', 'description', 'language', 'weekStart', 'longPlanId', 'weeklyPlanId', 'focusDate', 'repeatSourceId', 'targetDate', 'nextStep', 'area']
const numbers = ['createdAt', 'updatedAt', 'doneAt', 'lastUsedAt', 'lastRemindedTs', 'size', 'stars']
const arrays = ['tags', 'topics', 'categories', 'agents', 'githubTopics', 'mcpCapabilities', 'taskIds', 'restDates', 'customKinds', 'customCategories', 'customAgents']
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function validateEntity(kind: string, value: unknown): void {
  const fail = () => { throw new Error(`「${kind}」数据格式不兼容，已保留原数据`) }
  if (!object(value)) return fail()
  for (const name of ['resumeNote', 'resumeNextStep', 'deferredUntil', 'capturedFromTaskId', 'openingNote']) if (value[name] !== undefined && typeof value[name] !== 'string') fail()
  if (value.deferredUntil !== undefined && value.deferredUntil !== '' && !validCalendarDate(value.deferredUntil)) fail()
  if (value.resumeUpdatedAt !== undefined && (typeof value.resumeUpdatedAt !== 'number' || !Number.isFinite(value.resumeUpdatedAt) || value.resumeUpdatedAt < 0)) fail()
  if (value.closingDate !== undefined && !validCalendarDate(value.closingDate)) fail()
  if (value.ideaStage !== undefined && !['resting', 'try', 'growing', 'archived'].includes(String(value.ideaStage))) fail()
  if (value.sceneExpanded !== undefined && typeof value.sceneExpanded !== 'boolean') fail()
  if (value.sceneSavedAt !== undefined && (typeof value.sceneSavedAt !== 'number' || !Number.isFinite(value.sceneSavedAt) || value.sceneSavedAt < 0)) fail()
  if (value.captureStatus !== undefined && !['draft', 'inbox', 'kept'].includes(String(value.captureStatus))) fail()
  if (value.protectedTimes !== undefined) {
    if (!Array.isArray(value.protectedTimes)) return fail()
    const ids = new Set<string>()
    for (const item of value.protectedTimes) {
      if (!object(item) || typeof item.id !== 'string' || !item.id || ids.has(item.id) || !validCalendarDate(item.date) || typeof item.label !== 'string' || !Number.isInteger(item.start) || !Number.isInteger(item.end) || Number(item.start) < 0 || Number(item.end) > 1440 || Number(item.start) >= Number(item.end)) return fail()
      ids.add(item.id)
    }
  }
  for (const name of strings) if (value[name] !== undefined && typeof value[name] !== 'string') fail()
  for (const name of numbers) if (value[name] !== undefined && (typeof value[name] !== 'number' || !Number.isFinite(value[name]) || value[name] < 0)) fail()
  for (const name of ['done', 'pinned', 'scheduleLocked']) if (value[name] !== undefined && typeof value[name] !== 'boolean') fail()
  for (const name of arrays) if (value[name] !== undefined && (!Array.isArray(value[name]) || !value[name].every(item => typeof item === 'string'))) fail()
  if (value.priority !== undefined && ![1, 2, 3].includes(value.priority as number)) fail()
  if (value.repeat !== undefined && !['none', 'daily', 'weekly', 'workdays'].includes(value.repeat as string)) fail()
  if (value.estimatedMinutes !== undefined && (!Number.isInteger(value.estimatedMinutes) || Number(value.estimatedMinutes) < 1 || Number(value.estimatedMinutes) > 1440)) fail()
  if (value.sessions !== undefined && (!Number.isSafeInteger(value.sessions) || Number(value.sessions) < 1)) fail()
  if (value.preferredWeekdays !== undefined && (!Array.isArray(value.preferredWeekdays) || !value.preferredWeekdays.every(day => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6))) fail()
  if (value.subtasks !== undefined) {
    if (!Array.isArray(value.subtasks)) return fail()
    for (const item of value.subtasks) {
      if (!object(item) || typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.done !== 'boolean') fail()
    }
  }
  if (value.links !== undefined) {
    if (!Array.isArray(value.links)) return fail()
    for (const item of value.links) {
      if (!object(item) || !['memos', 'docMetas', 'repos'].includes(String(item.kind)) || typeof item.id !== 'string' || !item.id) fail()
    }
  }
  if (value.dayEnergies !== undefined) {
    if (!Array.isArray(value.dayEnergies)) return fail()
    for (const day of value.dayEnergies) if (!object(day) || typeof day.date !== 'string' || !['gentle', 'steady', 'focused'].includes(String(day.energy))) fail()
  }
  if (value.dayCapacities !== undefined) {
    if (!Array.isArray(value.dayCapacities)) return fail()
    for (const day of value.dayCapacities) if (!object(day) || typeof day.date !== 'string' || !Number.isInteger(day.minutes) || Number(day.minutes) < 0 || Number(day.minutes) > 1440) fail()
  }
}

export function validatePayload(value: unknown): asserts value is VaultPayload {
  if (!object(value) || !object(value.profile) || (value.entries !== undefined && !Array.isArray(value.entries)) || (value.schemaVersion === 1 && !Array.isArray(value.entries))) throw new Error('保险库内容格式无效，已保留原数据')
  if (value.schemaVersion !== undefined && value.schemaVersion !== 1) throw new Error('此数据由更新版本创建，请升级应用后打开')
  validateEntity('profile', value.profile)
  for (const kind of collectionKinds) {
    if (value[kind] === undefined) continue
    if (!Array.isArray(value[kind])) throw new Error(`「${kind}」应为列表`)
    const seen = new Set<string>()
    for (const item of value[kind]) {
      validateEntity(kind, item)
      if (!object(item) || typeof item.id !== 'string' || !item.id || seen.has(item.id)) throw new Error(`「${kind}」包含无效或重复标识`)
      seen.add(item.id)
    }
  }
  for (const kind of ['planner', 'agentResourceTaxonomy']) if (value[kind] !== undefined) validateEntity(kind, value[kind])
}
