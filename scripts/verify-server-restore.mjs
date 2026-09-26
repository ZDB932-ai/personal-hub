import { mkdirSync, cpSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { createSyncServer } from '../server/sync-server.ts'

const dir = resolve('.visual-qa', `server-restore-${Date.now()}`)
const original = join(dir, 'original'), backup = join(dir, 'backup'), restored = join(dir, 'restored')
mkdirSync(original, { recursive: true })
const token = randomBytes(32).toString('base64url')
writeFileSync(join(original, 'access.local.json'), JSON.stringify({ account: 'qa', token }))
const space = { vaultId: 'restore-qa-vault', keyId: 'restore-qa-key' }
let service, url
async function start(path) {
  service = createSyncServer(join(path, 'sync.sqlite'))
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${service.server.address().port}`
}
async function stop() {
  if (!service) return
  await new Promise(resolve => service.server.close(resolve))
  service.close(); service = undefined
}
async function request(path, body = {}, expected = 200, access = token) {
  const response = await fetch(`${url}/v1/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` }, body: JSON.stringify({ space, ...body }) })
  assert.equal(response.status, expected)
  return response.json()
}
try {
  await start(original)
  service.provision('qa', token)
  const identity = await request('connect')
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const iv = randomBytes(12)
  const sealed = { ivB64: iv.toString('base64'), ctB64: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, Buffer.from('QA恢复资料'))).toString('base64') }
  const wire = { protocolVersion: 2, ...space, operationId: 'restore-op-1', deviceId: 'restore-device', entity: JSON.stringify(['memos', 'qa']), baseRevision: 0, deleted: false, sealed }
  const receipt = await request('push', { wire })
  const chunk = Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: randomBytes(12) }, key, randomBytes(500000)))
  const hash = createHash('sha256').update(chunk).digest('hex')
  await request('blobs/put', { hash, data: chunk.toString('base64') })
  const before = await request('pull', { cursor: 0 })
  await stop()
  cpSync(original, backup, { recursive: true, errorOnExist: true, force: false })
  cpSync(backup, restored, { recursive: true, errorOnExist: true, force: false })
  await start(restored)
  assert.deepEqual(await request('connect'), identity)
  assert.deepEqual(await request('pull', { cursor: 0 }), before)
  assert.deepEqual(await request('push', { wire }), receipt)
  assert.deepEqual(await request('pull', { cursor: before.cursor }), { cursor: before.cursor, hasMore: false, records: [] })
  assert.deepEqual(Buffer.from((await request('blobs/get', { hash })).data, 'base64'), chunk)
  await request('connect', {}, 401, randomBytes(32).toString('base64url'))
  await request('pull', { cursor: before.cursor + 1 }, 409)
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ passed: true, checks: ['停止服务后复制完整目录并恢复到新目录', 'serverId 与账号鉴权保留', '记录密文、游标及附件密文一致', '重复操作返回相同回执且不新增游标', '错误令牌与超前游标被拒绝'] }, null, 2))
  console.log(`PASS: 服务端离线备份恢复，身份、记录、附件、游标、回执一致；${dir}`)
} finally { await stop() }
