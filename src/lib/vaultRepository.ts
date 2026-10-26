import { recoverStorageTransaction } from './storageTransaction'

export const repositoryKeys = ['xk.data.v2', 'xk.sync.secure', 'xk.github.secure', 'xk.ai.secrets.v1', 'xk.record-sync.secure', 'xk.desktop-todo.secure', 'xk.lock.v2'] as const
export type RepositoryKey = typeof repositoryKeys[number]

export interface RepositorySnapshot {
  version: 1
  revision: string
  values: Partial<Record<RepositoryKey, unknown>>
}

export interface VaultRepository {
  load(): Promise<RepositorySnapshot | undefined>
  initialize(values: RepositorySnapshot['values']): Promise<RepositorySnapshot>
  commit(expectedRevision: string, values: RepositorySnapshot['values'], guard?: () => boolean): Promise<RepositorySnapshot>
}

export class StorageConflictError extends Error {
  constructor() {
    super('另一个窗口已更新数据，本次未保存。请先导出本窗口备份，再刷新以载入最新数据。')
    this.name = 'StorageConflictError'
  }
}

export class IndexedDBVaultRepository implements VaultRepository {
  private opening: Promise<IDBDatabase> | undefined

  constructor(private name = 'xk-vault') {}

  private open(): Promise<IDBDatabase> {
    if (!this.opening) {
      this.opening = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(this.name, 1)
        request.onupgradeneeded = () => request.result.createObjectStore('state')
        request.onerror = () => reject(request.error ?? new Error('本机数据库打开失败'))
        request.onblocked = () => reject(new Error('数据库升级被其他窗口阻止，请关闭其他窗口后重试'))
        request.onsuccess = () => {
          request.result.onversionchange = () => { request.result.close(); this.opening = undefined }
          resolve(request.result)
        }
      }).catch(error => { this.opening = undefined; throw error })
    }
    return this.opening
  }

  private async transaction(update?: (current: RepositorySnapshot | undefined, store: IDBObjectStore) => RepositorySnapshot): Promise<RepositorySnapshot | undefined> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', update ? 'readwrite' : 'readonly')
      const store = tx.objectStore('state')
      const request = store.get('current')
      let result: RepositorySnapshot | undefined
      let failure: unknown
      request.onsuccess = () => {
        try {
          const current = request.result as RepositorySnapshot | undefined
          if (current && (current.version !== 1 || typeof current.revision !== 'string' || !current.values || typeof current.values !== 'object')) {
            throw new Error('本机数据库格式异常，已停止写入')
          }
          result = update ? update(current, store) : current
        } catch (error) {
          failure = error
          tx.abort()
        }
      }
      tx.oncomplete = () => resolve(result)
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('本机数据库事务已中止'))
      tx.onerror = () => { failure ??= tx.error }
    })
  }

  load(): Promise<RepositorySnapshot | undefined> {
    return this.transaction()
  }

  async initialize(values: RepositorySnapshot['values']): Promise<RepositorySnapshot> {
    return (await this.transaction((current, store) => {
      if (current) return current
      const next: RepositorySnapshot = { version: 1, revision: crypto.randomUUID(), values }
      store.put(next, 'migration-backup')
      store.put(next, 'current')
      return next
    }))!
  }

  async commit(expectedRevision: string, values: RepositorySnapshot['values'], guard = () => true): Promise<RepositorySnapshot> {
    return (await this.transaction((current, store) => {
      if (!current || current.revision !== expectedRevision) throw new StorageConflictError()
      if (!guard()) throw new Error('数据状态已变化，请重试')
      const next: RepositorySnapshot = { version: 1, revision: crypto.randomUUID(), values }
      store.put(next, 'current')
      store.delete('migration-backup')
      return next
    }))!
  }
}

export const vaultRepository: VaultRepository = new IndexedDBVaultRepository()
let snapshot: RepositorySnapshot | undefined
let queue: Promise<unknown> = Promise.resolve()

export function isRepositoryKey(key: string): key is RepositoryKey {
  return (repositoryKeys as readonly string[]).includes(key)
}

function clearLegacyKeys(): void {
  for (const key of repositoryKeys) localStorage.removeItem(key)
}

export async function initializeVaultRepository(): Promise<void> {
  recoverStorageTransaction()
  let loaded = await vaultRepository.load()
  if (!loaded) {
    const values: RepositorySnapshot['values'] = {}
    for (const key of repositoryKeys) {
      const raw = localStorage.getItem(key)
      if (raw !== null) values[key] = JSON.parse(raw)
    }
    const migrated = await vaultRepository.initialize(values)
    loaded = await vaultRepository.load()
    if (!loaded || loaded.revision !== migrated.revision) throw new Error('数据迁移校验失败，请重新打开应用；原数据已保留')
  }
  clearLegacyKeys()
  snapshot = loaded
}

export function readRepository<T>(key: RepositoryKey): T | null {
  if (!snapshot) throw new Error('本机数据库尚未初始化')
  const value = snapshot.values[key]
  return value === undefined ? null : structuredClone(value) as T
}

export function repositoryRevision(): string {
  if (!snapshot) throw new Error('本机数据库尚未初始化')
  return snapshot.revision
}

export function commitRepository(values: RepositorySnapshot['values'], guard = () => true): Promise<void> {
  const patch = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === undefined ? undefined : JSON.parse(JSON.stringify(value))]))
  const saving = queue.then(async () => {
    if (!snapshot) throw new Error('本机数据库尚未初始化')
    if (!guard()) throw new Error('数据状态已变化，请重试')
    const next = { ...snapshot.values, ...patch }
    for (const key of repositoryKeys) if (next[key] === undefined) delete next[key]
    snapshot = await vaultRepository.commit(snapshot.revision, next, guard)
  })
  queue = saving.catch(() => {})
  return saving
}

export async function refreshVaultRepository(): Promise<void> {
  await queue
  const loaded = await vaultRepository.load()
  if (!loaded) throw new Error('本机数据库已被移除，请重新打开应用')
  snapshot = loaded
}

export async function resetVaultRepository(): Promise<void> {
  await commitRepository(Object.fromEntries(repositoryKeys.map(key => [key, undefined])))
  clearLegacyKeys()
}
