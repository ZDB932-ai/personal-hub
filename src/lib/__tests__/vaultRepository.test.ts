import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { IndexedDBVaultRepository, StorageConflictError } from '../vaultRepository'

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('indexedDB', new IDBFactory())
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: vi.fn((key: string) => { storage.delete(key) }),
  })
})

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('事务存储与多窗口竞争', () => {
  it('竞争初始化只产生一份数据，后来的迁移不会覆盖当前库', async () => {
    const a = new IndexedDBVaultRepository()
    const b = new IndexedDBVaultRepository()
    const [first, second] = await Promise.all([
      a.initialize({ 'xk.data.v2': 'first' }),
      b.initialize({ 'xk.data.v2': 'second' }),
    ])
    expect(first).toEqual(second)
    expect(await a.load()).toEqual(first)
  })

  it('两个窗口同时基于旧版本保存时只有一个成功，且不会静默覆盖', async () => {
    const a = new IndexedDBVaultRepository()
    const b = new IndexedDBVaultRepository()
    const initial = await a.initialize({ 'xk.data.v2': 'initial' })
    const results = await Promise.allSettled([
      a.commit(initial.revision, { 'xk.data.v2': 'first' }),
      b.commit(initial.revision, { 'xk.data.v2': 'second' }),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(StorageConflictError)
    const winner = results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof a.load>>>
    expect(await b.load()).toEqual(winner.value)
  })

  it('写请求发出后事务中止，信封和凭据仍全部保留旧版本', async () => {
    const repository = new IndexedDBVaultRepository()
    const initial = await repository.initialize({ 'xk.data.v2': 'old-envelope', 'xk.sync.secure': 'old-secret' })
    const original = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
      const request = original.apply(this, args)
      this.transaction.abort()
      return request
    })
    await expect(repository.commit(initial.revision, { 'xk.data.v2': 'new-envelope', 'xk.sync.secure': 'new-secret' })).rejects.toThrow()
    expect(await repository.load()).toEqual(initial)
  })

  it('状态守卫在真实事务内执行，拒绝等待期间失效的写入', async () => {
    const repository = new IndexedDBVaultRepository()
    const initial = await repository.initialize({})
    await expect(repository.commit(initial.revision, { 'xk.data.v2': 'unsafe' }, () => false)).rejects.toThrow('状态已变化')
    expect(await repository.load()).toEqual(initial)
  })
})

describe('旧数据迁移与恢复', () => {
  it('恢复旧回滚日志后迁移，原密文保持不变，事务确认后清理旧键', async () => {
    localStorage.setItem('xk.data.v2', JSON.stringify({ ctB64: 'incomplete' }))
    localStorage.setItem('xk.storage.rollback.v1', JSON.stringify({ 'xk.data.v2': JSON.stringify({ ctB64: 'original' }) }))
    localStorage.setItem('xk.sync.secure', JSON.stringify({ ctB64: 'secret' }))
    localStorage.setItem('xk.theme.v1', 'keep-theme')
    const repository = await import('../vaultRepository')
    await repository.initializeVaultRepository()
    expect(repository.readRepository('xk.data.v2')).toEqual({ ctB64: 'original' })
    expect(repository.readRepository('xk.sync.secure')).toEqual({ ctB64: 'secret' })
    expect(localStorage.getItem('xk.data.v2')).toBeNull()
    expect(localStorage.getItem('xk.storage.rollback.v1')).toBeNull()
    expect(localStorage.getItem('xk.theme.v1')).toBe('keep-theme')
  })

  it('迁移事务失败保留原数据，重试可以继续', async () => {
    localStorage.setItem('xk.data.v2', '{"ctB64":"original"}')
    const repository = await import('../vaultRepository')
    vi.spyOn(repository.vaultRepository, 'initialize').mockRejectedValueOnce(new Error('quota'))
    await expect(repository.initializeVaultRepository()).rejects.toThrow('quota')
    expect(localStorage.getItem('xk.data.v2')).toBe('{"ctB64":"original"}')
    await repository.initializeVaultRepository()
    expect(repository.readRepository('xk.data.v2')).toEqual({ ctB64: 'original' })
  })

  it('旧数据解析失败不会进入空白新库，也不会删除来源', async () => {
    localStorage.setItem('xk.data.v2', '{invalid')
    const repository = await import('../vaultRepository')
    await expect(repository.initializeVaultRepository()).rejects.toThrow()
    expect(await repository.vaultRepository.load()).toBeUndefined()
    expect(localStorage.getItem('xk.data.v2')).toBe('{invalid')
  })

  it('清理旧键时中断，重启读取已提交数据而不重复导入旧副本', async () => {
    localStorage.setItem('xk.data.v2', '{"ctB64":"original"}')
    const repository = await import('../vaultRepository')
    vi.mocked(localStorage.removeItem).mockImplementationOnce(() => { throw new Error('interrupted') })
    await expect(repository.initializeVaultRepository()).rejects.toThrow('interrupted')
    localStorage.setItem('xk.data.v2', '{"ctB64":"stale"}')
    await repository.initializeVaultRepository()
    expect(repository.readRepository('xk.data.v2')).toEqual({ ctB64: 'original' })
  })

  it('重置后保留新的版本标记，阻止其他窗口复活旧数据', async () => {
    const repository = await import('../vaultRepository')
    await repository.initializeVaultRepository()
    await repository.commitRepository({ 'xk.data.v2': 'old-data' })
    const other = new IndexedDBVaultRepository()
    const stale = (await other.load())!
    await repository.resetVaultRepository()
    await expect(other.commit(stale.revision, stale.values)).rejects.toThrow('另一个窗口')
    expect(repository.readRepository('xk.data.v2')).toBeNull()
  })

  it('同窗口队列串行保存，失败不污染缓存，后续仍能重试', async () => {
    const repository = await import('../vaultRepository')
    await repository.initializeVaultRepository()
    await Promise.all([
      repository.commitRepository({ 'xk.data.v2': 'envelope' }),
      repository.commitRepository({ 'xk.sync.secure': 'secret' }),
    ])
    vi.spyOn(repository.vaultRepository, 'commit').mockRejectedValueOnce(new Error('quota'))
    await expect(repository.commitRepository({ 'xk.data.v2': 'not-saved' })).rejects.toThrow('quota')
    expect(repository.readRepository('xk.data.v2')).toBe('envelope')
    await repository.commitRepository({ 'xk.data.v2': 'retried' })
    expect(repository.readRepository('xk.data.v2')).toBe('retried')
    expect(repository.readRepository('xk.sync.secure')).toBe('secret')
  })
})
