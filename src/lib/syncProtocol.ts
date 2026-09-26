export type EntityKind = 'profile' | 'entries' | 'tasks' | 'weeklyPlans' | 'longPlans' | 'planner' | 'agentResources' | 'agentResourceTaxonomy' | 'memos' | 'docMetas' | 'repos'

export interface SyncOperation {
  operationId: string
  deviceId: string
  entity: string
  kind: EntityKind
  id: string
  baseRevision: number
  deleted: boolean
  value: unknown
}

export interface SyncRecord {
  entity: string
  revision: number
  deleted: boolean
  value: unknown
}

export type PushResult =
  | { status: 'accepted'; operationId: string; record: SyncRecord }
  | { status: 'conflict'; operationId: string; record: SyncRecord }

export function entityKey(kind: EntityKind, id: string): string {
  return JSON.stringify([kind, id])
}

export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJSON(item ?? null)).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJSON(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
