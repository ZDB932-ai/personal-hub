import { nextTick, ref, watch } from 'vue'
import type { DataEnvelope, KdfParams, VaultPayload } from '@/types'
import { decryptJSON, encryptJSON, newKdfParams } from '@/lib/crypto'
import { emptyProfile, readJSON, writeJSON } from '@/lib/utils'
import { getActiveKey, setActiveKey } from '@/lib/keyring'
import { profile } from './profile'
import { entries, seedEntries } from './vault'
import { normalizeTask, tasks } from './tasks'
import { longPlans, normalizeLongPlan, normalizePlanner, normalizeWeeklyPlan, planner, resetPlanning, weeklyPlans } from './planning'
import { agentResourceTaxonomy, agentResourceTaxonomySnapshot, agentResources, normalizeAgentResource, resetAgentResourceTaxonomy, resetAgentResources, setAgentResourceTaxonomy, syncAgentResourceTaxonomyFromResources } from './agentResources'
import { memos } from './memos'
import { docMetas } from './docs'
import { repos } from './repos'
import { toast } from '@/lib/toast'
import { reconcileJournal, type OfflineJournal } from '@/lib/offlineJournal'
import { updateOfflineSummary } from './offline'
import { commitRepository } from '@/lib/vaultRepository'
import { preserveConcurrentEdits } from '@/lib/syncMerge'
import { validatePayload } from '@/lib/payloadSchema'
import { captureRecovery, restoreRecoveryCopy, validateRecovery } from '@/lib/recovery'
import { recoveryItems } from './recovery'

const DATA_KEY = 'xk.data.v2'

const hydrated = ref(false)
let hydrating = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
let saveQueue: Promise<unknown> = Promise.resolve()
let revision = 0
let dirty = false
let offlineJournal: OfflineJournal | undefined
let previousPayload: VaultPayload | undefined
let publishingRecovery = false
let extraPayload: Record<string, unknown> = {}
export const databaseBusy = ref(false)
export const storageError = ref('')
const savedListeners = new Set<(env: DataEnvelope) => void>()

export const dataEnvelope = ref<DataEnvelope | null>(readJSON<DataEnvelope>(DATA_KEY))

function localDeviceId(): string {
  const stored = readJSON<string>('xk.device.id.v1')
  if (typeof stored === 'string' && stored) return stored
  const id = crypto.randomUUID()
  writeJSON('xk.device.id.v1', id)
  return id
}

export function prepareOfflinePayload(payload: VaultPayload): VaultPayload {
  return { ...payload, offlineJournal: reconcileJournal(payload, payload.offlineJournal, localDeviceId()) }
}

export function adoptOfflinePayload(payload: VaultPayload, savedAt: number): void {
  offlineJournal = payload.offlineJournal
  updateOfflineSummary(offlineJournal, savedAt)
}

export function resetRecoveryBaseline(payload: VaultPayload): void {
  previousPayload = JSON.parse(JSON.stringify(payload))
}

export { getActiveKey, setActiveKey } from '@/lib/keyring'

function suppressNextSave(): void {
  hydrating = true
  void nextTick().then(() => {
    hydrating = false
  })
}

export { suppressNextSave }

export function hasPendingSave(): boolean { return dirty }

export function getDataRevision(): number {
  return revision
}

function clearSaveTimer(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
}

export async function initFresh(kdf?: KdfParams): Promise<void> {
  extraPayload = {}
  previousPayload = undefined
  recoveryItems.value = []
  offlineJournal = undefined
  suppressNextSave()
  Object.assign(profile, emptyProfile())
  entries.value = seedEntries()
  tasks.value = []
  resetPlanning()
  resetAgentResources()
  resetAgentResourceTaxonomy()
  memos.value = []
  docMetas.value = []
  hydrated.value = true
  await persistNow(kdf)
}

export async function initFromEnvelope(env: DataEnvelope, key: CryptoKey, canApply = () => true, onStored = () => {}): Promise<boolean> {
  let payload = await decryptJSON<VaultPayload>(key, env.ivB64, env.ctB64)
  validatePayload(payload)
  validateRecovery(payload.recoveryItems)
  if (payload.offlineJournal?.version !== 1 || payload.offlineJournal.deviceId !== localDeviceId()) {
    payload = prepareOfflinePayload({ ...payload, offlineJournal: undefined })
    env = { ...env, ...await encryptJSON(key, payload) }
  }
  if (!canApply()) return false
  if (JSON.stringify(readJSON<DataEnvelope>(DATA_KEY)) !== JSON.stringify(env)) {
    await commitRepository({ [DATA_KEY]: env }, canApply)
  }
  onStored()
  if (!canApply()) return false
  clearSaveTimer()
  hydratePayload(payload)
  dataEnvelope.value = env
  adoptOfflinePayload(payload, env.ts)
  dirty = false
  storageError.value = ''
  hydrated.value = true
  return true
}

