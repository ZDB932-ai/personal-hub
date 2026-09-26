import { describe, expect, it } from 'vitest'
import type { VaultPayload } from '@/types'
import { applyPushResult, reconcileJournal } from '@/lib/offlineJournal'
import { canonicalJSON, entityKey } from '@/lib/syncProtocol'
import { MemorySyncServer } from './helpers/memorySyncServer'

function payload(): VaultPayload {
  return {
    profile: { name: '用户', nickname: '', bio: '', email: '', phone: '', birthday: '', location: '', github: '', blog: '' },
    entries: [{ id: 'password-1', title: '账号', username: 'name', password: 'secret', url: '', notes: '', category: '其他', createdAt: 1, updatedAt: 1 }],
    tasks: [{ id: 'task-1', title: '第一项', notes: '', date: '2026-09-19', time: '', priority: 2, repeat: 'none', done: false, tags: [], subtasks: [], createdAt: 1, updatedAt: 1 }],
  }
}

describe('离线记录准备', () => {
  it('首次迁移准备每条记录，重复保存不会反复产生操作', () => {
    const data = payload()
    const journal = reconcileJournal(data, undefined, 'phone')
    expect(journal.pending).toHaveLength(3)
    expect(new Set(journal.pending.map(operation => operation.operationId)).size).toBe(3)
    expect(reconcileJournal(data, journal, 'phone')).toEqual(journal)
  })

  it('多次离线编辑只保留每条记录的最新操作，不影响其他记录', () => {
    const data = payload()
    const before = reconcileJournal(data, undefined, 'phone')
    const passwordOperation = before.pending.find(operation => operation.kind === 'entries')!
    data.tasks![0].title = '第二版'
    const second = reconcileJournal(data, before, 'phone')
    data.tasks![0].title = '第三版'
    const third = reconcileJournal(data, second, 'phone')
    expect(third.pending).toHaveLength(3)
    expect(third.pending.find(operation => operation.kind === 'entries')).toEqual(passwordOperation)
    expect(third.pending.find(operation => operation.kind === 'tasks')!.value).toMatchObject({ title: '第三版' })
    expect(before.pending.find(operation => operation.kind === 'tasks')!.value).toMatchObject({ title: '第一项' })
  })

  it('删除形成稳定 tombstone，重新建立同 ID 记录后可以更新', () => {
    const data = payload()
    const task = data.tasks![0]
    const before = reconcileJournal(data, undefined, 'phone')
    data.tasks = []
    const removed = reconcileJournal(data, before, 'phone')
    const deletion = removed.pending.find(operation => operation.kind === 'tasks')!
    expect(deletion.deleted).toBe(true)
    expect(deletion.value).toBeNull()
    expect(reconcileJournal(data, removed, 'phone')).toEqual(removed)
    data.tasks = [task]
    const restored = reconcileJournal(data, removed, 'phone')
    expect(restored.pending.find(operation => operation.kind === 'tasks')!.deleted).toBe(false)
  })

  it('备份带到另一台设备时创建本机队列，不冒用源设备操作 ID', () => {
    const data = payload()
    const original = reconcileJournal(data, undefined, 'phone')
    const imported = reconcileJournal(data, original, 'desktop')
    expect(imported.deviceId).toBe('desktop')
    expect(imported.pending.every(operation => operation.deviceId === 'desktop')).toBe(true)
    expect(imported.pending[0].operationId).not.toBe(original.pending[0].operationId)
  })

  it('本机提醒标记和附件物理路径不进入共享记录', () => {
    const data = payload()
    data.docMetas = [{ id: 'doc', blobId: 'local-copy-1', name: '文档', category: '其他', tags: [], note: '', size: 1, mime: 'text/plain', pinned: false, createdAt: 1 }]
    const before = reconcileJournal(data, undefined, 'phone')
    data.tasks![0].lastRemindedTs = 123
    data.docMetas[0].blobId = 'local-copy-2'
    expect(reconcileJournal(data, before, 'phone')).toEqual(before)
    expect(before.pending.find(operation => operation.kind === 'docMetas')!.value).not.toHaveProperty('blobId')
  })

  it('规范化顺序不受对象键插入次序影响，但保留数组顺序', () => {
    expect(canonicalJSON({ b: 1, a: { z: 2, x: 1 } })).toBe(canonicalJSON({ a: { x: 1, z: 2 }, b: 1 }))
    expect(canonicalJSON([1, 2])).not.toBe(canonicalJSON([2, 1]))
    expect(entityKey('tasks', 'a:b')).not.toBe(entityKey('memos', 'a:b'))
  })

  it('拒绝同一集合内重复 ID，保留原队列', () => {
    const data = payload()
    const before = reconcileJournal(data, undefined, 'phone')
    data.tasks!.push({ ...data.tasks![0] })
    expect(() => reconcileJournal(data, before, 'phone')).toThrow('重复记录')
    expect(before.pending).toHaveLength(3)
  })
})

