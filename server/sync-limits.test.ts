import { expect, it } from 'vitest'
import { createSyncServer } from './sync-server'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'

it('限制请求突发并返回可重试响应', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'phub-limits-'))
  const service = createSyncServer(join(dir, 'sync.sqlite'), { requestBurst: 1, requestsPerSecond: 1 })
  try {
    await new Promise<void>(resolve => service.server.listen(0, '127.0.0.1', resolve))
    const port = (service.server.address() as { port: number }).port
    const first = await fetch(`http://127.0.0.1:${port}/v1/connect`, { method: 'POST' })
    expect(first.status).toBe(401)
    await first.text()
    const second = await fetch(`http://127.0.0.1:${port}/v1/connect`, { method: 'POST' })
    expect(second.status).toBe(429)
    expect(second.headers.get('retry-after')).toBe('1')
    await second.text()
  } finally {
    await new Promise<void>(resolve => service.server.close(() => resolve()))
    service.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

it('服务重启后仍拒绝超容量写入且保留可用数据库', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'phub-capacity-'))
  const path = join(dir, 'sync.sqlite')
  const token = randomBytes(32).toString('base64url')
  const space = { vaultId: 'quota-vault', keyId: 'quota-key' }
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
    const service = createSyncServer(path, { maxDatabaseBytes: 128 * 1024 })
    service.provision('quota', token)
    try {
      await new Promise<void>(resolve => service.server.listen(0, '127.0.0.1', resolve))
      const port = (service.server.address() as { port: number }).port
      const request = async (route: string, extra = {}) => {
        const res = await fetch(`http://127.0.0.1:${port}/v1/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ space, ...extra }) })
        await res.text()
        return res.status
      }
      expect(await request('connect')).toBe(200)
      const data = randomBytes(262144)
      const hash = createHash('sha256').update(data).digest('hex')
      expect(await request('blobs/put', { hash, data: data.toString('base64') })).toBe(500)
      expect(await request('blobs/get', { hash })).toBe(404)
      expect(await request('pull', { cursor: 0 })).toBe(200)
    } finally {
      await new Promise<void>(resolve => service.server.close(() => resolve()))
      service.close()
    }
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