function hydratePayload(payload: VaultPayload): void {
  suppressNextSave()
  recoveryItems.value = payload.recoveryItems ?? []
  previousPayload = JSON.parse(JSON.stringify(payload))
  const known = new Set(['schemaVersion', 'recoveryItems', 'offlineJournal', 'profile', 'entries', 'tasks', 'weeklyPlans', 'longPlans', 'planner', 'agentResources', 'agentResourceTaxonomy', 'memos', 'docMetas', 'repos'])
  extraPayload = Object.fromEntries(Object.entries(payload).filter(([key]) => !known.has(key)))
  Object.assign(profile, emptyProfile(), payload.profile ?? {})
  entries.value = Array.isArray(payload.entries) ? payload.entries : []
  tasks.value = Array.isArray(payload.tasks) ? payload.tasks.map(normalizeTask) : []
  weeklyPlans.value = Array.isArray(payload.weeklyPlans) ? payload.weeklyPlans.map(normalizeWeeklyPlan) : []
  longPlans.value = Array.isArray(payload.longPlans) ? payload.longPlans.map(normalizeLongPlan) : []
  planner.value = normalizePlanner(payload.planner)
  agentResources.value = Array.isArray(payload.agentResources) ? payload.agentResources.map(normalizeAgentResource) : []
  setAgentResourceTaxonomy(payload.agentResourceTaxonomy)
  syncAgentResourceTaxonomyFromResources()
  memos.value = Array.isArray(payload.memos) ? payload.memos : []
  docMetas.value = Array.isArray(payload.docMetas) ? payload.docMetas : []
  repos.value = Array.isArray(payload.repos) ? payload.repos : []
}

export function snapshotPayload(): VaultPayload {
  return JSON.parse(JSON.stringify({
    ...extraPayload,
    schemaVersion: 1,
    recoveryItems: recoveryItems.value,
    offlineJournal,
    profile: { ...profile },
    entries: entries.value.map((e) => ({ ...e })),
    tasks: tasks.value.map((t) => ({ ...t })),
    weeklyPlans: weeklyPlans.value.map((plan) => ({ ...plan, preferredWeekdays: [...plan.preferredWeekdays], taskIds: [...plan.taskIds] })),
    longPlans: longPlans.value.map((plan) => ({ ...plan })),
    planner: { ...planner.value, restDates: [...planner.value.restDates], dayEnergies: planner.value.dayEnergies.map((item) => ({ ...item })) },
    agentResources: agentResources.value.map((resource) => ({
      ...resource,
      categories: [...resource.categories],
      agents: [...resource.agents],
      tags: [...resource.tags],
      githubTopics: [...resource.githubTopics],
      mcpCapabilities: [...resource.mcpCapabilities],
    })),
    agentResourceTaxonomy: agentResourceTaxonomySnapshot(),
    memos: memos.value.map((m) => ({ ...m })),
    docMetas: docMetas.value.map((d) => ({ ...d })),
    repos: repos.value.map((r) => ({ ...r })),
  })) as VaultPayload
}

export function publishEnvelope(env: DataEnvelope, notify = !hydrating): void {
  dataEnvelope.value = env
  if (notify) {
    for (const fn of savedListeners) fn(env)
  }
}

export async function persistNow(kdf?: KdfParams): Promise<DataEnvelope> {
  const key = getActiveKey()
  if (!key) throw new Error('数据已锁定')
  if (databaseBusy.value) throw new Error('正在修改主密码，请稍后重试')
  clearSaveTimer()
  const params = kdf ?? dataEnvelope.value?.kdf ?? newKdfParams()
  const saving = saveQueue.then(async () => {
    const payload = snapshotPayload()
    const savedRevision = revision
    const prepared = prepareOfflinePayload(captureRecovery(previousPayload, { ...payload, offlineJournal }))
    const { ivB64, ctB64 } = await encryptJSON(key, prepared)
    if (getActiveKey() !== key) throw new Error('数据已锁定或密钥已变更')
    const header = dataEnvelope.value?.v === 3 ? dataEnvelope.value : { v: 2 as const, kdf: params }
    const env: DataEnvelope = { ...header, ts: Math.max(Date.now(), (dataEnvelope.value?.ts ?? 0) + 1), ivB64, ctB64 }
    await commitRepository({ [DATA_KEY]: env }, () => getActiveKey() === key)
    previousPayload = JSON.parse(JSON.stringify(prepared))
    publishingRecovery = true
    recoveryItems.value = prepared.recoveryItems ?? []
    publishingRecovery = false
    storageError.value = ''
    adoptOfflinePayload(prepared, env.ts)
    if (revision === savedRevision) dirty = false
    publishEnvelope(env)
    return env
  })
  saveQueue = saving.catch(error => { storageError.value = error instanceof Error ? error.message : '本机数据保存失败' })
  return saving
}

