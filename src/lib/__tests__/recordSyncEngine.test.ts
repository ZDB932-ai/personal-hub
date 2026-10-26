import { describe, expect, it, vi } from 'vitest'
import { RecordSyncEngine } from '../recordSyncEngine'
import { RehearsalServer, RehearsalStorage, rehearsalPayload, runSyncRehearsal } from '../syncRehearsal'
import { resolveConflict } from '../syncMerge'
import { canonicalJSON } from '../syncProtocol'
import type { RecordSyncTransport, ScopedOperation } from '../recordSyncWire'

async function setup() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const space = { vaultId: crypto.randomUUID(), keyId: crypto.randomUUID() }
  const server = new RehearsalServer(1)
  const diskA = {}, diskB = {}
  const a = new RehearsalStorage(diskA, key, 'a')
  const b = new RehearsalStorage(diskB, key, 'b')
  await a.initialize(rehearsalPayload())
  await b.initialize(rehearsalPayload())
  const engineA = new RecordSyncEngine(a, server, space, key)
  const engineB = new RecordSyncEngine(b, server, space, key)
  await engineA.run()
  await engineB.run()
  return { key, space, server, a, b, diskA, diskB, engineA, engineB }
}

describe('持久化逐条同步引擎', () => {
  it('后台提前上传的密文被前台复用，丢失回执重试仍为同一请求', async () => {
    const { a, key, space, server } = await setup()
    await a.update(payload => { payload.profile.name = '后台队列验证' })
    const operation = (await a.read()).offlineJournal!.pending[0]!
    const { sealScopedOperation } = await import('../recordSyncWire')
    const staged = await sealScopedOperation(key, space, operation)
    await server.push(space, staged)
    let sent: ScopedOperation | undefined
    const transport: RecordSyncTransport = {
      serverId: server.serverId,
      pull: async () => ({ cursor: (await a.read()).offlineJournal!.sync!.cursor, hasMore: false, records: [] }),
      prepare: async () => staged,
      push: async (target, wire) => { sent = wire; return server.push(target, wire) },
    }
    expect((await new RecordSyncEngine(a, transport, space, key).run()).status).toBe('complete')
    expect(sent).toEqual(staged)
    expect((await a.read()).offlineJournal!.pending).toHaveLength(0)
    expect((await a.read()).offlineJournal!.records[operation.entity]!.revision).toBe(staged.baseRevision + 1)
  })
  it('完整三设备演练覆盖不同记录、冲突、回执丢失、重启与删除', async () => {
    expect(await runSyncRehearsal()).toHaveLength(6)
  })

  it('在发送之前存储失败时不会发出请求', async () => {
    const { a, server, space, key } = await setup()
    await a.update(payload => { payload.profile.name = '新名字' })
    const push = vi.spyOn(server, 'push')
    const update = a.update.bind(a)
    vi.spyOn(a, 'update').mockImplementation(transform => update(payload => {
      transform(payload)
      if (payload.offlineJournal!.sync!.inFlight) throw new Error('模拟写盘失败')
    }))
    await expect(new RecordSyncEngine(a, server, space, key).run()).rejects.toThrow('写盘失败')
    expect(push).not.toHaveBeenCalled()
    expect((await a.read()).offlineJournal!.pending).toHaveLength(1)
  })

  it('重启后重发相同密文与操作 ID，回执丢失不产生重复版本', async () => {
    const { a, diskA, key, space, server } = await setup()
    await a.update(payload => { payload.profile.name = 'secret-name' })
    let request!: ScopedOperation
    const unreliable: RecordSyncTransport = {
      serverId: server.serverId, pull: server.pull.bind(server),
      async push(scope, wire) { request = structuredClone(wire); await server.push(scope, wire); throw new Error('offline') },
    }
    const first = await new RecordSyncEngine(a, unreliable, space, key, () => 100).run()
    expect(first).toMatchObject({ status: 'retry', retryAt: 1100 })
    expect(JSON.stringify(diskA)).not.toContain('secret-name')
    const restarted = new RehearsalStorage(diskA, key, 'a')
    const push = vi.spyOn(server, 'push')
    const engine = new RecordSyncEngine(restarted, server, space, key, () => 200)
    expect((await engine.run()).status).toBe('retry')
    expect(push).not.toHaveBeenCalled()
    expect((await engine.run(true)).status).toBe('complete')
    expect(push).toHaveBeenCalledTimes(1)
    expect(canonicalJSON(push.mock.calls[0][1])).toBe(canonicalJSON(request))
    expect((await restarted.read()).offlineJournal!.records[request.entity].revision).toBe(2)
  })

  it('回执落盘失败保留原在途请求，之后再次确认，不先发送后续版本', async () => {
    const { a, server, key, space, engineA } = await setup()
    await a.update(payload => { payload.profile.name = '待确认' })
    const original = a.update.bind(a)
    let fail = true
    vi.spyOn(a, 'update').mockImplementation(transform => original(payload => {
      const hadFlight = Boolean(payload.offlineJournal!.sync!.inFlight)
      transform(payload)
      if (hadFlight && !payload.offlineJournal!.sync!.inFlight && fail) { fail = false; throw new Error('回执写盘失败') }
    }))
    await expect(engineA.run()).rejects.toThrow('回执写盘失败')
    const inFlight = (await a.read()).offlineJournal!.sync!.inFlight!
    expect(inFlight).toBeDefined()
    await a.update(payload => { payload.profile.name = '确认之前再修改' })
    await new RecordSyncEngine(a, server, space, key).run()
    expect((await a.read()).profile.name).toBe('确认之前再修改')
    expect((await a.read()).offlineJournal!.records[inFlight.operation.entity].revision).toBe(3)
  })

  it('上传期间修改或删除不会被旧回执清空', async () => {
    const { a, server, space, key, engineB, b } = await setup()
    await a.update(payload => { payload.profile.name = '第一版' })
    let changed = false
    const transport: RecordSyncTransport = {
      serverId: server.serverId, pull: server.pull.bind(server),
      async push(scope, wire) {
        if (!changed) { changed = true; await a.update(payload => { payload.profile.name = '第二版' }) }
        return server.push(scope, wire)
      },
    }
    await new RecordSyncEngine(a, transport, space, key).run()
    expect((await a.read()).offlineJournal!.pending).toHaveLength(0)
    await engineB.run()
    expect((await b.read()).profile.name).toBe('第二版')
  })

  it.each(['local', 'remote'] as const)('同记录冲突保留双方，选择 %s 后收敛', async choice => {
    const { a, b, engineA, engineB } = await setup()
    await a.update(payload => { payload.profile.name = 'A修改' })
    await b.update(payload => { payload.profile.name = 'B修改' })
    await engineA.run()
    expect((await engineB.run()).conflicts).toBe(1)
    const before = await b.read()
    expect(before.profile.name).toBe('B修改')
    expect(before.offlineJournal!.conflicts[0].remote.value).toMatchObject({ name: 'A修改' })
    await b.update(payload => {
      const conflict = payload.offlineJournal!.conflicts[0]
      resolveConflict(payload, conflict.remote.entity, conflict.remote.revision, conflict.operation.operationId, choice)
    })
    await engineB.run()
    await engineA.run()
    expect((await a.read()).profile.name).toBe(choice === 'local' ? 'B修改' : 'A修改')
    expect((await b.read()).offlineJournal!.conflicts).toHaveLength(0)
  })

  it('用户查看冲突后再次修改时拒绝陈旧选择；新远端版本更新冲突', async () => {
    const { a, b, engineA, engineB } = await setup()
    await a.update(payload => { payload.profile.name = 'A1' })
    await b.update(payload => { payload.profile.name = 'B1' })
    await engineA.run(); await engineB.run()
    const conflict = (await b.read()).offlineJournal!.conflicts[0]
    await b.update(payload => { payload.profile.name = 'B2' })
    await expect(b.update(payload => resolveConflict(payload, conflict.remote.entity, conflict.remote.revision, conflict.operation.operationId, 'remote'))).rejects.toThrow('内容已变化')
    await a.update(payload => { payload.profile.name = 'A2' })
    await engineA.run(); await engineB.run()
    const latest = (await b.read()).offlineJournal!.conflicts[0]
    expect(latest.remote.revision).toBeGreaterThan(conflict.remote.revision)
    expect(latest.operation.value).toMatchObject({ name: 'B2' })
    expect(latest.remote.value).toMatchObject({ name: 'A2' })
  })

  it('拉取写盘失败不推进游标，重试再次应用同一分页', async () => {
    const { a, b, engineA, engineB } = await setup()
    const cursor = (await b.read()).offlineJournal!.sync!.cursor
    await a.update(payload => { payload.profile.name = '新远端' })
    await engineA.run()
    vi.spyOn(b, 'update').mockRejectedValueOnce(new Error('pull-commit-failed'))
    await expect(engineB.run()).rejects.toThrow('pull-commit-failed')
    expect((await b.read()).offlineJournal!.sync!.cursor).toBe(cursor)
    expect((await b.read()).profile.name).not.toBe('新远端')
    await engineB.run()
    expect((await b.read()).profile.name).toBe('新远端')
  })

  it('密文篡改或跨保险库数据不会推进游标或覆盖本地', async () => {
    const { a, b, key, space, server, engineA } = await setup()
    await a.update(payload => { payload.profile.name = '远端' }); await engineA.run()
    const cursor = (await b.read()).offlineJournal!.sync!.cursor
    const transport: RecordSyncTransport = {
      serverId: server.serverId, push: server.push.bind(server),
      async pull(scope, position) { const page = await server.pull(scope, position); page.records[0].wire.vaultId = 'another-vault'; return page },
    }
    await expect(new RecordSyncEngine(b, transport, space, key).run()).rejects.toThrow('数据空间')
    expect((await b.read()).offlineJournal!.sync!.cursor).toBe(cursor)
  })

  it('锁定发生在网络等待期间时保留在途操作，不落回执或填充明文', async () => {
    const { a, server, space, key } = await setup()
    await a.update(payload => { payload.profile.name = '待发送' })
    let active = true
    const transport: RecordSyncTransport = {
      serverId: server.serverId, pull: server.pull.bind(server),
      async push(scope, wire) { const receipt = await server.push(scope, wire); active = false; return receipt },
    }
    await expect(new RecordSyncEngine(a, transport, space, key, Date.now, () => active).run()).rejects.toThrow('锁定')
    expect((await a.read()).offlineJournal!.sync!.inFlight).toBeDefined()
    await new RecordSyncEngine(a, server, space, key).run()
    expect((await a.read()).offlineJournal!.pending).toHaveLength(0)
  })

  it('同一存储重复触发共享运行，服务身份改变不能复用游标', async () => {
    const { a, server, key, space } = await setup()
    const engine = new RecordSyncEngine(a, server, space, key)
    const first = engine.run()
    expect(engine.run()).toBe(first)
    await first
    const other: RecordSyncTransport = { serverId: 'another-server', push: server.push.bind(server), pull: server.pull.bind(server) }
    await expect(new RecordSyncEngine(a, other, space, key).run()).rejects.toThrow('不能复用')
  })

  it('删除与离线编辑发生冲突，接受删除后长期离线客户端不会自动复活记录', async () => {
    const { a, b, engineA, engineB } = await setup()
    await a.update(payload => { payload.memos = [{ id: 'memo', title: 'original', content: '', color: 'yellow', pinned: false, createdAt: 1, updatedAt: 1 }] })
    await engineA.run(); await engineB.run()
    await a.update(payload => { payload.memos = [] })
    await b.update(payload => { payload.memos![0].title = '离线编辑' })
    await engineA.run(); await engineB.run()
    const conflict = (await b.read()).offlineJournal!.conflicts[0]
    expect(conflict.remote.deleted).toBe(true)
    expect((await b.read()).memos![0].title).toBe('离线编辑')
    await b.update(payload => resolveConflict(payload, conflict.remote.entity, conflict.remote.revision, conflict.operation.operationId, 'remote'))
    await engineB.run(); await engineA.run()
    expect((await b.read()).memos).toEqual([])
    expect((await a.read()).memos).toEqual([])
    expect((await b.read()).offlineJournal!.pending).toEqual([])
  })

  it('拉取等待期间发生本机修改时按最新状态判断冲突', async () => {
    const { a, b, engineA, server, key, space } = await setup()
    await a.update(payload => { payload.profile.name = '远端变更' }); await engineA.run()
    let first = true
    const transport: RecordSyncTransport = {
      serverId: server.serverId, push: server.push.bind(server),
      async pull(scope, cursor) {
        const page = await server.pull(scope, cursor)
        if (first) { first = false; await b.update(payload => { payload.profile.name = '拉取期间新编辑' }) }
        return page
      },
    }
    expect((await new RecordSyncEngine(b, transport, space, key).run()).conflicts).toBe(1)
    expect((await b.read()).profile.name).toBe('拉取期间新编辑')
  })

  it('服务端回滚游标或返回不前进的分页时停止，不标记成功', async () => {
    const { b, server, key, space } = await setup()
    const transport: RecordSyncTransport = {
      serverId: server.serverId, push: server.push.bind(server),
      async pull(_scope, cursor) { return { cursor, hasMore: true, records: [] } },
    }
    await expect(new RecordSyncEngine(b, transport, space, key).run()).rejects.toThrow('分页游标')
  })
})
