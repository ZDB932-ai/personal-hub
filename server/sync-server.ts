import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { cloudAccounts } from './cloud-accounts.ts'
import type { ScopedOperation, SyncSpace } from '../src/lib/recordSyncWire.ts'

const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }) }
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)

function spaceOf(value: unknown): SyncSpace {
  const space = value as SyncSpace
  if (!space || !identifier(space.vaultId) || !identifier(space.keyId)) fail(400, '数据空间格式无效')
  return { vaultId: space.vaultId, keyId: space.keyId }
}

function wireOf(value: unknown): ScopedOperation {
  const w = value as ScopedOperation
  spaceOf(w)
  if (w.protocolVersion !== 2 || !identifier(w.operationId) || !identifier(w.deviceId) ||
    typeof w.entity !== 'string' || w.entity.length > 1024 || !Number.isSafeInteger(w.baseRevision) ||
    w.baseRevision < 0 || w.baseRevision >= Number.MAX_SAFE_INTEGER || typeof w.deleted !== 'boolean' ||
    !w.sealed || typeof w.sealed.ivB64 !== 'string' || !/^[A-Za-z0-9+/]{16}$/.test(w.sealed.ivB64) ||
    typeof w.sealed.ctB64 !== 'string' || w.sealed.ctB64.length < 24 || w.sealed.ctB64.length > 1500000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(w.sealed.ctB64)) fail(400, '密文请求格式无效')
  try { const entity = JSON.parse(w.entity); if (!Array.isArray(entity) || entity.length !== 2 || entity.some(v => typeof v !== 'string' || !v)) fail(400, '记录标识无效') } catch { fail(400, '记录标识无效') }
  return { protocolVersion: 2, ...spaceOf(w), operationId: w.operationId, deviceId: w.deviceId, entity: w.entity,
    baseRevision: w.baseRevision, deleted: w.deleted, sealed: { ivB64: w.sealed.ivB64, ctB64: w.sealed.ctB64 } }
}

