import type { VaultPayload } from '@/types'
import { projectEntities, type OfflineJournal } from './offlineJournal'
import { canonicalJSON, entityKey, type EntityKind, type SyncRecord } from './syncProtocol'
import { attachmentBlobId, validateAttachment, type Attachment } from './attachmentSync'
import { validateEntity } from './payloadSchema'
import { restoreRecoveryCopy } from './recovery'

const collections = ['entries', 'tasks', 'weeklyPlans', 'longPlans', 'agentResources', 'memos', 'docMetas', 'repos'] as const
const singletons = ['profile', 'planner', 'agentResourceTaxonomy'] as const

export function parseEntity(entity: string): [EntityKind, string] {
  const parts: unknown = JSON.parse(entity)
  if (!Array.isArray(parts) || parts.length !== 2 || typeof parts[1] !== 'string' || !parts[1] ||
    ![...collections, ...singletons].includes(parts[0]) || entityKey(parts[0], parts[1]) !== entity ||
    ((singletons as readonly string[]).includes(parts[0]) && parts[1] !== 'singleton')) throw new Error('同步记录标识无效')
  return parts as [EntityKind, string]
}

export function validateRecord(record: SyncRecord): void {
  const [kind, id] = parseEntity(record.entity)
  if (!Number.isSafeInteger(record.revision) || record.revision < 0 || typeof record.deleted !== 'boolean') throw new Error('同步记录格式无效')
  if (record.deleted) {
    if ((singletons as readonly string[]).includes(kind)) throw new Error('不能删除保险库单例记录')
    return
  }
  if (!record.value || typeof record.value !== 'object' || Array.isArray(record.value)) throw new Error('同步记录内容无效')
  validateEntity(kind, record.value)
  if ((collections as readonly string[]).includes(kind) && (record.value as { id?: string }).id !== id) throw new Error('同步记录内容标识不匹配')
  if (kind === 'docMetas' && (record.value as { attachment?: Attachment }).attachment) validateAttachment((record.value as { attachment: Attachment }).attachment)
}

export function applyRecord(payload: VaultPayload, record: SyncRecord): void {
  validateRecord(record)
  const [kind, id] = parseEntity(record.entity)
  const data = payload as unknown as Record<string, unknown>
  if ((singletons as readonly string[]).includes(kind)) {
    data[kind] = structuredClone(record.value)
    return
  }
  const items = (data[kind] ?? []) as Array<Record<string, unknown>>
  const before = items.find(item => item.id === id)
  const rest = items.filter(item => item.id !== id)
  if (!record.deleted) {
    const value = structuredClone(record.value) as Record<string, unknown>
    if (kind === 'tasks') {
      delete value.lastRemindedTs
      if (before?.lastRemindedTs !== undefined) value.lastRemindedTs = before.lastRemindedTs
    }
    if (kind === 'docMetas') {
      delete value.blobId
      if (before) value.blobId = before.blobId ?? before.id
      if (value.attachment && JSON.stringify(value.attachment) !== JSON.stringify(before?.attachment)) value.blobId = attachmentBlobId(value.attachment as Attachment)
    }
    const index = items.findIndex(item => item.id === id)
    rest.splice(index < 0 ? rest.length : index, 0, value)
  }
  data[kind] = rest
}

export function mergeRemote(payload: VaultPayload, record: SyncRecord): void {
  validateRecord(record)
  record = structuredClone(record)
  if (!record.deleted) {
    const [kind] = parseEntity(record.entity)
    if (kind === 'tasks') delete (record.value as Record<string, unknown>).lastRemindedTs
    if (kind === 'docMetas') delete (record.value as Record<string, unknown>).blobId
  }
  const journal = payload.offlineJournal!
  const known = journal.records[record.entity]
  const conflict = journal.conflicts.find(item => item.remote.entity === record.entity)
  if (record.revision <= (known?.revision ?? -1) || record.revision < (conflict?.remote.revision ?? -1)) return
  const pending = journal.pending.find(item => item.entity === record.entity)
  const fingerprint = record.deleted ? 'null' : canonicalJSON(record.value)
  if (pending && known?.fingerprint !== fingerprint) {
    journal.conflicts = journal.conflicts.filter(item => item.remote.entity !== record.entity)
    journal.conflicts.push({ operation: structuredClone(pending), remote: structuredClone(record) })
    return
  }
  applyRecord(payload, record)
  journal.records[record.entity] = { revision: record.revision, fingerprint }
  journal.pending = journal.pending.filter(item => item.entity !== record.entity)
  journal.conflicts = journal.conflicts.filter(item => item.remote.entity !== record.entity)
}

