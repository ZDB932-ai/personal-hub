import { describe, expect, it } from 'vitest'
import { mergeRemote } from '../syncMerge'
import { reconcileJournal } from '../offlineJournal'
import { entityKey } from '../syncProtocol'
import { rehearsalPayload } from '../syncRehearsal'
import { openRecord, sealScopedOperation } from '../recordSyncWire'

describe('合并边界与协议隔离', () => {
  it('远端内容更新保留提醒状态与本机附件路径，不回传设备字段', () => {
    const payload = rehearsalPayload()
    payload.tasks = [{ id: 'task', title: '旧任务', notes: '', date: '', time: '', priority: 2, repeat: 'none', done: false, createdAt: 1, updatedAt: 1, tags: [], subtasks: [], lastRemindedTs: 123 }]
    payload.docMetas = [{ id: 'doc', blobId: 'local-blob', name: '旧文件名', size: 3, mime: 'text/plain', category: '其他', tags: [], note: '', pinned: false, createdAt: 1 }]
    payload.offlineJournal = reconcileJournal(payload, undefined, 'device')
    payload.offlineJournal.pending = []
    mergeRemote(payload, { entity: entityKey('tasks', 'task'), revision: 1, deleted: false, value: { ...payload.tasks[0], title: '新任务' } })
    mergeRemote(payload, { entity: entityKey('docMetas', 'doc'), revision: 1, deleted: false, value: { ...payload.docMetas[0], name: '新文件名', blobId: 'remote-path' } })
    expect(payload.tasks[0].lastRemindedTs).toBe(123)
    expect(payload.docMetas[0].blobId).toBe('local-blob')
    const journal = reconcileJournal(payload, payload.offlineJournal, 'device')
    expect(journal.pending).toHaveLength(0)
    expect(JSON.stringify(journal.pending)).not.toContain('local-blob')
    expect(JSON.stringify(journal.pending)).not.toContain('lastRemindedTs')
  })

  it('未知集合或内容 ID 不匹配不写入业务状态', () => {
    const payload = rehearsalPayload()
    payload.offlineJournal = reconcileJournal(payload, undefined, 'device')
    const original = JSON.stringify(payload)
    expect(() => mergeRemote(payload, { entity: '["__proto__","x"]', revision: 1, deleted: false, value: {} })).toThrow('标识')
    expect(() => mergeRemote(payload, { entity: entityKey('memos', 'one'), revision: 1, deleted: false, value: { id: 'two' } })).toThrow('标识')
    expect(JSON.stringify(payload)).toBe(original)
  })

  it('同步请求只暴露协议所需字段，不携带设备密码封装或其他信封字段', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const space = { vaultId: 'vault', keyId: 'key', wrappedKey: { ctB64: 'must-not-leak' }, extra: 'private-header' }
    const operation = { operationId: 'op', deviceId: 'device', entity: entityKey('memos', 'memo'), kind: 'memos' as const, id: 'memo', baseRevision: 0, deleted: false, value: { id: 'memo', title: 'private-title' } }
    const wire = await sealScopedOperation(key, space, operation)
    expect(wire).not.toHaveProperty('wrappedKey')
    expect(wire).not.toHaveProperty('extra')
    expect(JSON.stringify(wire)).not.toContain('private-title')
    expect((await openRecord(key, space, { revision: 1, wire })).value).toEqual(operation.value)
    await expect(openRecord(key, space, { revision: 2, wire })).rejects.toThrow('版本')
  })
})
