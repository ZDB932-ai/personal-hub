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
import { beforeDesktopTodoLock, afterDesktopTodoLock, desktopTodoLockFailed } from '@/lib/desktopTodoLifecycle'
import { toast } from '@/lib/toast'
import { biometricClear, biometricEnabled, biometricStoreSecret } from '@/lib/biometric'
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
import { createLocalRecovery, recoverLocalPassword, createVaultKey, rewrapVaultKey, unlockEnvelope, type LocalRecovery } from '@/lib/vaultKeys'
import { mergeRemote } from '@/lib/syncMerge'
import type { SyncRecord } from '@/lib/syncProtocol'

const PREFS_KEY = 'xk.lock.v2'
const LEGACY_LOCK_KEY = 'xk.lock.v1'
const LEGACY_PROFILE_KEY = 'xk.profile.v1'
const LEGACY_VAULT_KEY = 'xk.vault.v1'
const LEGACY_SKIP_KEY = 'xk.lock.skip'

export interface LockPrefs {
  hint: string
  autoLockMinutes: number
  accountName?: string
  recovery?: LocalRecovery
  cloudAccount?: string
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
export const localAccountName = computed(() => prefs.value.accountName ?? '')
export const localCloudAccount = computed(() => prefs.value.cloudAccount ?? '')
export const hasLocalRecovery = computed(() => dataEnvelope.value?.v === 3 && prefs.value.recovery?.vaultId === dataEnvelope.value.vaultId && prefs.value.recovery?.keyId === dataEnvelope.value.keyId)

function validateAccount(name: string, password: string): void {
  if (!name.trim() || name.trim().length > 40) throw new Error('账户名称需要 1–40 个字符')
  if (password.length < 8 || password.length > 256) throw new Error('密码需要 8–256 个字符')
}

let accountBusy = false
let unlocking = false

export async function installCloudAccount(name: string, env: import('@/types').WrappedEnvelope, key: CryptoKey, records: SyncRecord[], credentials: import('@/lib/recordSyncCredentials').RecordCredentials): Promise<void> {
  if (accountBusy || unlocking || mode.value !== 'fresh') throw new Error('本机已有账户，请使用本机登录入口')
  accountBusy = true
  try {
    await refreshVaultRepository()
    const revision = repositoryRevision()
    if (readRepository('xk.data.v2')) throw new Error('本机已有数据，请刷新后登录')
    const payload = prepareOfflinePayload({ schemaVersion: 1, profile: emptyProfile(), entries: [] })
    payload.offlineJournal!.pending = []
    for (const record of records) mergeRemote(payload, record)
    const envelope = { ...env, ts: Date.now(), ...await encryptJSON(key, payload) }
    const nextPrefs = { hint: '', autoLockMinutes: 5, accountName: name, cloudAccount: name }
    const sealedCredentials = await encryptJSON(key, credentials)
    await commitRepository({ 'xk.data.v2': envelope, [PREFS_KEY]: nextPrefs, 'xk.record-sync.secure': sealedCredentials }, () => repositoryRevision() === revision && !readRepository('xk.data.v2'))
    prefs.value = nextPrefs
    await initFromEnvelope(envelope, key)
    setActiveKey(key)
    finishUnlock()
  } finally { accountBusy = false }
}

export async function refreshCloudAccount(name: string, remote: import('@/types').WrappedEnvelope, key: CryptoKey, credentials: import('@/lib/recordSyncCredentials').RecordCredentials): Promise<void> {
  if (accountBusy || unlocking || passwordChange || locking.value) throw new Error('账户正在更新，请稍后重试')
  accountBusy = true
  const wasGated = isGated.value, previousKey = getActiveKey()
  let updating = false
  try {
    if (!wasGated) await flushPendingSave()
    await beginDatabaseUpdate(); updating = true
    await refreshVaultRepository()
    const revision = repositoryRevision(), dataRevision = getDataRevision()
    const env = readRepository<DataEnvelope>('xk.data.v2')
    const savedPrefs = readRepository<LockPrefs>(PREFS_KEY)
    if (savedPrefs?.cloudAccount !== name || env?.v !== 3 || env.vaultId !== remote.vaultId || env.keyId !== remote.keyId) throw new Error('云账号与本机保险库不匹配，本机数据未修改')
    await decryptJSON(key, env.ivB64, env.ctB64)
    const nextEnvelope = { ...env, kdf: remote.kdf, wrappedKey: remote.wrappedKey }
    const sealed = await encryptJSON(key, credentials)
    const valid = () => !locking.value && isGated.value === wasGated && getActiveKey() === previousKey && getDataRevision() === dataRevision && repositoryRevision() === revision
    await commitRepository({ 'xk.data.v2': nextEnvelope, 'xk.record-sync.secure': sealed }, valid)
    prefs.value = savedPrefs
    dataEnvelope.value = nextEnvelope
    if (wasGated) await initFromEnvelope(nextEnvelope, key)
    setActiveKey(key)
    finishUnlock()
    if (JSON.stringify(env.wrappedKey) !== JSON.stringify(remote.wrappedKey)) await biometricClear().catch(() => {})
  } finally { if (updating) endDatabaseUpdate(); accountBusy = false }
}

export async function createLocalAccount(name: string, password: string, code: string): Promise<void> {
  validateAccount(name, password)
  if (accountBusy || mode.value !== 'fresh') throw new Error('当前无法创建账户')
  accountBusy = true
  try {
    await refreshVaultRepository()
    const revision = repositoryRevision()
    if (readRepository('xk.data.v2')) throw new Error('本机已有数据，请刷新后登录')
    const created = await createVaultKey(password)
    const payload = prepareOfflinePayload({ schemaVersion: 1, profile: emptyProfile(), entries: seedEntries() })
    const env = { ...created.header, ts: Date.now(), ...await encryptJSON(created.key, payload) }
    const recovery = await createLocalRecovery(env, password, code)
    const nextPrefs = { ...prefs.value, accountName: name.trim(), hint: '', recovery }
    await commitRepository({ 'xk.data.v2': env, [PREFS_KEY]: nextPrefs }, () => repositoryRevision() === revision)
    prefs.value = nextPrefs
    dataEnvelope.value = env
    await initFromEnvelope(env, created.key)
    setActiveKey(created.key)
    finishUnlock()
  } finally { accountBusy = false }
}

export async function configureLocalAccount(name: string, password: string, code: string): Promise<void> {
  if (!name.trim() || name.trim().length > 40) throw new Error('账户名称需要 1–40 个字符')
  if (accountBusy || passwordChange || isGated.value) throw new Error('请先解锁并等待其他操作完成')
  accountBusy = true
  try {
    if (dataEnvelope.value?.v !== 3) {
      const result = await changePassword(password, password, prefs.value.hint, true)
      if (!result.ok) throw new Error(result.error)
    }
    await flushPendingSave()
    await beginDatabaseUpdate()
    try {
      const env = dataEnvelope.value
      const key = getActiveKey()
      const revision = repositoryRevision()
      if (env?.v !== 3 || isGated.value) throw new Error('请重新解锁后再设置')
      const recovery = await createLocalRecovery(env, password, code)
      const nextPrefs = { ...prefs.value, accountName: name.trim(), recovery }
      await commitRepository({ [PREFS_KEY]: nextPrefs }, () => !isGated.value && getActiveKey() === key && repositoryRevision() === revision)
      prefs.value = nextPrefs
    } finally { endDatabaseUpdate() }
  } finally { accountBusy = false }
}

export async function resetLocalPassword(code: string, password: string): Promise<void> {
  if (password.length < 8 || password.length > 256) throw new Error('新密码需要 8–256 个字符')
  if (accountBusy || unlocking || !isGated.value || locking.value) throw new Error('请在锁定页面恢复密码，并等待登录操作完成')
  accountBusy = true
  try {
    await refreshVaultRepository()
    const env = readRepository<DataEnvelope>('xk.data.v2')
    const savedPrefs = readRepository<LockPrefs>(PREFS_KEY)
    const revision = repositoryRevision()
    if (env?.v !== 3 || !savedPrefs?.recovery) throw new Error('此设备尚未设置恢复密钥')
    let nextEnvelope: DataEnvelope
    try { nextEnvelope = await recoverLocalPassword(env, savedPrefs.recovery, code, password) }
    catch { throw new Error('恢复密钥不正确，或本机恢复信息已失效') }
    const nextPrefs = { ...savedPrefs, hint: '' }
    await commitRepository({ 'xk.data.v2': nextEnvelope, [PREFS_KEY]: nextPrefs }, () => isGated.value && repositoryRevision() === revision)
    prefs.value = nextPrefs
    dataEnvelope.value = nextEnvelope
    await biometricClear().catch(() => {})
  } finally { accountBusy = false }
}

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
  if (locking.value || accountBusy || unlocking) return false
  if (!unlockedGuardOk()) return false
  unlocking = true
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
  } finally {
    unlocking = false
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
      await beforeDesktopTodoLock()
      await flushPendingSave()
      await afterDesktopTodoLock()
      unlocked.value = false
      wipeMemory(true)
    } catch (error) {
      await desktopTodoLockFailed().catch(() => {})
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
  const storageKeys: RepositoryKey[] = ['xk.sync.secure', 'xk.github.secure', 'xk.ai.secrets.v1', 'xk.record-sync.secure', 'xk.desktop-todo.secure']
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

export function noteDesktopActivity(): void { bumpActivity() }

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
