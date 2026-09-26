let opening: Promise<IDBDatabase> | undefined

async function database(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('xk-download-cache', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('chunks')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { opening = undefined; reject(request.error) }
  })
  return opening
}

export async function readDownloadChunk(hash: string): Promise<ArrayBuffer | undefined> {
  try {
    const db = await database()
    return await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
      const request = db.transaction('chunks').objectStore('chunks').get(hash)
      request.onsuccess = () => resolve(request.result?.data)
      request.onerror = () => reject(request.error)
    })
  } catch { return undefined }
}

export async function cacheDownloadChunk(hash: string, data: ArrayBuffer): Promise<void> {
  try {
    const db = await database()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('chunks', 'readwrite')
      const store = tx.objectStore('chunks')
      store.put({ data, at: Date.now() }, hash)
      const entries = store.openCursor()
      const items: Array<{ key: IDBValidKey; at: number }> = []
      entries.onsuccess = () => {
        const cursor = entries.result
        if (cursor) { items.push({ key: cursor.key, at: cursor.value.at }); cursor.continue(); return }
        items.sort((a, b) => b.at - a.at).slice(64).forEach(item => store.delete(item.key))
      }
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(tx.error)
    })
  } catch {}
}

export async function clearDownloadChunks(hashes?: string[]): Promise<void> {
  try {
    const db = await database()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('chunks', 'readwrite')
      const store = tx.objectStore('chunks')
      if (hashes) hashes.forEach(hash => store.delete(hash))
      else store.clear()
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(tx.error)
    })
  } catch {}
}
