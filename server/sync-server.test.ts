import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createSyncServer } from './sync-server'
import { connectRecordHttp, syncServerUrl } from '../src/lib/recordSyncHttp'
import { sealScopedOperation } from '../src/lib/recordSyncWire'
import { RecordSyncEngine } from '../src/lib/recordSyncEngine'
import { RehearsalStorage, rehearsalPayload } from '../src/lib/syncRehearsal'
import { resolveConflict } from '../src/lib/syncMerge'
import { uploadAttachment, downloadAttachment, CHUNK_SIZE } from '../src/lib/attachmentSync'
import { encryptBytes, decryptBytes } from '../src/lib/crypto'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'phub-http-'))
  cleanups.push(async () => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, 'sync.sqlite')
  const token = randomBytes(32).toString('base64url')
  const other = randomBytes(32).toString('base64url')
  const space = { vaultId: crypto.randomUUID(), keyId: crypto.randomUUID() }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  let instance: ReturnType<typeof createSyncServer>
  let url = ''
  async function start() {
    instance = createSyncServer(path, { pageSize: 1 })
    instance.provision('alice', token); instance.provision('bob', other)
    await new Promise<void>(resolve => instance.server.listen(0, '127.0.0.1', resolve))
    const address = instance.server.address() as { port: number }
    url = `http://127.0.0.1:${address.port}`
  }
  async function stop() { await new Promise<void>(resolve => instance.server.close(() => resolve())); instance.close() }
  await start()
  cleanups.push(stop)
  const transport = await connectRecordHttp(url, token, space)
  const request = (route: string, body: unknown, auth = token, origin?: string) => fetch(`${url}/v1/${route}`, { method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) })
  const wire = () => sealScopedOperation(key, space, { operationId: crypto.randomUUID(), deviceId: 'a', entity: '["profile","singleton"]', kind: 'profile', id: 'singleton', baseRevision: 0, deleted: false, value: { name: 'plaintext-must-not-reach-server' } })
  return { path, token, other, space, key, transport, request, wire, restart: async () => { await stop(); await start(); return connectRecordHttp(url, token, space) } }
}

