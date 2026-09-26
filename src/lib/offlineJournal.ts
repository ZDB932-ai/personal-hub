import type { VaultPayload } from '@/types'
import { canonicalJSON, entityKey, type EntityKind, type PushResult, type SyncOperation, type SyncRecord } from './syncProtocol'

export interface OfflineJournal {
  version: 1
  deviceId: string
  records: Record<string, { fingerprint: string; revision: number }>
  pending: SyncOperation[]
  conflicts: Array<{ operation: SyncOperation; remote: SyncRecord }>
  sync?: {
    scope: string
    cursor: number
    inFlight?: {
      operation: SyncOperation
      wire: import('./recordSyncWire').ScopedOperation
    }
    failures: number
    retryAt: number
    lastError: string
  }
}

const collections = ['entries', 'tasks', 'weeklyPlans', 'longPlans', 'agentResources', 'memos', 'docMetas', 'repos'] as const
const singletons = ['profile', 'planner', 'agentResourceTaxonomy'] as const

export function emptyJournal(deviceId: string): OfflineJournal {
  return { version: 1, deviceId, records: {}, pending: [], conflicts: [] }
}

export function projectEntities(payload: VaultPayload): Array<{ kind: EntityKind; id: string; value: unknown }> {
  const result: Array<{ kind: EntityKind; id: string; value: unknown }> = []
  for (const kind of singletons) {
    if (payload[kind] !== undefined) result.push({ kind, id: 'singleton', value: payload[kind] })
  }
  for (const kind of collections) {
    for (const item of payload[kind] ?? []) {
      const value = { ...item } as Record<string, unknown>
      if (kind === 'tasks') delete value.lastRemindedTs
      if (kind === 'docMetas') delete value.blobId
      result.push({ kind, id: item.id, value })
    }
  }
  return result
}

export function reconcileJournal(payload: VaultPayload, previous: OfflineJournal | undefined, deviceId: string): OfflineJournal {
  const journal = previous?.version === 1 && previous.deviceId === deviceId
    ? structuredClone(previous)
    : emptyJournal(deviceId)
  const current = new Set<string>()
  for (const item of projectEntities(payload)) {
    const entity = entityKey(item.kind, item.id)
    if (current.has(entity)) throw new Error('存在重复记录标识，无法准备同步')
    current.add(entity)
    const fingerprint = canonicalJSON(item.value)
    const before = journal.records[entity]
    if (before?.fingerprint === fingerprint) continue
    const operation: SyncOperation = {
      operationId: crypto.randomUUID(), deviceId, entity, kind: item.kind, id: item.id,
      baseRevision: before?.revision ?? 0, deleted: false, value: JSON.parse(fingerprint),
    }
    journal.pending = journal.pending.filter((pending) => pending.entity !== entity)
    journal.pending.push(operation)
    journal.records[entity] = { fingerprint, revision: before?.revision ?? 0 }
  }
  for (const [entity, before] of Object.entries(journal.records)) {
    if (current.has(entity) || before.fingerprint === 'null') continue
    const [kind, id] = JSON.parse(entity) as [EntityKind, string]
    journal.pending = journal.pending.filter((pending) => pending.entity !== entity)
    journal.pending.push({ operationId: crypto.randomUUID(), deviceId, entity, kind, id, baseRevision: before.revision, deleted: true, value: null })
    journal.records[entity] = { ...before, fingerprint: 'null' }
  }
  return journal
}

export function applyPushResult(journal: OfflineJournal, sent: SyncOperation, result: PushResult): OfflineJournal {
  if (result.operationId !== sent.operationId || result.record.entity !== sent.entity) throw new Error('同步回执不匹配')
  const next = structuredClone(journal)
  if (result.status === 'conflict') {
    next.conflicts = next.conflicts.filter((conflict) => conflict.operation.operationId !== sent.operationId)
    next.conflicts.push({ operation: structuredClone(sent), remote: structuredClone(result.record) })
    return next
  }
  const revision = result.record.revision
  if (!Number.isInteger(revision) || revision !== sent.baseRevision + 1) throw new Error('同步版本不匹配')
  const record = next.records[sent.entity]
  if (!record || revision <= record.revision) return next
  record.revision = revision
  next.pending = next.pending.filter((operation) => operation.operationId !== sent.operationId)
  for (const operation of next.pending) {
    if (operation.entity === sent.entity) operation.baseRevision = revision
  }
  next.conflicts = next.conflicts.filter((conflict) => conflict.operation.entity !== sent.entity)
  return next
}
