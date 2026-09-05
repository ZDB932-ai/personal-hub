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

const DATA_KEY = 'xk.data.v2'

const hydrated = ref(false)
let hydrating = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
const savedListeners = new Set<(env: DataEnvelope) => void>()

export const dataEnvelope = ref<DataEnvelope | null>(readJSON<DataEnvelope>(DATA_KEY))

export { getActiveKey, setActiveKey } from '@/lib/keyring'

function suppressNextSave(): void {
  hydrating = true
  void nextTick().then(() => {
    hydrating = false
  })
}

export { suppressNextSave }

export async function initFresh(kdf?: KdfParams): Promise<void> {
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

export async function initFromEnvelope(env: DataEnvelope, key: CryptoKey): Promise<void> {
  const payload = await decryptJSON<VaultPayload>(key, env.ivB64, env.ctB64)
  suppressNextSave()
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
  dataEnvelope.value = env
  writeJSON(DATA_KEY, env)
  hydrated.value = true
}

export async function persistNow(kdf?: KdfParams): Promise<DataEnvelope> {
  if (!getActiveKey()) throw new Error('vault-locked')
  const params = kdf ?? dataEnvelope.value?.kdf ?? newKdfParams()
  const payload: VaultPayload = {
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
  }
  const { ivB64, ctB64 } = await encryptJSON(getActiveKey()!, payload)
  const env: DataEnvelope = { v: 2, kdf: params, ts: Date.now(), ivB64, ctB64 }
  dataEnvelope.value = env
  writeJSON(DATA_KEY, env)
  if (!hydrating) {
    for (const fn of savedListeners) fn(env)
  }
  return env
}

export function onDataSaved(fn: (env: DataEnvelope) => void): () => void {
  savedListeners.add(fn)
  return () => savedListeners.delete(fn)
}

export function wipeMemory(): void {
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

watch(
  [profile, entries, tasks, weeklyPlans, longPlans, planner, agentResources, agentResourceTaxonomy, memos, docMetas, repos],
  () => {
    if (!hydrated.value || hydrating || !getActiveKey()) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void persistNow().catch(() => {})
    }, 400)
  },
  { deep: true },
)
