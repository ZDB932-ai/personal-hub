import { afterEach, expect, it, vi } from 'vitest'
vi.hoisted(() => { Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null }, configurable: true }) })
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSyncServer } from './sync-server'
import { authenticateCloud, cloudProof, changeCloudPassword, enableCloudRecovery, resetCloudPassword, recoveryProof, cloudRequest } from '../src/lib/cloudAccount'
import { encryptJSON, decryptJSON } from '../src/lib/crypto'
import { generateRecoveryCode } from '../src/lib/vaultKeys'
import { connectRecordHttp } from '../src/lib/recordSyncHttp'
import { sealScopedOperation, openRecord } from '../src/lib/recordSyncWire'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })

it('同账号新设备恢复密钥，错误密码和跨账号访问被拒绝，重启保留登录', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'phub-account-'))
  cleanup.push(async () => rmSync(dir, { recursive: true, force: true }))
  let server: ReturnType<typeof createSyncServer>
  let url: string
  async function start() {
    server = createSyncServer(join(dir, 'sync.sqlite'))
    await new Promise<void>(resolve => server.server.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(server.server.address() as { port: number }).port}`
  }
  async function stop() { await new Promise<void>(resolve => server.server.close(() => resolve())); server.close() }
  await start(); cleanup.push(stop)
  const password = 'test-only-strong-password'
  const a = await authenticateCloud('Alice', password, true, url!)
  const b = await authenticateCloud('alice', password, false, url!)
  const sealed = await encryptJSON(a.key, { secret: 'device A' })
  expect(await decryptJSON(b.key, sealed.ivB64, sealed.ctB64)).toEqual({ secret: 'device A' })
  expect(a.bootstrap.vaultId).toBe(b.bootstrap.vaultId)
  expect(a.token).not.toBe(b.token)
  await expect(authenticateCloud('alice', 'wrong-password', false, url!)).rejects.toThrow('账号或密码不正确')
  await expect(authenticateCloud('alice', password, true, url!)).rejects.toThrow('已注册')
  const other = await authenticateCloud('bob', password, true, url!)
  const connect = (token: string, vaultId = a.bootstrap.vaultId) => fetch(`${url}/v1/connect`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ space: { vaultId, keyId: a.bootstrap.keyId } }) })
  expect((await connect(other.token)).status).toBe(403)
  expect((await connect(a.token, crypto.randomUUID())).status).toBe(403)
  expect((await connect(a.token)).status).toBe(200)
  await stop(); await start()
  expect((await connect(a.token)).status).toBe(200)
  expect((await connect(b.token)).status).toBe(200)
  expect(await cloudProof('ALICE', password)).toBe(await cloudProof('alice', password))
}, 30000)

it('云改密和恢复保留记录，撤销旧会话，轮换恢复密钥并拒绝并发过期更新', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'phub-recovery-'))
  cleanup.push(async () => rmSync(dir, { recursive: true, force: true }))
  const instance = createSyncServer(join(dir, 'sync.sqlite'))
  await new Promise<void>(resolve => instance.server.listen(0, '127.0.0.1', resolve))
  cleanup.push(async () => { await new Promise<void>(resolve => instance.server.close(() => resolve())); instance.close() })
  const url = `http://127.0.0.1:${(instance.server.address() as { port: number }).port}`
  const name = 'recoverable', old = 'old-password-2026', next = 'new-password-2026', reset = 'reset-password-2026'
  const initial = await authenticateCloud(name, old, true, url)
  const space = { vaultId: initial.bootstrap.vaultId, keyId: initial.bootstrap.keyId }
  const before = await connectRecordHttp(url, initial.token, space)
  const wire = await sealScopedOperation(initial.key, space, { operationId: crypto.randomUUID(), deviceId: 'a', entity: '["profile","singleton"]', kind: 'profile', id: 'singleton', baseRevision: 0, deleted: false, value: { name: 'preserved-secret' } })
  await before.push(space, wire)
  const code = generateRecoveryCode()
  await enableCloudRecovery(name, old, code, () => true, url)
  await expect(cloudRequest('change', { name, proof: await cloudProof(name, old), revision: initial.revision, nextProof: await cloudProof(name, next), bootstrap: initial.bootstrap }, url)).rejects.toThrow('另一设备更新')
  const changed = await changeCloudPassword(name, old, next, () => true, url)
  await expect(before.pull(space, 0)).rejects.toThrow('令牌已失效')
  await expect(authenticateCloud(name, old, false, url)).rejects.toThrow('账号或密码不正确')
  const after = await connectRecordHttp(url, changed.token, space)
  const page = await after.pull(space, 0)
  expect((await openRecord(changed.key, space, page.records[0]!)).value).toEqual({ name: 'preserved-secret' })
  await expect(resetCloudPassword(name, generateRecoveryCode(), reset, () => true, url)).rejects.toThrow('云恢复密钥不正确')
  const restored = await resetCloudPassword(name, code, reset, () => true, url)
  expect(restored.bootstrap.vaultId).toBe(initial.bootstrap.vaultId)
  await expect(after.pull(space, 0)).rejects.toThrow('令牌已失效')
  expect((await openRecord(restored.key, space, page.records[0]!)).value).toEqual({ name: 'preserved-secret' })
  const rotated = generateRecoveryCode()
  await enableCloudRecovery(name, reset, rotated, () => true, url)
  await expect(cloudRequest('recovery/get', { name, proof: await recoveryProof(name, code) }, url)).rejects.toThrow('云恢复密钥不正确')
  const final = await resetCloudPassword(name, rotated, old, () => true, url)
  const finalTransport = await connectRecordHttp(url, final.token, space)
  expect((await finalTransport.pull(space, 0)).records).toHaveLength(1)
  await expect(cloudRequest('change', { name, proof: await cloudProof(name, old), revision: final.revision, nextProof: await cloudProof(name, next), bootstrap: { ...final.bootstrap, vaultId: crypto.randomUUID() } }, url)).rejects.toThrow('不得改变')
}, 30000)
