import type { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const reject = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }) }

function validateBootstrap(value: unknown): Record<string, any> {
  const env = value as Record<string, any> | undefined
  const b64 = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max && /^[A-Za-z0-9+/]+={0,2}$/.test(v)
  const uuid = (v: unknown) => typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v)
  if (!env || env.v !== 3 || !uuid(env.vaultId) || !uuid(env.keyId) || !b64(env.ivB64, 16) || !b64(env.ctB64, 65536) ||
    !b64(env.wrappedKey?.ivB64, 16) || !b64(env.wrappedKey?.ctB64, 64) || env.kdf?.algo !== 'argon2id' ||
    !/^[a-f0-9]{32}$/.test(env.kdf?.saltHex ?? '') || env.kdf.memKiB !== 65536 || env.kdf.timeCost !== 3 || env.kdf.parallelism !== 4 ||
    !Number.isSafeInteger(env.ts) || JSON.stringify(env).length > 70000) reject(400, '加密账户信息无效')
  return env!
}

export function cloudAccounts(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS cloud_accounts (name TEXT PRIMARY KEY, owner TEXT UNIQUE NOT NULL, verifier TEXT NOT NULL, bootstrap TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cloud_sessions (token TEXT PRIMARY KEY, owner TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS cloud_security (name TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, verifier TEXT, recovery TEXT);
    INSERT OR IGNORE INTO cloud_security(name) SELECT name FROM cloud_accounts;`)
  let allowance = 20, last = Date.now()
  return {
    owner(token: string) { return db.prepare('SELECT owner AS id FROM cloud_sessions WHERE token=?').get(hash(token)) },
    handle(route: string, body: Record<string, unknown>) {
      const now = Date.now()
      allowance = Math.min(20, allowance + (now - last) / 6000); last = now
      if (allowance < 1) reject(429, '登录请求过多，请稍后重试')
      allowance--
      const name = body.name, proof = body.proof
      if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(name) || typeof proof !== 'string' || !/^[a-f0-9]{64}$/.test(proof)) reject(400, '账号或登录信息格式无效')
      if (route === '/v1/account/register') {
        const env = validateBootstrap(body.bootstrap)
        if (db.prepare('SELECT 1 FROM cloud_accounts WHERE name=?').get(String(name))) reject(409, '该账号已注册，请直接登录')
        if (Number(db.prepare('SELECT COUNT(*) AS n FROM cloud_accounts').get()!.n) >= 16) reject(403, '此私人服务器的账号名额已满')
        const owner = randomUUID()
        db.exec('BEGIN IMMEDIATE')
        try {
          db.prepare('INSERT INTO cloud_accounts VALUES (?, ?, ?, ?)').run(String(name), owner, hash(String(proof)), JSON.stringify(env))
          db.prepare('INSERT INTO vaults VALUES (?, ?, ?)').run(env!.vaultId, owner, env!.keyId)
          db.prepare('INSERT INTO cloud_security(name) VALUES (?)').run(String(name))
          db.exec('COMMIT')
        } catch (error) { db.exec('ROLLBACK'); throw error }
      }
      const row = db.prepare('SELECT a.*, s.revision, s.verifier AS recoveryVerifier, s.recovery FROM cloud_accounts a JOIN cloud_security s ON a.name=s.name WHERE a.name=?').get(String(name))
      const recovering = route === '/v1/account/recovery/get' || route === '/v1/account/reset'
      const expected = String((recovering ? row?.recoveryVerifier : row?.verifier) ?? '0'.repeat(64))
      if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(hash(String(proof)), 'hex')) || !row) reject(401, recovering ? '账号或云恢复密钥不正确，或尚未启用云恢复' : '账号或密码不正确')
      if (route === '/v1/account/recovery/get') return { bootstrap: JSON.parse(String(row!.bootstrap)), recovery: JSON.parse(String(row!.recovery)), revision: Number(row!.revision) }
      if (['/v1/account/change', '/v1/account/reset', '/v1/account/recovery/set'].includes(route)) {
        if (body.revision !== row!.revision) reject(409, '账号已在另一设备更新，请重新验证后操作')
        let bootstrap: Record<string, any> | undefined
        if (route === '/v1/account/recovery/set') {
          const recovery = body.recovery as Record<string, unknown> | undefined
          const original = JSON.parse(String(row!.bootstrap))
          if (typeof body.recoveryProof !== 'string' || !/^[a-f0-9]{64}$/.test(body.recoveryProof) || !recovery || recovery.v !== 1 ||
            recovery.vaultId !== original.vaultId || recovery.keyId !== original.keyId ||
            typeof recovery.ivB64 !== 'string' || !/^[A-Za-z0-9+/]{16}$/.test(recovery.ivB64) ||
            typeof recovery.ctB64 !== 'string' || !/^[A-Za-z0-9+/]{64}$/.test(recovery.ctB64) || JSON.stringify(recovery).length > 1024) reject(400, '恢复信息无效')
        } else {
          bootstrap = validateBootstrap(body.bootstrap)
          const original = JSON.parse(String(row!.bootstrap))
          if (typeof body.nextProof !== 'string' || !/^[a-f0-9]{64}$/.test(body.nextProof) ||
            ['vaultId', 'keyId', 'ivB64', 'ctB64', 'ts'].some(k => bootstrap![k] !== original[k])) reject(400, '更新不得改变保险库身份或数据')
        }
        db.exec('BEGIN IMMEDIATE')
        try {
          if (route === '/v1/account/recovery/set') {
            db.prepare('UPDATE cloud_security SET revision=revision+1, verifier=?, recovery=? WHERE name=?').run(hash(String(body.recoveryProof)), JSON.stringify(body.recovery), String(name))
          } else {
            db.prepare('UPDATE cloud_accounts SET verifier=?, bootstrap=? WHERE name=?').run(hash(String(body.nextProof)), JSON.stringify(bootstrap), String(name))
            db.prepare('UPDATE cloud_security SET revision=revision+1 WHERE name=?').run(String(name))
            db.prepare('DELETE FROM cloud_sessions WHERE owner=?').run(String(row!.owner))
            row!.bootstrap = JSON.stringify(bootstrap)
          }
          db.exec('COMMIT')
        } catch (error) { db.exec('ROLLBACK'); throw error }
        row!.revision = Number(row!.revision) + 1
        if (route === '/v1/account/recovery/set') return { ok: true, revision: row!.revision }
      }
      const token = randomBytes(32).toString('base64url')
      db.prepare('INSERT INTO cloud_sessions VALUES (?, ?, ?)').run(hash(token), String(row!.owner), now)
      db.prepare('DELETE FROM cloud_sessions WHERE owner=? AND token NOT IN (SELECT token FROM cloud_sessions WHERE owner=? ORDER BY created DESC, rowid DESC LIMIT 32)').run(String(row!.owner), String(row!.owner))
      return { token, bootstrap: JSON.parse(String(row!.bootstrap)), revision: Number(row!.revision), recoveryEnabled: Boolean(row!.recovery) }
    },
  }
}