export async function updateSyncPayload(transform: (payload: VaultPayload) => void): Promise<void> {
  const key = getActiveKey()
  if (!key || dataEnvelope.value?.v !== 3) throw new Error('请先解锁设备独立密码保险库')
  const saving = saveQueue.then(async () => {
    if (databaseBusy.value || getActiveKey() !== key) throw new Error('保险库状态已变化，请重试')
    const env = dataEnvelope.value!
    const before = prepareOfflinePayload(snapshotPayload())
    let merged = structuredClone(before)
    const savedRevision = revision
    transform(merged)
    merged = captureRecovery(before, merged)
    const encrypted = await encryptJSON(key, merged)
    const canApply = () => getActiveKey() === key && !databaseBusy.value && dataEnvelope.value === env && revision === savedRevision
    if (!canApply()) throw new Error('同步落盘期间本机数据发生变化，请重试')
    const nextEnvelope = { ...env, ...encrypted }
    await commitRepository({ [DATA_KEY]: nextEnvelope }, canApply)
    const persisted = JSON.parse(JSON.stringify(merged)) as VaultPayload
    if (getActiveKey() !== key) return
    const changed = revision !== savedRevision
    if (changed) preserveConcurrentEdits(before, snapshotPayload(), merged)
    hydratePayload(merged)
    previousPayload = persisted
    dataEnvelope.value = nextEnvelope
    adoptOfflinePayload(changed ? prepareOfflinePayload(merged) : merged, env.ts)
    dirty = changed
    storageError.value = ''
    if (changed) scheduleSave()
  })
  saveQueue = saving.catch(error => { storageError.value = error instanceof Error ? error.message : '同步状态保存失败' })
  return saving
}

export async function flushPendingSave(): Promise<DataEnvelope> {
  await nextTick()
  await saveQueue
  while (dirty) await persistNow()
  if (!dataEnvelope.value) throw new Error('本地数据尚未初始化')
  return dataEnvelope.value
}

export async function beginDatabaseUpdate(): Promise<void> {
  if (databaseBusy.value) throw new Error('正在修改主密码，请稍后重试')
  databaseBusy.value = true
  clearSaveTimer()
  await saveQueue
}

export function endDatabaseUpdate(): void {
  databaseBusy.value = false
  if (dirty && getActiveKey()) scheduleSave()
}

function scheduleSave(): void {
  clearSaveTimer()
  saveTimer = setTimeout(() => {
    saveTimer = null
    void persistNow().catch(error => toast(error instanceof Error ? error.message : '保存失败，请检查本机存储空间后重试', 'error'))
  }, 400)
}

export function onDataSaved(fn: (env: DataEnvelope) => void): () => void {
  savedListeners.add(fn)
  return () => savedListeners.delete(fn)
}

export function wipeMemory(): void {
  extraPayload = {}
  previousPayload = undefined
  recoveryItems.value = []
  storageError.value = ''
  offlineJournal = undefined
  updateOfflineSummary()
  clearSaveTimer()
  dirty = false
  hydrated.value = false
  Object.assign(profile, emptyProfile())
  entries.value = []
  tasks.value = []
  resetPlanning()
  resetAgentResources()
  resetAgentResourceTaxonomy()
  memos.value = []
  docMetas.value = []
  repos.value = []
  setActiveKey(null)
}

export async function restoreRecovery(id: string): Promise<string> {
  await flushPendingSave()
  const payload = snapshotPayload()
  const item = payload.recoveryItems?.find(value => value.id === id)
  if (!item) throw new Error('恢复记录不存在或已过期')
  const restored = restoreRecoveryCopy(payload, item)
  const baseline = previousPayload
  hydratePayload(payload)
  previousPayload = baseline
  revision++
  dirty = true
  await persistNow()
  return restored
}

export async function clearRecovery(): Promise<void> {
  await flushPendingSave()
  recoveryItems.value = []
  await persistNow()
}

watch(
  [profile, entries, tasks, weeklyPlans, longPlans, planner, agentResources, agentResourceTaxonomy, memos, docMetas, repos, recoveryItems],
  () => {
    if (publishingRecovery) return
    revision++
    if (!hydrated.value || hydrating || !getActiveKey()) return
    dirty = true
    if (!databaseBusy.value) scheduleSave()
  },
  { deep: true, flush: 'sync' },
)