describe('多设备协议模拟', () => {
  it('三个设备修改不同记录均被保留，游标可补拉', async () => {
    const server = new MemorySyncServer()
    const phone = reconcileJournal(payload(), undefined, 'phone')
    const web = reconcileJournal(payload(), undefined, 'web')
    const desktop = reconcileJournal(payload(), undefined, 'desktop')
    for (const operation of [phone.pending[0], web.pending[1], desktop.pending[2]]) {
      expect((await server.push(operation)).status).toBe('accepted')
    }
    const result = await server.pull(0)
    expect(result.records).toHaveLength(3)
    expect((await server.pull(result.cursor)).records).toHaveLength(0)
    expect((await server.pull(1)).records).toHaveLength(2)
  })

  it('请求成功但回执丢失时，使用相同操作重试不会重复递增版本', async () => {
    const server = new MemorySyncServer()
    const operation = reconcileJournal(payload(), undefined, 'phone').pending[0]
    const first = await server.push(operation)
    expect(await server.push(operation)).toEqual(first)
    expect((await server.pull(0)).cursor).toBe(1)
    await expect(server.push({ ...operation, value: { changed: true } })).rejects.toThrow('操作标识')
  })

  it('同一记录离线并发修改会保留冲突双方，不覆盖服务端版本', async () => {
    const server = new MemorySyncServer()
    const phoneData = payload()
    const desktopData = payload()
    phoneData.profile.name = '手机版本'
    desktopData.profile.name = '电脑版本'
    const phone = reconcileJournal(phoneData, undefined, 'phone')
    const desktop = reconcileJournal(desktopData, undefined, 'desktop')
    await server.push(phone.pending[0])
    const operation = desktop.pending[0]
    const result = await server.push(operation)
    expect(result.status).toBe('conflict')
    const conflicted = applyPushResult(desktop, operation, result)
    expect(conflicted.pending).toEqual(desktop.pending)
    expect(conflicted.conflicts[0].remote.value).toMatchObject({ name: '手机版本' })
    expect(conflicted.conflicts[0].operation.value).toMatchObject({ name: '电脑版本' })
    expect((await server.pull(0)).cursor).toBe(1)
  })

  it('旧操作回执不会清除上传期间的新修改', async () => {
    const server = new MemorySyncServer()
    const data = payload()
    const before = reconcileJournal(data, undefined, 'phone')
    const sent = before.pending[0]
    const receipt = await server.push(sent)
    data.profile.name = '上传期间又修改'
    const edited = reconcileJournal(data, before, 'phone')
    const next = applyPushResult(edited, sent, receipt)
    const operation = next.pending.find(operation => operation.kind === 'profile')!
    expect(operation.value).toMatchObject({ name: '上传期间又修改' })
    expect(operation.baseRevision).toBe(1)
    expect(operation.operationId).not.toBe(sent.operationId)
    expect(applyPushResult(next, sent, receipt)).toEqual(next)
    expect((await server.push(operation)).record.revision).toBe(2)
  })

  it('删除传播后，长期离线设备不能用旧版本复活记录', async () => {
    const server = new MemorySyncServer()
    const data = payload()
    const before = reconcileJournal(data, undefined, 'phone')
    const original = before.pending.find(operation => operation.kind === 'tasks')!
    const accepted = applyPushResult(before, original, await server.push(original))
    data.tasks = []
    const removed = reconcileJournal(data, accepted, 'phone')
    const deletion = removed.pending.find(operation => operation.kind === 'tasks')!
    expect((await server.push(deletion)).record.deleted).toBe(true)
    const stale = { ...original, operationId: crypto.randomUUID(), deviceId: 'stale-device', baseRevision: 1 }
    const result = await server.push(stale)
    expect(result.status).toBe('conflict')
    expect(result.record.deleted).toBe(true)
  })

  it('拒绝错误回执，不修改本地版本', () => {
    const journal = reconcileJournal(payload(), undefined, 'phone')
    const operation = journal.pending[0]
    expect(() => applyPushResult(journal, operation, { status: 'accepted', operationId: 'wrong', record: { entity: operation.entity, revision: 1, deleted: false, value: {} } })).toThrow('回执不匹配')
    expect(journal.records[operation.entity].revision).toBe(0)
  })
})
