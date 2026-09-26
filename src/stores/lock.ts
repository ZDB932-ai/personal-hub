import { computed, ref } from 'vue'
import type { DataEnvelope, VaultEntry } from '@/types'
import {
  decryptJSON,
  decryptBytes,
  deriveVaultKey,
  encryptJSON,
  encryptBytes,
  legacyPbkdf2Hash,
  newKdfParams,
} from '@/lib/crypto'
import { emptyProfile, readJSON, uid } from '@/lib/utils'
import { deleteBlob, getBlob, putBlob } from '@/lib/docdb'
import { commitRepository, readRepository, refreshVaultRepository, repositoryRevision, type RepositoryKey } from '@/lib/vaultRepository'
import { toast } from '@/lib/toast'
import { biometricEnabled, biometricStoreSecret } from '@/lib/biometric'
import {
  dataEnvelope,
  adoptOfflinePayload,
  prepareOfflinePayload,
  beginDatabaseUpdate,
  endDatabaseUpdate,
  flushPendingSave,
  getActiveKey,
  getDataRevision,
  initFresh,
  initFromEnvelope,
  persistNow,
  publishEnvelope,
  snapshotPayload,
  setActiveKey,
  suppressNextSave,
  wipeMemory,
} from './database'
import { profile } from './profile'
import { entries, seedEntries } from './vault'
import { docMetas } from './docs'
import { recoveryItems } from './recovery'
import { resetRecoveryBaseline } from './database'
import { recoveryAttachmentMetas } from '@/lib/recovery'
import { createVaultKey, rewrapVaultKey, unlockEnvelope } from '@/lib/vaultKeys'

const PREFS_KEY = 'xk.lock.v2'
const LEGACY_LOCK_KEY = 'xk.lock.v1'
const LEGACY_PROFILE_KEY = 'xk.profile.v1'
const LEGACY_VAULT_KEY = 'xk.vault.v1'
const LEGACY_SKIP_KEY = 'xk.lock.skip'

export interface LockPrefs {
  hint: string
  autoLockMinutes: number
}

function hasLegacyRecord(): boolean {
  try {
    return Boolean(localStorage.getItem(LEGACY_LOCK_KEY))
  } catch {
    return false
  }
}

function hasLegacyPlaintext(): boolean {
  try {
    return Boolean(
      localStorage.getItem(LEGACY_PROFILE_KEY) || localStorage.getItem(LEGACY_VAULT_KEY),
    )
  } catch {
    return false
  }
}

export type LockMode = 'fresh' | 'legacy' | 'encrypted'

const mode = computed<LockMode>(() => {
  if (dataEnvelope.value) return 'encrypted'
  if (hasLegacyPlaintext() || hasLegacyRecord()) return 'legacy'
  return 'fresh'
})

const prefs = ref<LockPrefs>(
  readJSON<LockPrefs>(PREFS_KEY) ?? { hint: '', autoLockMinutes: 5 },
)

async function savePrefs(): Promise<void> {
  await commitRepository({ [PREFS_KEY]: { ...prefs.value } })
}

const unlocked = ref(false)
const locking = ref(false)
let lockPromise: Promise<void> | null = null
let passwordChange: Promise<{ ok: boolean; error?: string }> | null = null

export const isGated = computed(() => !unlocked.value || locking.value)
export const lockMode = mode
export const usesSetupScreen = computed(() => {
  if (mode.value === 'fresh') return true
  if (mode.value === 'encrypted') return false
  return !hasLegacyRecord()
})
export const lockHint = computed(() => prefs.value.hint)
export const autoLockMinutes = computed(() => prefs.value.autoLockMinutes)

let timer: ReturnType<typeof setTimeout> | null = null
let watching = false
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const

async function adoptLegacyData(
  params: ReturnType<typeof newKdfParams>,
  key: CryptoKey,
): Promise<boolean> {
  const p = readJSON<Record<string, string>>(LEGACY_PROFILE_KEY)
  const v = readJSON<VaultEntry[]>(LEGACY_VAULT_KEY)
  if (!p && !v) return false
  suppressNextSave()
  Object.assign(profile, emptyProfile(), p ?? {})
  entries.value = Array.isArray(v) && v.length ? v : seedEntries()
  setActiveKey(key)
  await initFromEnvelope(await persistNow(params), key)
  try {
    localStorage.removeItem(LEGACY_LOCK_KEY)
    localStorage.removeItem(LEGACY_PROFILE_KEY)
    localStorage.removeItem(LEGACY_VAULT_KEY)
    localStorage.removeItem(LEGACY_SKIP_KEY)
  } catch {
    /* ignore */
  }
  return true
}

