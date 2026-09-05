import { computed, ref } from 'vue'
import type { VaultEntry } from '@/types'
import {
  decryptJSON,
  deriveVaultKey,
  encryptJSON,
  legacyPbkdf2Hash,
  newKdfParams,
} from '@/lib/crypto'
import { emptyProfile, readJSON, writeJSON } from '@/lib/utils'
import { biometricEnabled, biometricStoreSecret } from '@/lib/biometric'
import {
  dataEnvelope,
  initFresh,
  initFromEnvelope,
  persistNow,
  setActiveKey,
  suppressNextSave,
  wipeMemory,
} from './database'
import { profile } from './profile'
import { entries, seedEntries } from './vault'

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

function savePrefs(): void {
  writeJSON(PREFS_KEY, prefs.value)
}

const unlocked = ref(false)

export const isGated = computed(() => !unlocked.value)
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
  await persistNow(params)
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
  savePrefs()
  finishUnlock()
}

export async function unlockApp(password: string): Promise<boolean> {
  if (!unlockedGuardOk()) return false
  try {
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
      const adopted = await adoptLegacyData(params, key)
      if (!adopted) await initFresh(params)
      prefs.value.hint = rec.hint ?? ''
      savePrefs()
      finishUnlock()
      return true
    }
    const env = dataEnvelope.value
    if (!env) return false
    const key = await deriveVaultKey(password, env.kdf)
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

export function lockApp(): void {
  if (!unlocked.value) return
  unlocked.value = false
  stopActivityWatch()
  wipeMemory()
}

interface SecureRecord {
  storageKey: string
  value: unknown
}

async function readSecureRecords(key: CryptoKey): Promise<SecureRecord[]> {
  const storageKeys = ['xk.sync.secure', 'xk.github.secure', 'xk.ai.secrets.v1']
  const records: SecureRecord[] = []
  for (const storageKey of storageKeys) {
    const secure = readJSON<{ ivB64: string; ctB64: string }>(storageKey)
    if (!secure) continue
    records.push({ storageKey, value: await decryptJSON(key, secure.ivB64, secure.ctB64) })
  }
  return records
}

export async function changePassword(
  oldPw: string,
  newPw: string,
  hint: string,
): Promise<{ ok: boolean; error?: string }> {
  const env = dataEnvelope.value
  if (!env) return { ok: false, error: '本机数据尚未初始化' }
  let oldKey: CryptoKey
  try {
    oldKey = await deriveVaultKey(oldPw, env.kdf)
    await decryptJSON(oldKey, env.ivB64, env.ctB64)
  } catch {
    return { ok: false, error: '当前密码不正确' }
  }
  let secureRecords: SecureRecord[]
  try {
    secureRecords = await readSecureRecords(oldKey)
  } catch {
    return { ok: false, error: '已保存的同步、GitHub 或 AI 凭据无法解密；请先重新连接后再修改主密码' }
  }
  const params = newKdfParams()
  const newKey = await deriveVaultKey(newPw, params)
  setActiveKey(newKey)
  prefs.value.hint = hint.trim()
  savePrefs()
  for (const record of secureRecords) {
    writeJSON(record.storageKey, await encryptJSON(newKey, record.value))
  }
  await persistNow(params)
  if (biometricEnabled()) {
    void biometricStoreSecret(newPw).catch(() => {})
  }
  return { ok: true }
}

export function setAutoLock(minutes: number): void {
  prefs.value.autoLockMinutes = minutes
  savePrefs()
  resetTimer()
}

function resetTimer(): void {
  if (timer) clearTimeout(timer)
  timer = null
  const mins = prefs.value.autoLockMinutes
  if (!mins || !unlocked.value) return
  timer = setTimeout(() => lockApp(), mins * 60_000)
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