describe('真实 HTTP 与 SQLite 同步', () => {
  it('附件分块真实传输、重启保留、重试跳过分块、跨账号拒绝', async () => {
    const f = await setup()
    const plain = new Uint8Array(CHUNK_SIZE + 87); plain.fill(123)
    const encrypted = await encryptBytes(f.key, plain.buffer)
    const descriptor = await uploadAttachment(f.transport.attachments!, encrypted, () => {})
    expect(descriptor.chunks).toHaveLength(2)
    expect(await f.transport.attachments!.missing(descriptor.chunks)).toEqual([])
    const resumed = await f.restart()
    const downloaded = await downloadAttachment(resumed.attachments!, descriptor, f.key, plain.length, () => {})
    expect(new Uint8Array(await decryptBytes(f.key, downloaded.ivB64, downloaded.ct))).toEqual(plain)
    expect((await f.request('blobs/get', { space: f.space, hash: descriptor.chunks[0] }, f.other)).status).toBe(403)
    expect((await f.request('blobs/put', { space: f.space, hash: descriptor.chunks[0], data: 'aGVsbG8=' })).status).toBe(400)
    expect(await uploadAttachment(resumed.attachments!, encrypted, () => {})).toEqual(descriptor)
  }, 15000)
  it('双设备合并、冲突选择和删除通过实际 HTTP 传输', async () => {
    const { space, key, transport } = await setup()
    const a = new RehearsalStorage({}, key, 'a'), b = new RehearsalStorage({}, key, 'b')
    await a.initialize(rehearsalPayload()); await b.initialize(rehearsalPayload())
    const ea = new RecordSyncEngine(a, transport, space, key), eb = new RecordSyncEngine(b, transport, space, key)
    expect((await ea.run()).status).toBe('complete'); expect((await eb.run()).status).toBe('complete')
    await a.update(p => { p.profile.name = 'A' })
    await b.update(p => { p.memos = [{ id: 'memo', title: 'B', content: '双端内容', color: 'blue', pinned: false, createdAt: 1, updatedAt: 1 }] })
    await ea.run(); await eb.run(); await ea.run()
    expect((await a.read()).memos).toEqual((await b.read()).memos)
    expect((await b.read()).profile.name).toBe('A')
    await a.update(p => { p.profile.name = 'AA' }); await b.update(p => { p.profile.name = 'BB' })
    await ea.run(); expect((await eb.run()).conflicts).toBe(1)
    await b.update(p => { const c = p.offlineJournal!.conflicts[0]; resolveConflict(p, c.remote.entity, c.remote.revision, c.operation.operationId, 'remote') })
    expect((await eb.run()).status).toBe('complete')
    expect((await b.read()).profile.name).toBe('AA')
    await a.update(p => { p.memos = [] }); await ea.run(); await eb.run()
    expect((await b.read()).memos).toEqual([])
  })

  it('重启后保留 serverId、密文、幂等回执与游标', async () => {
    const f = await setup()
    const wire = await f.wire()
    const receipt = await f.transport.push(f.space, wire)
    const resumed = await f.restart()
    expect(resumed.serverId).toBe(f.transport.serverId)
    expect(await resumed.push(f.space, wire)).toEqual(receipt)
    expect(await resumed.pull(f.space, 0)).toMatchObject({ cursor: 1, hasMore: false })
    expect(readFileSync(f.path).includes(Buffer.from('plaintext-must-not-reach-server'))).toBe(false)
    expect(readFileSync(f.path).includes(Buffer.from(f.token))).toBe(false)
  })

  it('同版本并发只有一个成功，变更分页连续且幂等重试不增游标', async () => {
    const f = await setup()
    const a = await f.wire(), b = await f.wire()
    const receipts = await Promise.all([f.transport.push(f.space, a), f.transport.push(f.space, b)])
    expect(receipts.map(r => r.status).sort()).toEqual(['accepted', 'conflict'])
    expect((await f.transport.pull(f.space, 0)).cursor).toBe(1)
    expect(await f.transport.push(f.space, a)).toEqual(receipts[0])
    const mutated = { ...a, deleted: true }
    expect((await f.request('push', { space: f.space, wire: mutated })).status).toBe(409)
  })

  it('账号隔离、错误令牌、跨空间和跨来源请求均被拒绝', async () => {
    const f = await setup()
    expect((await f.request('connect', { space: f.space }, f.other)).status).toBe(403)
    expect((await f.request('pull', { space: f.space, cursor: 0 }, f.other)).status).toBe(403)
    expect((await f.request('pull', { space: f.space, cursor: 0 }, 'x'.repeat(43))).status).toBe(401)
    expect((await f.request('pull', { space: f.space, cursor: 0 }, f.token, 'https://untrusted.example')).status).toBe(403)
    const wire = await f.wire(); wire.keyId = crypto.randomUUID()
    expect((await f.request('push', { space: f.space, wire })).status).toBe(400)
    expect((await f.request('pull', { space: f.space, cursor: 99 })).status).toBe(409)
    expect((await f.request('pull', { space: f.space, cursor: -1 })).status).toBe(400)
  })

  it('拒绝无效密文，不写入变更；仅允许回环 HTTP 或 HTTPS 地址', async () => {
    const f = await setup()
    const wire = await f.wire(); wire.sealed.ivB64 = 'invalid'
    expect((await f.request('push', { space: f.space, wire })).status).toBe(400)
    expect((await f.transport.pull(f.space, 0)).cursor).toBe(0)
    expect(() => syncServerUrl('http://192.168.1.10:8787')).toThrow('HTTPS')
    expect(() => syncServerUrl('https://name:password@example.com')).toThrow()
    expect(syncServerUrl('https://sync.example.com')).toBe('https://sync.example.com')
  })
})
