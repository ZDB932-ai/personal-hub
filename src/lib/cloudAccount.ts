import type { WrappedEnvelope } from '@/types'
import { createVaultKey, unlockEnvelope, rewrapVaultKey, createLocalRecovery, recoverLocalPassword, type LocalRecovery } from './vaultKeys'
import { encryptJSON } from './crypto'
import { emptyProfile } from './utils'
import { DEFAULT_SYNC_SERVER } from './syncConnectionFile'
import { syncServerUrl } from './recordSyncHttp'

export function cloudName(value: string): string {
  const name = value.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(name)) throw new Error('账号需为 3–40 位英文字母、数字、点、横线或下划线')
  return name
}

export async function cloudProof(name: string, password: string): Promise<string> {
  if (password.length < 8 || password.length > 256) throw new Error('密码需要 8–256 个字符')
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const raw = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: enc.encode(`personal-hub/cloud-auth/v1/${cloudName(name)}`) }, key, 256))
  try { return Array.from(raw, b => b.toString(16).padStart(2, '0')).join('') } finally { raw.fill(0) }
}

export async function authenticateCloud(name: string, password: string, register: boolean, url = DEFAULT_SYNC_SERVER) {
  name = cloudName(name)
  const proof = await cloudProof(name, password)
  let bootstrap: WrappedEnvelope | undefined
  if (register) {
    const created = await createVaultKey(password)
    bootstrap = { ...created.header, ts: Date.now(), ...await encryptJSON(created.key, { schemaVersion: 1, profile: emptyProfile(), entries: [] }) }
  }
  const result = await cloudRequest<CloudReply>(register ? 'register' : 'login', { name, proof, ...(bootstrap ? { bootstrap } : {}) }, url)
  validateReply(result)
  const key = await unlockEnvelope(result.bootstrap, password)
  return { ...result, key, name, url: syncServerUrl(url) }
}

export interface CloudReply { token: string; bootstrap: WrappedEnvelope; revision: number; recoveryEnabled: boolean }
export class CloudNetworkError extends Error {}

export async function cloudRequest<T>(route: string, body: unknown, url = DEFAULT_SYNC_SERVER): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${syncServerUrl(url)}/v1/account/${route}`, {
      method: 'POST', credentials: 'omit', redirect: 'error', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    })
  } catch { throw new CloudNetworkError('无法连接云服务。若刚提交改密或重设，请先尝试用新密码登录，确认结果。') }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || '云账号暂时无法连接，请稍后重试')
  return result as T
}

function validateReply(result: CloudReply) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(result.token) || result.bootstrap?.v !== 3) throw new Error('云账号响应无效')
}

export async function recoveryProof(name: string, code: string): Promise<string> {
  const normalized = code.replace(/[\s-]/g, '').toUpperCase()
  if (!/^[A-F0-9]{64}$/.test(normalized)) throw new Error('请输入完整的 8 组云恢复密钥')
  const bytes = new TextEncoder().encode(`personal-hub/cloud-recovery-auth/v1/${cloudName(name)}/${normalized}`)
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
}

export async function enableCloudRecovery(name: string, password: string, code: string, valid = () => true, url = DEFAULT_SYNC_SERVER) {
  const session = await authenticateCloud(name, password, false, url)
  const recovery = await createLocalRecovery(session.bootstrap, password, code)
  const proof = await cloudProof(session.name, password)
  const recoveryAuth = await recoveryProof(session.name, code)
  if (!valid()) throw new Error('页面或账户状态已变化，请重新操作')
  return cloudRequest('recovery/set', { name: session.name, proof, revision: session.revision, recoveryProof: recoveryAuth, recovery }, url)
}

export async function changeCloudPassword(name: string, oldPassword: string, newPassword: string, valid = () => true, url = DEFAULT_SYNC_SERVER) {
  const nextProof = await cloudProof(name, newPassword)
  const session = await authenticateCloud(name, oldPassword, false, url)
  const bootstrap = { ...session.bootstrap, ...await rewrapVaultKey(session.bootstrap, oldPassword, newPassword) }
  const proof = await cloudProof(session.name, oldPassword)
  if (!valid()) throw new Error('页面或账户状态已变化，请重新操作')
  const result = await cloudRequest<CloudReply>('change', { name: session.name, proof, revision: session.revision, nextProof, bootstrap }, url)
  validateReply(result)
  return { ...result, key: await unlockEnvelope(result.bootstrap, newPassword), name: session.name, url: syncServerUrl(url) }
}

export async function resetCloudPassword(name: string, code: string, newPassword: string, valid = () => true, url = DEFAULT_SYNC_SERVER) {
  name = cloudName(name)
  const proof = await recoveryProof(name, code)
  const nextProof = await cloudProof(name, newPassword)
  const saved = await cloudRequest<{ bootstrap: WrappedEnvelope; recovery: LocalRecovery; revision: number }>('recovery/get', { name, proof }, url)
  const bootstrap = await recoverLocalPassword(saved.bootstrap, saved.recovery, code, newPassword)
  if (!valid()) throw new Error('页面或账户状态已变化，请重新操作')
  const result = await cloudRequest<CloudReply>('reset', { name, proof, revision: saved.revision, nextProof, bootstrap }, url)
  validateReply(result)
  return { ...result, key: await unlockEnvelope(result.bootstrap, newPassword), name, url: syncServerUrl(url) }
}
