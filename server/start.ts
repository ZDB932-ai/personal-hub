import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createSyncServer } from './sync-server.ts'

const dir = resolve(process.env.PHUB_SYNC_DIR ?? '.sync-data')
mkdirSync(dir, { recursive: true })
const credentials = join(dir, 'access.local.json')
if (!existsSync(credentials)) writeFileSync(credentials, JSON.stringify({ account: 'personal', token: randomBytes(32).toString('base64url') }, null, 2), { mode: 0o600, flag: 'wx' })
const access = JSON.parse(readFileSync(credentials, 'utf8'))
const instance = createSyncServer(join(dir, 'sync.sqlite'), { origins: process.env.PHUB_SYNC_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean) })
instance.provision(access.account, access.token)
const host = process.env.PHUB_SYNC_HOST ?? '127.0.0.1'
const port = Number(process.env.PHUB_SYNC_PORT ?? 8787)
instance.server.listen(port, host, () => {
  console.log(`同步服务：http://${host}:${port}`)
  console.log(`访问令牌文件：${credentials}（请勿提交或公开）`)
})
const stop = () => instance.server.close(() => { instance.close(); process.exit(0) })
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
