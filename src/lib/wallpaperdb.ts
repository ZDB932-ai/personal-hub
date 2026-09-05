const DB_NAME = 'xk-wallpaper'
const STORE = 'imgs'

let dbPromise: Promise<IDBDatabase> | null = null

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
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 操作失败'))
  })
}

export function putImg(id: string, blob: Blob): Promise<IDBValidKey> {
  return withStore('readwrite', (store) => store.put(blob, id))
}

export function getImg(id: string): Promise<Blob | undefined> {
  return withStore('readonly', (store) => store.get(id))
}

export function deleteImg(id: string): Promise<undefined> {
  return withStore('readwrite', (store) => store.delete(id))
}

export async function deleteAllImgs(): Promise<void> {
  await withStore('readwrite', (store) => store.clear())
}
