import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const base = 'https://111.91.19.235'
const { token } = JSON.parse(readFileSync('.sync-data/cloud-111.91.19.235/access.local.json', 'utf8'))
const space = { vaultId: `cloud-api-${randomUUID()}`, keyId: randomUUID() }
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: base }
const request = async (route, extra = {}) => {
  const response = await fetch(`${base}/v1/${route}`, { method: 'POST', headers, body: JSON.stringify({ space, ...extra }), signal: AbortSignal.timeout(45000) })
  const body = await response.json()
  assert.equal(response.status, 200, `${route}: ${response.status} ${body.error ?? ''}`)
  return body
}
await request('connect')
writeFileSync('.visual-qa/cloud-deploy-20261022/api-vault.json', JSON.stringify(space))
const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
const iv = randomBytes(12)
const plain = randomBytes(1048560)
const blob = Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain))
const hash = createHash('sha256').update(blob).digest('hex')
await request('blobs/put', { hash, data: blob.toString('base64') })
assert.deepEqual(await request('blobs/missing', { hashes: [hash] }), { missing: [] })
const received = await request('blobs/get', { hash })
assert.deepEqual(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, Buffer.from(received.data, 'base64'))), plain)
const wire = { protocolVersion: 2, ...space, operationId: randomUUID(), deviceId: 'cloud-api-qa', entity: '["memos","synthetic"]', baseRevision: 0, deleted: false, sealed: { ivB64: iv.toString('base64'), ctB64: blob.toString('base64') } }
const receipt = await request('push', { wire })
assert.equal(receipt.status, 'accepted')
assert.deepEqual(await request('push', { wire }), receipt)
const pull = await request('pull', { cursor: 0 })
assert.equal(pull.records.length, 1)
assert.deepEqual(pull.records[0].wire, wire)
console.log('PASS: public HTTPS 1 MiB encrypted attachment roundtrip, record push/pull and idempotent retry')