export function resolveConflict(payload: VaultPayload, entity: string, remoteRevision: number, operationId: string, choice: 'local' | 'remote' | 'both'): void {
  const journal = payload.offlineJournal!
  if (journal.sync?.inFlight?.operation.entity === entity) throw new Error('该记录仍有未确认的发送，请先重试同步')
  const conflict = journal.conflicts.find(item => item.remote.entity === entity)
  const local = journal.pending.find(item => item.entity === entity)
  if (!conflict || conflict.remote.revision !== remoteRevision || local?.operationId !== operationId) throw new Error('冲突内容已变化，请重新查看后选择')
  if (choice === 'both' && (local.deleted || conflict.remote.deleted || !['tasks', 'memos'].includes(local.kind))) throw new Error('此冲突不支持保留两个副本')
  journal.pending = journal.pending.filter(item => item.entity !== entity)
  journal.conflicts = journal.conflicts.filter(item => item.remote.entity !== entity)
  if (choice === 'remote' || choice === 'both') {
    applyRecord(payload, conflict.remote)
    journal.records[entity] = { revision: remoteRevision, fingerprint: conflict.remote.deleted ? 'null' : canonicalJSON(conflict.remote.value) }
    if (choice === 'both') {
      const kind = local.kind as 'tasks' | 'memos'
      const id = restoreRecoveryCopy(payload, { id: '', sourceId: local.id, kind, savedAt: Date.now(), reason: 'changed', value: local.value as Record<string, unknown> })
      const value = payload[kind]!.find(item => item.id === id)!
      const copyEntity = entityKey(kind, id)
      journal.records[copyEntity] = { revision: 0, fingerprint: canonicalJSON(value) }
      journal.pending.push({ ...local, operationId: crypto.randomUUID(), entity: copyEntity, id, baseRevision: 0, value })
    }
  } else {
    journal.records[entity].revision = remoteRevision
    journal.pending.push({ ...local, operationId: crypto.randomUUID(), baseRevision: remoteRevision })
  }
}

export function preserveConcurrentEdits(before: VaultPayload, current: VaultPayload, merged: VaultPayload): void {
  const previous = new Map(projectEntities(before).map(item => [entityKey(item.kind, item.id), item]))
  const next = new Map(projectEntities(current).map(item => [entityKey(item.kind, item.id), item]))
  for (const entity of new Set([...previous.keys(), ...next.keys()])) {
    const a = previous.get(entity)
    const b = next.get(entity)
    if (canonicalJSON(a?.value) !== canonicalJSON(b?.value)) {
      applyRecord(merged, { entity, revision: 0, deleted: !b, value: b?.value ?? null })
    }
  }
  for (const kind of ['tasks', 'docMetas'] as const) {
    const field = kind === 'tasks' ? 'lastRemindedTs' : 'blobId'
    for (const item of merged[kind] ?? []) {
      const local = current[kind]?.find(value => value.id === item.id)
      if (!local) continue
      const target = item as unknown as Record<string, unknown>
      const source = local as unknown as Record<string, unknown>
      if (source[field] === undefined) delete target[field]
      else target[field] = source[field]
    }
  }
}

export function journalOf(payload: VaultPayload): OfflineJournal {
  if (!payload.offlineJournal) throw new Error('离线同步队列尚未准备')
  return payload.offlineJournal
}