function finishUnlock(): void {
  unlocked.value = true
  startActivityWatch()
}

export async function setupLock(password: string, hint: string): Promise<void> {
  const params = newKdfParams()
  const key = await deriveVaultKey(password, params)
  setActiveKey(key)
  const adopted = await adoptLegacyData(params, key)
  if (!adopted) await initFresh(params)
  prefs.value.hint = hint.trim()
  await savePrefs()
  finishUnlock()
}

export async function unlockApp(password: string): Promise<boolean> {
  if (locking.value) return false
  if (!unlockedGuardOk()) return false
  try {
    await refreshVaultRepository()
    dataEnvelope.value = readRepository<DataEnvelope>('xk.data.v2')
    prefs.value = readRepository<LockPrefs>(PREFS_KEY) ?? { hint: '', autoLockMinutes: 5 }
    if (mode.value === 'legacy') {
      const rec = readJSON<{
        salt: string
        hash: string
        iterations: number
        hint?: string
      }>(LEGACY_LOCK_KEY)
      if (!rec) return false
      const hash = await legacyPbkdf2Hash(password, rec.salt, rec.iterations)
      if (hash !== rec.hash) return false
      const params = newKdfParams()
      const key = await deriveVaultKey(password, params)
      setActiveKey(key)
      const adopted = await adoptLegacyData(params, key)
      if (!adopted) await initFresh(params)
      prefs.value.hint = rec.hint ?? ''
      await savePrefs()
      finishUnlock()
      return true
    }
    const env = dataEnvelope.value
    if (!env) return false
    const key = await unlockEnvelope(env, password)
    await initFromEnvelope(env, key)
    setActiveKey(key)
    finishUnlock()
    return true
  } catch {
    return false
  }
}

function unlockedGuardOk(): boolean {
  if (mode.value === 'fresh') return false
  if (mode.value === 'legacy' && !hasLegacyRecord()) return false
  return true
}

export function lockApp(): Promise<void> {
  if (lockPromise) return lockPromise
  if (!unlocked.value) return Promise.resolve()
  locking.value = true
  stopActivityWatch()
  lockPromise = (async () => {
    try {
      if (passwordChange) await passwordChange
      await flushPendingSave()
      unlocked.value = false
      wipeMemory()
    } catch (error) {
      startActivityWatch()
      throw error
    } finally {
      locking.value = false
      lockPromise = null
    }
  })()
  return lockPromise
}

interface SecureRecord {
  storageKey: RepositoryKey
  value: unknown
}

async function readSecureRecords(key: CryptoKey): Promise<SecureRecord[]> {
  const storageKeys: RepositoryKey[] = ['xk.sync.secure', 'xk.github.secure', 'xk.ai.secrets.v1', 'xk.record-sync.secure']
  const records: SecureRecord[] = []
  for (const storageKey of storageKeys) {
    const secure = readJSON<{ ivB64: string; ctB64: string }>(storageKey)
    if (!secure) continue
    records.push({ storageKey, value: await decryptJSON(key, secure.ivB64, secure.ctB64) })
  }
  return records
}

export function changePassword(
  oldPw: string,
  newPw: string,
  hint: string,
  upgrade = false,
): Promise<{ ok: boolean; error?: string }> {
  if (passwordChange || locking.value || !unlocked.value) {
    return Promise.resolve({ ok: false, error: '当前无法修改主密码，请稍后重试' })
  }
  passwordChange = performPasswordChange(oldPw, newPw, hint, upgrade)
    .catch(error => ({ ok: false, error: error instanceof Error ? error.message : '修改主密码失败' }))
    .finally(() => { passwordChange = null })
  return passwordChange
}

