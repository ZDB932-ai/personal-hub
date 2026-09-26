import { clearDownloadChunks } from './downloadCache'

const DB_NAME = 'xk-docs'
const STORE = 'blobs'

let dbPromise: Promise<IDBDatabase> | null = null
const revisions = new Map<string, number>()
export const blobRevision = (id: string) => revisions.get(id) ?? 0

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'))
    })
  }
  return dbPromise
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = run(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(req.result as T)
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务已中止'))
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 事务失败'))
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 操作失败'))
  })
}

export interface StoredBlob {
  ivB64: string
  ct: ArrayBuffer
}

export function putBlob(id: string, blob: StoredBlob): Promise<IDBValidKey> {
  return withStore<IDBValidKey>('readwrite', (store) => store.put(blob, id)).then(value => { revisions.set(id, blobRevision(id) + 1); return value })
}

export function getBlob(id: string): Promise<StoredBlob | undefined> {
  return withStore('readonly', (store) => store.get(id))
}

export function deleteBlob(id: string): Promise<undefined> {
  return withStore<undefined>('readwrite', (store) => store.delete(id)).then(value => { revisions.set(id, blobRevision(id) + 1); return value })
}

export async function deleteAllBlobs(): Promise<void> {
  await withStore('readwrite', (store) => store.clear())
  await clearDownloadChunks()
  for (const [id, revision] of revisions) revisions.set(id, revision + 1)
}
