import { confirmAction } from './confirmAction'
import { computed, ref } from 'vue'
import { decryptJSON, encryptJSON } from '@/lib/crypto'
import type { DataEnvelope } from '@/types'
import { commitRepository, readRepository } from './vaultRepository'
import {
  dataEnvelope,
  databaseBusy,
  flushPendingSave,
  getActiveKey,
  getDataRevision,
  initFromEnvelope,
  onDataSaved,
} from '@/stores/database'

const CFG_KEY = 'xk.sync.cfg'
const SECURE_KEY = 'xk.sync.secure'
const META_KEY = 'xk.sync.meta'
const PUSH_DEBOUNCE_MS = 5000

export interface SyncConfig {
  serverUrl: string
  email: string
  autoSync: boolean
}

export interface SyncMeta {
  lastSyncAt: number
  lastError: string
}

export const syncConfig = ref<SyncConfig | null>(readJSON<SyncConfig>(CFG_KEY))
export const syncMeta = ref<SyncMeta>(
  readJSON<SyncMeta>(META_KEY) ?? { lastSyncAt: 0, lastError: '' },
)
export const syncing = ref(false)

export const syncStatusText = computed(() => {
  if (dataEnvelope.value?.v === 3) return '仅本机'
  if (!syncConfig.value) return '仅本机'
  if (syncing.value) return '同步中'
  if (syncMeta.value.lastError) return '同步异常'
  return syncMeta.value.lastSyncAt ? '已连接' : '尚未同步'
})

export const isSyncConfigured = computed(() => syncConfig.value !== null)

let token = ''
let userId = ''
let pushTimer: ReturnType<typeof setTimeout> | null = null

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function removeKeys(keys: string[]): void {
  for (const k of keys) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }
}

function normalizeServer(url: string): string {
  let u = url.trim().replace(/\/+$/, '')
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`
  return u
}

async function api(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<Response> {
  const cfg = syncConfig.value
  if (!cfg) throw new Error('尚未配置同步服务器')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    return await fetch(`${normalizeServer(cfg.serverUrl)}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.auth && token ? { Authorization: token } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function login(password: string): Promise<void> {
  const cfg = syncConfig.value!
  const res = await fetch(
    `${normalizeServer(cfg.serverUrl)}/api/collections/users/auth-with-password`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: cfg.email, password }),
    },
  )
  if (!res.ok) throw new Error('登录失败：请检查邮箱和同步密码')
  const data = (await res.json()) as { token: string; record: { id: string } }
  token = data.token
  userId = data.record.id
}

async function ensureAuth(): Promise<void> {
  if (token && userId) return
  const stored = await loadStoredPassword()
  if (!stored) throw new Error('缺少同步凭据，请重新连接')
  await login(stored)
}

export async function ensureSyncAuth(): Promise<{ base: string; token: string } | null> {
  if (!syncConfig.value) return null
  try {
    await ensureAuth()
    return { base: normalizeServer(syncConfig.value.serverUrl), token }
  } catch {
    return null
  }
}

async function encryptWithActiveKey(value: unknown): Promise<{ ivB64: string; ctB64: string }> {
  const key = getActiveKey()
  if (!key) throw new Error('数据已锁定')
  return encryptJSON(key, value)
}

async function loadStoredPassword(): Promise<string | null> {
  const secure = readRepository<{ ivB64: string; ctB64: string }>(SECURE_KEY)
  const key = getActiveKey()
  if (!secure || !key) return null
  try {
    return await decryptJSON<string>(key, secure.ivB64, secure.ctB64)
  } catch {
    return null
  }
}

interface VaultRecord {
  id: string
  data: string
}

async function fetchRemoteRecord(): Promise<VaultRecord | null> {
  const filter = encodeURIComponent(`(user='${userId}')`)
  const res = await api(
    `/api/collections/vaults/records?filter=${filter}&sort=-updated&perPage=1`,
    { auth: true },
  )
  if (!res.ok) throw new Error(`读取云端数据失败（${res.status}），请检查集合权限设置`)
  const list = (await res.json()) as { items: VaultRecord[] }
  return list.items[0] ?? null
}

async function createRemoteRecord(env: DataEnvelope): Promise<void> {
  const res = await api('/api/collections/vaults/records', {
    method: 'POST',
    auth: true,
    body: { user: userId, data: JSON.stringify(env) },
  })
  if (!res.ok) throw new Error(`创建云端备份失败（${res.status}），请检查集合权限设置`)
}

async function updateRemoteRecord(id: string, env: DataEnvelope): Promise<void> {
  const res = await api(`/api/collections/vaults/records/${id}`, {
    method: 'PATCH',
    auth: true,
    body: { data: JSON.stringify(env) },
  })
  if (!res.ok) throw new Error(`推送云端数据失败（${res.status}）`)
}

function saveMeta(): void {
  writeJSON(META_KEY, { ...syncMeta.value })
}

function fail(message: string): never {
  syncMeta.value.lastError = message
  throw new Error(message)
}