async function performPasswordChange(
  oldPw: string,
  newPw: string,
  hint: string,
  upgrade: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await flushPendingSave()
  await beginDatabaseUpdate()
  const stagedIds: string[] = []
  let committed = false
  try {
    const env = dataEnvelope.value
    if (!env) return { ok: false, error: '本机数据尚未初始化' }
    let oldKey: CryptoKey
    try {
      oldKey = await unlockEnvelope(env, oldPw)
    } catch {
      return { ok: false, error: '当前密码不正确' }
    }
    let secureRecords: SecureRecord[]
    const storageRevision = repositoryRevision()
    if (env.v === 3) {
      const header = await rewrapVaultKey(env, oldPw, newPw)
      const nextEnvelope = { ...env, ...header }
      const nextPrefs = { ...prefs.value, hint: hint.trim() }
      await commitRepository({ 'xk.data.v2': nextEnvelope, [PREFS_KEY]: nextPrefs }, () => repositoryRevision() === storageRevision)
      committed = true
      prefs.value = nextPrefs
      publishEnvelope(nextEnvelope, false)
      if (biometricEnabled()) void biometricStoreSecret(newPw).catch(() => {})
      return { ok: true }
    }
    try {
      secureRecords = await readSecureRecords(oldKey)
    } catch {
      return { ok: false, error: '已保存的同步、GitHub 或 AI 凭据无法解密；请先重新连接后再修改主密码' }
    }
    const params = newKdfParams()
    const created = upgrade ? await createVaultKey(newPw) : null
    const newKey = created?.key ?? await deriveVaultKey(newPw, params)
    const activeKey = getActiveKey()
    const savedRevision = getDataRevision()
    const payload = snapshotPayload()
    const oldBlobIds: string[] = []
    for (const meta of recoveryAttachmentMetas(payload)) {
      const oldId = meta.blobId ?? meta.id
      const record = await getBlob(oldId)
      if (!record) {
        if (upgrade) throw new Error(`附件「${meta.name}」不在本机，请先恢复附件再升级`)
        continue
      }
      const plain = await decryptBytes(oldKey, record.ivB64, record.ct)
      const encrypted = await encryptBytes(newKey, plain)
      const blobId = uid()
      stagedIds.push(blobId)
      await putBlob(blobId, encrypted)
      meta.blobId = blobId
      oldBlobIds.push(oldId)
    }
    const values: Record<string, unknown> = {}
    for (const record of secureRecords) {
      values[record.storageKey] = await encryptJSON(newKey, record.value)
    }
    const prepared = prepareOfflinePayload(payload)
    const encrypted = await encryptJSON(newKey, prepared)
    if (getActiveKey() !== activeKey || getDataRevision() !== savedRevision) {
      return { ok: false, error: '改密期间数据发生变化，请重试；原密码仍然有效' }
    }
    const nextEnvelope: DataEnvelope = { ...(created?.header ?? { v: 2 as const, kdf: params }), ts: Math.max(Date.now(), env.ts + 1), ...encrypted }
    const nextPrefs = { ...prefs.value, hint: hint.trim() }
    values['xk.data.v2'] = nextEnvelope
    values[PREFS_KEY] = nextPrefs
    await commitRepository(values, () => getActiveKey() === activeKey && getDataRevision() === savedRevision && repositoryRevision() === storageRevision)
    committed = true
    setActiveKey(newKey)
    prefs.value = nextPrefs
    suppressNextSave()
    docMetas.value = payload.docMetas ?? []
    recoveryItems.value = payload.recoveryItems ?? []
    resetRecoveryBaseline(prepared)
    adoptOfflinePayload(prepared, nextEnvelope.ts)
    publishEnvelope(nextEnvelope, true)
    await Promise.allSettled(oldBlobIds.map(deleteBlob))
    if (biometricEnabled()) {
      void biometricStoreSecret(newPw).catch(() => {})
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `修改主密码失败：${error.message}` : '修改主密码失败，请重试' }
  } finally {
    if (!committed) await Promise.allSettled(stagedIds.map(deleteBlob))
    endDatabaseUpdate()
  }
}

export async function setAutoLock(minutes: number): Promise<void> {
  const next = { ...prefs.value, autoLockMinutes: minutes }
  try {
    await commitRepository({ [PREFS_KEY]: next })
    prefs.value = next
    resetTimer()
  } catch (error) {
    toast(error instanceof Error ? error.message : '设置保存失败', 'error')
  }
}

function resetTimer(): void {
  if (timer) clearTimeout(timer)
  timer = null
  const mins = prefs.value.autoLockMinutes
  if (!mins || !unlocked.value) return
  timer = setTimeout(() => {
    void lockApp().catch(() => toast('保存失败，暂未锁定，请检查本机存储空间', 'error'))
  }, mins * 60_000)
}

function bumpActivity(): void {
  if (!unlocked.value) return
  resetTimer()
}

function startActivityWatch(): void {
  if (watching || typeof window === 'undefined') return
  watching = true
  for (const ev of ACTIVITY_EVENTS) {
    window.addEventListener(ev, bumpActivity, { passive: true })
  }
  resetTimer()
}

function stopActivityWatch(): void {
  watching = false
  if (timer) clearTimeout(timer)
  timer = null
  for (const ev of ACTIVITY_EVENTS) {
    window.removeEventListener(ev, bumpActivity)
  }
}
