import type { DocMeta, VaultPayload } from '@/types'
import { collectionKinds, type CollectionKind, validateEntity } from './payloadSchema'
import { canonicalJSON } from './syncProtocol'

export interface RecoveryItem {
  id: string
  kind: CollectionKind
  sourceId: string
  savedAt: number
  reason: 'deleted' | 'changed'
  value: Record<string, unknown>
}

export function recoveryFingerprint(kind: CollectionKind, value: unknown): string {
  const result = { ...(value as Record<string, unknown>) }
  for (const field of ['updatedAt', 'lastUsedAt', 'lastRemindedTs', 'pinned']) delete result[field]
  if (kind === 'docMetas') { delete result.blobId; delete result.attachment }
  return canonicalJSON(result)
}

export function retainRecovery(items: RecoveryItem[], now = Date.now()): RecoveryItem[] {
  let bytes = 0
  return [...items].sort((a, b) => b.savedAt - a.savedAt).filter(item => {
    if (item.savedAt < now - 30 * 86400000) return false
    bytes += new TextEncoder().encode(JSON.stringify(item)).byteLength
    return bytes <= 2 * 1024 * 1024
  }).slice(0, 200)
}

export function captureRecovery(previous: VaultPayload | undefined, next: VaultPayload, now = Date.now()): VaultPayload {
  const items = [...(next.recoveryItems ?? [])]
  if (previous) for (const kind of collectionKinds) {
    const current = new Map((next[kind] ?? []).map(item => [item.id, item]))
    for (const before of previous[kind] ?? []) {
      const after = current.get(before.id)
      if (after && recoveryFingerprint(kind, before) === recoveryFingerprint(kind, after)) continue
      const reason = after ? 'changed' : 'deleted'
      if (items.some(item => item.kind === kind && item.sourceId === before.id && item.reason === reason && recoveryFingerprint(kind, item.value) === recoveryFingerprint(kind, before))) continue
      items.unshift({ id: crypto.randomUUID(), kind, sourceId: before.id, savedAt: now, reason, value: JSON.parse(JSON.stringify(before)) })
    }
  }
  return { ...next, recoveryItems: retainRecovery(items, now) }
}

export function recoveryAttachmentMetas(payload: VaultPayload): DocMeta[] {
  return [...(payload.docMetas ?? []), ...(payload.recoveryItems ?? []).filter(item => item.kind === 'docMetas').map(item => item.value as unknown as DocMeta)]
}

export function validateRecovery(items: unknown): asserts items is RecoveryItem[] {
  if (items === undefined) return
  if (!Array.isArray(items)) throw new Error('恢复记录格式无效')
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || typeof item.sourceId !== 'string' || !collectionKinds.includes(item.kind) || !Number.isFinite(item.savedAt) || !['changed', 'deleted'].includes(item.reason)) throw new Error('恢复记录格式无效')
    validateEntity(item.kind, item.value)
    if (item.value.id !== item.sourceId) throw new Error('恢复记录标识无效')
  }
}

export function restoreRecoveryCopy(payload: VaultPayload, item: RecoveryItem): string {
  validateEntity(item.kind, item.value)
  const copy = JSON.parse(JSON.stringify(item.value)) as Record<string, unknown>
  const id = crypto.randomUUID()
  copy.id = id
  copy.createdAt = Date.now()
  copy.updatedAt = Date.now()
  if (item.kind === 'docMetas') copy.blobId = item.value.blobId ?? item.sourceId
  const title = item.kind === 'docMetas' ? 'name' : item.kind === 'repos' ? 'fullName' : 'title'
  if (item.kind !== 'repos') copy[title] = `${copy[title] || '未命名'}（恢复副本）`
  if (item.kind === 'tasks') {
    for (const field of ['repeatSourceId', 'weeklyPlanId', 'longPlanId', 'focusDate', 'lastRemindedTs', 'scheduledBy', 'scheduleLocked']) delete copy[field]
    copy.repeat = 'none'
  }
  if (item.kind === 'weeklyPlans') copy.taskIds = []
  const target = payload as unknown as Record<string, unknown>
  target[item.kind] = [...(payload[item.kind] ?? []), copy]
  return id
}
