import { afterEach, describe, expect, it, vi } from 'vitest'
import { startForegroundSync } from '../foregroundSync'
import { scheduleWithinCapacity } from '../planningCapacity'
import { searchHub } from '../hubSearch'
import { captureRecovery, restoreRecoveryCopy, retainRecovery } from '../recovery'
import { validatePayload, validateEntity } from '../payloadSchema'
import { rehearsalPayload } from '../syncRehearsal'
import { reconcileJournal } from '../offlineJournal'
import { resolveConflict, mergeRemote } from '../syncMerge'
import { entityKey } from '../syncProtocol'

afterEach(() => vi.useRealTimers())

describe('前台刷新与分钟排期', () => {
  it('无本机编辑仍拉取，后台或锁定暂停，停止后无残留请求', async () => {
    vi.useFakeTimers()
    let allowed = true
    const run = vi.fn()
    const stop = startForegroundSync(run, () => allowed, () => 45000)
    await vi.advanceTimersByTimeAsync(45000)
    expect(run).toHaveBeenCalledTimes(1)
    allowed = false
    await vi.advanceTimersByTimeAsync(90000)
    expect(run).toHaveBeenCalledTimes(1)
    allowed = true
    await vi.advanceTimersByTimeAsync(45000)
    expect(run).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(90000)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('长任务不塞进不足的时间，零容量与满载日保留空白', () => {
    const days = [
      { date: '2030-01-01', capacity: 60, load: 55, preferred: true, energy: 0 },
      { date: '2030-01-02', capacity: 180, load: 30, preferred: false, energy: 1 },
      { date: '2030-01-03', capacity: 0, load: 0, preferred: true, energy: 2 },
    ]
    expect(scheduleWithinCapacity(days, 3, 90)).toEqual(['2030-01-02'])
    expect(days[1].load).toBe(30)
    expect(scheduleWithinCapacity([], 2, 30)).toEqual([])
  })
})

describe('搜索与格式边界', () => {
  it('账号密码、TOTP 和备注不进入通用搜索，用户名可查', () => {
    const payload = rehearsalPayload()
    payload.entries = [{ id: 'e', title: '网站', username: 'alice', password: 'secret-password', totp: 'secret-totp', notes: 'secret-notes', url: 'https://example.org', category: '工作', createdAt: 1, updatedAt: 1 }]
    expect(searchHub(payload, 'secret')).toEqual([])
    expect(searchHub(payload, 'alice')[0].id).toBe('e')
    expect(searchHub(payload, 'alice', 'tasks')).toEqual([])
  })

  it('拒绝未知格式版本和损坏字段，兼容无版本旧数据并保留扩展', () => {
    expect(() => validatePayload({ profile: { name: '旧版' } })).not.toThrow()
    expect(() => validatePayload({ profile: {}, entries: [], schemaVersion: 2 })).toThrow('升级')
    expect(() => validateEntity('tasks', { id: 'x', tags: 5 })).toThrow('不兼容')
    expect(() => validateEntity('tasks', { id: 'x', estimatedMinutes: 0 })).toThrow()
    const data = { profile: {}, entries: [], schemaVersion: 1, futureProperty: { text: '保留' } }
    validatePayload(data)
    expect(data.futureProperty.text).toBe('保留')
  })
})

describe('可恢复的修改与删除', () => {
  const memo = { id: 'memo', title: '原始标题', content: '原始内容', color: 'indigo', pinned: false, createdAt: 1, updatedAt: 1 }
  it('保存旧版本和删除前内容，恢复为独立副本且不复活墓碑', () => {
    const before = { ...rehearsalPayload(), memos: [memo] }
    const changed = captureRecovery(before, { ...before, memos: [{ ...memo, content: '新内容' }] })
    expect(changed.recoveryItems![0].value.content).toBe('原始内容')
    const deleted = captureRecovery(changed, { ...changed, memos: [] })
    const id = restoreRecoveryCopy(deleted, deleted.recoveryItems!.find(item => item.reason === 'deleted')!)
    expect(id).not.toBe('memo')
    expect(deleted.memos![0].content).toBe('新内容')
    expect(deleted.memos![0].title).toContain('恢复副本')
    expect(reconcileJournal(deleted, undefined, 'd').pending.some(item => item.id === id)).toBe(true)
  })

  it('提醒时间和置顶不制造历史，限制条数及时间', () => {
    const before = { ...rehearsalPayload(), memos: [memo] }
    expect(captureRecovery(before, { ...before, memos: [{ ...memo, pinned: true, updatedAt: 99 }] }).recoveryItems).toEqual([])
    const history = captureRecovery(before, { ...before, memos: [] }).recoveryItems![0]
    expect(retainRecovery(Array.from({ length: 250 }, (_, i) => ({ ...history, id: String(i) })))).toHaveLength(200)
    expect(retainRecovery([{ ...history, savedAt: 1 }])).toEqual([])
  })

  it('资料恢复保留旧附件引用而不是使用新条目 ID 寻找文件', () => {
    const payload = rehearsalPayload()
    const id = restoreRecoveryCopy(payload, { id: 'history', sourceId: 'doc', kind: 'docMetas', savedAt: 1, reason: 'deleted', value: { id: 'doc', name: 'a.txt', size: 1 } })
    expect(payload.docMetas!.find(meta => meta.id === id)?.blobId).toBe('doc')
  })

  it('保留两个副本后原条目采用远端，新副本进入待同步队列', () => {
    const payload = { ...rehearsalPayload(), memos: [memo] }
    payload.offlineJournal = reconcileJournal(payload, undefined, 'd')
    const remote = { entity: entityKey('memos', memo.id), revision: 2, deleted: false, value: { ...memo, content: '远端内容' } }
    mergeRemote(payload, remote)
    const operation = payload.offlineJournal.pending.find(item => item.id === memo.id)!
    resolveConflict(payload, remote.entity, 2, operation.operationId, 'both')
    expect(payload.memos).toHaveLength(2)
    expect(payload.memos.find(item => item.id === memo.id)?.content).toBe('远端内容')
    const copy = payload.memos.find(item => item.id !== memo.id)!
    expect(copy.content).toBe('原始内容')
    expect(payload.offlineJournal.pending.find(item => item.id === copy.id)?.baseRevision).toBe(0)
    expect(payload.offlineJournal.conflicts).toHaveLength(0)
  })
})


it('continuation edits cannot evict deleted records, and are searchable', () => {
  const base = rehearsalPayload()
  const task = { id: 'focus', title: '作品', date: '', time: '', notes: '', priority: 2 as const, repeat: 'none' as const, done: false, tags: [], subtasks: [], createdAt: 1, updatedAt: 1, resumeNote: '独有检索词' }
  let previous = { ...base, tasks: [task], recoveryItems: [{ id: 'deleted', kind: 'memos' as const, sourceId: 'lost', savedAt: 1000, reason: 'deleted' as const, value: { id: 'lost', title: '可恢复' } }] } as typeof base
  for (let i = 0; i < 201; i++) {
    const next = structuredClone(previous)
    next.tasks![0]!.resumeNote = `继续 ${i}`
    next.tasks![0]!.resumeUpdatedAt = 2000 + i
    previous = captureRecovery(previous, next, 2000 + i)
  }
  expect(previous.recoveryItems!.some(item => item.id === 'deleted')).toBe(true)
  expect(previous.recoveryItems!.filter(item => item.reason === 'changed')).toHaveLength(1)
  expect(searchHub({ ...base, tasks: [task] }, '独有检索词')).toHaveLength(1)
  const changed = previous.recoveryItems!.find(item => item.reason === 'changed')!
  const many = Array.from({ length: 300 }, (_, i) => ({ ...changed, id: `v${i}`, savedAt: 4000 + i }))
  const kept = retainRecovery([...many, previous.recoveryItems!.find(item => item.id === 'deleted')!], 5000)
  expect(kept.some(item => item.id === 'deleted')).toBe(true)
  expect(kept.filter(item => item.reason === 'changed')).toHaveLength(20)
})
