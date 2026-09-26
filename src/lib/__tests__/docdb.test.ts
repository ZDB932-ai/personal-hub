import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllGlobals())

it('附件写入仅在事务完成后成功，事务中止会报错', async () => {
  vi.resetModules()
  const request = { result: 'doc-id' }
  const tx = { objectStore: () => ({ put: () => request }), oncomplete: () => {}, onabort: () => {}, error: null as Error | null }
  const opened = { result: { transaction: () => tx }, onsuccess: () => {} }
  vi.stubGlobal('indexedDB', { open: () => {
    queueMicrotask(() => opened.onsuccess())
    return opened
  } })
  const { putBlob } = await import('@/lib/docdb')
  const value = { ivB64: '', ct: new ArrayBuffer(0) }
  let complete = false
  const first = putBlob('doc-id', value).then(() => { complete = true })
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(complete).toBe(false)
  tx.oncomplete()
  await first
  expect(complete).toBe(true)
  const second = putBlob('doc-id', value)
  const rejected = expect(second).rejects.toThrow('事务已中止')
  await new Promise(resolve => setTimeout(resolve, 0))
  tx.onabort()
  await rejected
})