export function createSyncServer(path: string, options: { origins?: string[]; pageSize?: number; requestsPerSecond?: number; requestBurst?: number; maxConcurrentRequests?: number; maxDatabaseBytes?: number } = {}) {
  const db = new DatabaseSync(path)
  const pageBytes = Number(db.prepare('PRAGMA page_size').get()!.page_size)
  const maxPages = Math.max(32, Math.floor((options.maxDatabaseBytes ?? 2 * 1024 ** 3) / pageBytes))
  db.exec(`PRAGMA max_page_count=${maxPages}`)
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS meta (id TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS blobs (vault TEXT, hash TEXT, data BLOB NOT NULL, PRIMARY KEY(vault, hash));
    CREATE TABLE IF NOT EXISTS vaults (vault TEXT PRIMARY KEY, owner TEXT NOT NULL, keyid TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS records (vault TEXT, entity TEXT, record TEXT NOT NULL, PRIMARY KEY(vault, entity));
    CREATE TABLE IF NOT EXISTS changes (vault TEXT, cursor INTEGER, record TEXT NOT NULL, PRIMARY KEY(vault, cursor));
    CREATE TABLE IF NOT EXISTS receipts (vault TEXT, device TEXT, operation TEXT, request TEXT NOT NULL, receipt TEXT NOT NULL, PRIMARY KEY(vault, device, operation));`)
  db.prepare('INSERT OR IGNORE INTO meta VALUES (?, ?)').run('serverId', randomUUID())
  const cloud = cloudAccounts(db)
  const serverId = (db.prepare('SELECT value FROM meta WHERE id = ?').get('serverId') as { value: string }).value
  const origins = new Set(options.origins ?? ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost', 'https://localhost', 'http://tauri.localhost', 'tauri://localhost'])
  const pageSize = Math.max(1, Math.min(100, options.pageSize ?? 20))
  const rate = Math.max(1, options.requestsPerSecond ?? 60)
  const burst = Math.max(1, options.requestBurst ?? 120)
  const concurrency = Math.max(1, options.maxConcurrentRequests ?? 16)
  let available = burst, lastRequest = performance.now(), active = 0
  function transaction<T>(fn: () => T): T {
    db.exec('BEGIN IMMEDIATE')
    try { const result = fn(); db.exec('COMMIT'); return result } catch (error) { db.exec('ROLLBACK'); throw error }
  }
  function authorize(owner: string, space: SyncSpace) {
    const vault = db.prepare('SELECT owner, keyid FROM vaults WHERE vault = ?').get(space.vaultId)
    if (!vault || vault.owner !== owner || vault.keyid !== space.keyId) fail(403, '无权访问此数据空间')
  }
  const server = createServer(async (req, res) => {
    const send = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
    const now = performance.now()
    available = Math.min(burst, available + (now - lastRequest) * rate / 1000)
    lastRequest = now
    if (available < 1 || active >= concurrency) {
      res.setHeader('Retry-After', '1')
      res.setHeader('Connection', 'close')
      res.once('finish', () => req.destroy())
      send(429, { error: '同步请求繁忙，请稍后重试' })
      return
    }
    available -= 1
    active += 1
    try {
      if (req.headers.origin) {
        if (!origins.has(req.headers.origin)) fail(403, '来源未获允许')
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
        res.setHeader('Vary', 'Origin')
      }
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        res.writeHead(204); res.end(); return
      }
      const accountRoute = ['/v1/account/register', '/v1/account/login', '/v1/account/change', '/v1/account/reset', '/v1/account/recovery/get', '/v1/account/recovery/set'].includes(req.url ?? '')
      if (req.method !== 'POST' || (!accountRoute && !['/v1/connect', '/v1/push', '/v1/pull', '/v1/blobs/missing', '/v1/blobs/put', '/v1/blobs/get'].includes(req.url ?? ''))) fail(404, '接口不存在')
      const token = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1]
      const account = token ? db.prepare('SELECT id FROM accounts WHERE token = ?').get(digest(token)) ?? cloud.owner(token) : undefined
      if (!accountRoute && !account) fail(401, '访问令牌无效')
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') fail(415, '需要 JSON 请求')
      let size = 0
      const chunks: Buffer[] = []
      for await (const chunk of req) { size += chunk.length; if (size > 1600000) fail(413, '请求过大'); chunks.push(chunk) }
      let body: Record<string, unknown> = {}
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { fail(400, 'JSON 无效') }
      if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'JSON 对象无效')
      if (accountRoute) { send(200, cloud.handle(req.url!, body)); return }
      if (!token || !(db.prepare('SELECT id FROM accounts WHERE token=?').get(digest(token)) ?? cloud.owner(token))) fail(401, '访问令牌已失效')
      const space = spaceOf(body.space)
      const owner = String(account!.id)
      if (req.url === '/v1/connect') {
        transaction(() => {
          if (!db.prepare('SELECT 1 FROM cloud_accounts WHERE owner=?').get(owner)) db.prepare('INSERT OR IGNORE INTO vaults VALUES (?, ?, ?)').run(space.vaultId, owner, space.keyId)
          authorize(owner, space)
        })
        send(200, { protocolVersion: 2, attachments: true, serverId: `${serverId}:${owner}`, ...space }); return
      }
      authorize(owner, space)
      if (req.url?.startsWith('/v1/blobs/')) {
        const validHash = (hash: unknown): hash is string => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)
        if (req.url === '/v1/blobs/missing') {
          if (!Array.isArray(body.hashes) || body.hashes.length > 51 || !body.hashes.every(validHash)) fail(400, '分块列表无效')
          const hashes = body.hashes as string[]
          send(200, { missing: hashes.filter(hash => !db.prepare('SELECT 1 FROM blobs WHERE vault=? AND hash=?').get(space.vaultId, hash)) }); return
        }
        if (!validHash(body.hash)) fail(400, '分块摘要无效')
        const hash = String(body.hash)
        if (req.url === '/v1/blobs/get') {
          const row = db.prepare('SELECT data FROM blobs WHERE vault=? AND hash=?').get(space.vaultId, hash)
          if (!row) fail(404, '附件分块尚未上传')
          send(200, { data: Buffer.from(row!.data as Uint8Array).toString('base64') }); return
        }
        if (typeof body.data !== 'string' || body.data.length > 1398104 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data)) fail(400, '分块内容无效')
        const data = Buffer.from(String(body.data), 'base64')
        if (!data.length || data.length > 1048576 || data.toString('base64') !== body.data || createHash('sha256').update(data).digest('hex') !== hash) fail(400, '分块校验失败')
        transaction(() => {
          if (db.prepare('SELECT 1 FROM blobs WHERE vault=? AND hash=?').get(space.vaultId, hash)) return
          const used = Number(db.prepare('SELECT COALESCE(SUM(length(data)),0) AS used FROM blobs WHERE vault=?').get(space.vaultId)!.used)
          if (used + data.length > 1024 * 1024 * 1024) fail(413, '保险库附件超过 1GB 配额')
          db.prepare('INSERT INTO blobs VALUES (?, ?, ?)').run(space.vaultId, hash, data)
        })
        send(200, { ok: true }); return
      }
      if (req.url === '/v1/push') {
        const wire = wireOf(body.wire)
        if (wire.vaultId !== space.vaultId || wire.keyId !== space.keyId) fail(400, '请求空间不一致')
        const request = JSON.stringify(wire)
        const receipt = transaction(() => {
          const old = db.prepare('SELECT request, receipt FROM receipts WHERE vault=? AND device=? AND operation=?').get(space.vaultId, wire.deviceId, wire.operationId)
          if (old) { if (old.request !== request) fail(409, '操作标识已用于其他请求'); return JSON.parse(String(old.receipt)) }
          const previous = db.prepare('SELECT record FROM records WHERE vault=? AND entity=?').get(space.vaultId, wire.entity)
          const current = previous ? JSON.parse(String(previous.record)) : null
          let result
          if ((current?.revision ?? 0) !== wire.baseRevision) result = { operationId: wire.operationId, status: 'conflict', record: current }
          else {
            const record = { revision: wire.baseRevision + 1, wire }
            const serialized = JSON.stringify(record)
            db.prepare('INSERT INTO records VALUES (?, ?, ?) ON CONFLICT(vault,entity) DO UPDATE SET record=excluded.record').run(space.vaultId, wire.entity, serialized)
            const cursor = Number(db.prepare('SELECT COALESCE(MAX(cursor),0) AS cursor FROM changes WHERE vault=?').get(space.vaultId)!.cursor) + 1
            db.prepare('INSERT INTO changes VALUES (?, ?, ?)').run(space.vaultId, cursor, serialized)
            result = { operationId: wire.operationId, status: 'accepted', record }
          }
          db.prepare('INSERT INTO receipts VALUES (?, ?, ?, ?, ?)').run(space.vaultId, wire.deviceId, wire.operationId, request, JSON.stringify(result))
          return result
        })
        send(200, receipt); return
      }
      const cursor = body.cursor
      if (!Number.isSafeInteger(cursor) || Number(cursor) < 0) fail(400, '游标无效')
      const last = Number(db.prepare('SELECT COALESCE(MAX(cursor),0) AS cursor FROM changes WHERE vault=?').get(space.vaultId)!.cursor)
      if (Number(cursor) > last) fail(409, '服务端历史早于本机游标，请恢复服务器备份')
      const rows = db.prepare('SELECT record FROM changes WHERE vault=? AND cursor>? ORDER BY cursor LIMIT ?').all(space.vaultId, Number(cursor), pageSize)
      const next = Number(cursor) + rows.length
      send(200, { cursor: next, hasMore: next < last, records: rows.map(row => JSON.parse(String(row.record))) })
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500
      send(status, { error: status === 500 ? '服务器存储失败' : (error as Error).message })
    } finally {
      active -= 1
    }
  })
  server.maxConnections = 128
  server.requestTimeout = 15000
  server.headersTimeout = 10000
  server.maxRequestsPerSocket = 100
  return {
    server,
    provision(account: string, token: string) {
      if (!identifier(account) || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new Error('账号或令牌格式无效')
      db.prepare('INSERT INTO accounts VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET token=excluded.token').run(account, digest(token))
    },
    close() { db.close() },
  }
}
