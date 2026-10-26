import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { createSyncServer } from '../server/sync-server.ts'

const root = process.argv[2]
assert.ok(root?.startsWith('/opt/personal-hub/backups/restore-check-'))
const path = `${root}/data/sync.sqlite`
const { token } = JSON.parse(readFileSync(`${root}/data/access.local.json`, 'utf8'))
const db = new DatabaseSync(path)
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
const vaults = db.prepare('SELECT vault, keyid FROM vaults').all()
assert.ok(vaults.length > 0, 'Restore verification requires a populated synthetic vault')
const counts = {}
for (const table of ['records', 'changes', 'receipts', 'blobs']) counts[table] = Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n)
const serverId = db.prepare("SELECT value FROM meta WHERE id='serverId'").get().value
db.close()
const service = createSyncServer(path)
await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${service.server.address().port}`
try {
  for (const vault of vaults) {
    const space = { vaultId: vault.vault, keyId: vault.keyid }
    const request = async (route, body) => {
      const response = await fetch(`${base}/v1/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ space, ...body }) })
      assert.equal(response.status, 200)
      return response.json()
    }
    const identity = await request('connect', {})
    assert.ok(identity.serverId.startsWith(`${serverId}:`))
    const page = await request('pull', { cursor: 0 })
    assert.ok(page.cursor >= 0)
    const audit = new DatabaseSync(path, { readOnly: true })
    try {
      for (const blob of audit.prepare('SELECT hash FROM blobs WHERE vault=?').all(space.vaultId)) {
        const result = await request('blobs/get', { hash: blob.hash })
        assert.equal(createHash('sha256').update(Buffer.from(result.data, 'base64')).digest('hex'), blob.hash)
      }
      const receipt = audit.prepare('SELECT request, receipt FROM receipts WHERE vault=? LIMIT 1').get(space.vaultId)
      if (receipt) assert.deepEqual(await request('push', { wire: JSON.parse(receipt.request) }), JSON.parse(receipt.receipt))
    } finally { audit.close() }
  }
  console.log(JSON.stringify({ passed: true, restoredVaults: vaults.length, counts, checks: ['integrity', 'authentication', 'serverId', 'pull', 'blob hashes', 'idempotent receipt'] }))
} finally {
  await new Promise(resolve => service.server.close(resolve))
  service.close()
}