export async function connectSync(
  serverUrl: string,
  email: string,
  password: string,
  autoSync: boolean,
): Promise<void> {
  if (dataEnvelope.value?.v === 3) fail('此保险库已使用设备独立密码，请在同步设置中连接逐条同步服务；旧版整库同步已停用')
  if (!getActiveKey()) fail('请先解锁后再连接同步')
  if (password.length < 6) fail('同步密码至少需要 6 位')

  syncConfig.value = { serverUrl, email, autoSync }

  try {
    const health = await api('/api/health')
    if (!health.ok) fail('无法连接服务器，请检查地址')
  } catch (e) {
    syncConfig.value = null
    if (e instanceof Error && e.message.startsWith('无法连接')) throw e
    fail('无法连接服务器，请检查地址与网络')
  }

  try {
    await login(password)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('登录失败')) {
      const signup = await confirmAction(
        '该账号在服务器上不存在。是否用该邮箱注册新账号并开启同步？',
      )
      if (!signup) {
        syncConfig.value = null
        throw new Error('已取消连接')
      }
      const createRes = await api('/api/collections/users/records', {
        method: 'POST',
        body: { email, password, passwordConfirm: password },
      })
      if (!createRes.ok) {
        syncConfig.value = null
        const errText = await createRes.text()
        const reason = errText.includes('validation')
          ? '注册被服务器拒绝：请检查邮箱格式或密码长度（PocketBase 默认至少 8 位）'
          : '注册失败，请确认服务器允许用户注册'
        fail(reason)
      }
      await login(password)
    } else {
      syncConfig.value = null
      throw e
    }
  }

  const activeKey = getActiveKey()
  const secure = await encryptWithActiveKey(password)
  await commitRepository({ [SECURE_KEY]: secure }, () => getActiveKey() === activeKey && !databaseBusy.value)
  syncConfig.value = { serverUrl, email, autoSync }
  writeJSON(CFG_KEY, { ...syncConfig.value })

  await syncNow()
}

export async function disconnectSync(): Promise<void> {
  await commitRepository({ [SECURE_KEY]: undefined })
  removeKeys([CFG_KEY, META_KEY])
  syncConfig.value = null
  syncMeta.value = { lastSyncAt: 0, lastError: '' }
  token = ''
  userId = ''
}

export async function setAutoSync(enabled: boolean): Promise<void> {
  if (!syncConfig.value) return
  syncConfig.value = { ...syncConfig.value, autoSync: enabled }
  writeJSON(CFG_KEY, { ...syncConfig.value })
}

export async function syncNow(): Promise<void> {
  if (dataEnvelope.value?.v === 3) {
    syncMeta.value.lastError = '设备独立密码保险库不支持旧版整库同步'
    return
  }
  if (syncing.value || !syncConfig.value || databaseBusy.value || !getActiveKey()) return
  syncing.value = true
  try {
    await ensureAuth()

    const remote = await fetchRemoteRecord()
    if (databaseBusy.value || !getActiveKey()) throw new Error('数据状态已变化，请重新同步')
    const local = await flushPendingSave()
    if (local.v !== 2) fail('保险库已升级，旧版整库同步已停止')

    if (!remote) {
      await createRemoteRecord(local)
    } else {
      let remoteEnv: DataEnvelope | null = null
      try {
        remoteEnv = JSON.parse(remote.data) as DataEnvelope
      } catch {
        remoteEnv = null
      }
      if (!remoteEnv || !remoteEnv.kdf) {
        await updateRemoteRecord(remote.id, local)
      } else if (remoteEnv.ts > local.ts) {
        await pullRemote(remoteEnv)
      } else if (local.ts > remoteEnv.ts) {
        await updateRemoteRecord(remote.id, local)
      }
    }

    syncMeta.value.lastSyncAt = Date.now()
    syncMeta.value.lastError = ''
  } catch (e) {
    syncMeta.value.lastError =
      e instanceof DOMException && e.name === 'AbortError'
        ? '连接超时，请稍后重试'
        : e instanceof Error
          ? e.message
          : '同步出现未知错误'
  } finally {
    syncing.value = false
    saveMeta()
  }
}

async function pullRemote(remoteEnv: DataEnvelope): Promise<void> {
  if (remoteEnv.v !== 2) fail('远端保险库版本不兼容，请使用设备加入功能')
  const key = getActiveKey()
  if (!key) fail('数据已锁定')
  const revision = getDataRevision()
  const localEnvelope = dataEnvelope.value
  const canApply = () => getActiveKey() === key && !databaseBusy.value && getDataRevision() === revision && dataEnvelope.value === localEnvelope
  try {
    await decryptJSON(key!, remoteEnv.ivB64, remoteEnv.ctB64)
  } catch {
    if (!canApply()) fail('同步期间本地数据已变化，请重新同步')
    const overwrite = await confirmAction(
      '云端数据与本机的主密码不一致（或已损坏），无法解密合并。\n\n是否用本机当前数据覆盖云端？',
    )
    if (!overwrite) fail('云端数据无法解密，同步已取消')
    const remote = await fetchRemoteRecord()
    if (databaseBusy.value || getActiveKey() !== key) fail('数据状态已变化，请重新同步')
    const local = await flushPendingSave()
    if (remote) await updateRemoteRecord(remote.id, local)
    return
  }
  if (!await initFromEnvelope(remoteEnv, key!, canApply)) {
    fail('同步期间本地数据已变化，已保留本地修改，请重新同步')
  }
}

export function scheduleAutoPush(): void {
  if (dataEnvelope.value?.v === 3) return
  if (!syncConfig.value?.autoSync) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void syncNow()
  }, PUSH_DEBOUNCE_MS)
}

export function bindAutoPush(): () => void {
  return onDataSaved(() => scheduleAutoPush())
}
