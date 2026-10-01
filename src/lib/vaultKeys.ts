import type { DataEnvelope, KdfParams, WrappedEnvelope } from '@/types'
import { b64ToBytes, bytesToB64, decryptJSON, deriveVaultKey, newKdfParams } from './crypto'

export type KeyHeader = Pick<WrappedEnvelope, 'v' | 'vaultId' | 'keyId' | 'kdf' | 'wrappedKey'>

export interface LocalRecovery {
  v: 1
  vaultId: string
  keyId: string
  ivB64: string
  ctB64: string
}

export function generateRecoveryCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('').toUpperCase().match(/.{8}/g)!.join('-')
}

async function recoveryKey(code: string): Promise<CryptoKey> {
  const normalized = code.replace(/[\s-]/g, '')
  if (!/^[a-f\d]{64}$/i.test(normalized)) throw new Error('恢复密钥格式不正确，请输入完整的 8 组密钥')
  const raw = Uint8Array.from(normalized.match(/../g)!, n => parseInt(n, 16))
  try { return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']) }
  finally { raw.fill(0) }
}

function recoveryContext(header: Pick<KeyHeader, 'vaultId' | 'keyId'>): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(['personal-hub/local-recovery', 1, header.vaultId, header.keyId]))
}

export async function createLocalRecovery(env: WrappedEnvelope, password: string, code: string): Promise<LocalRecovery> {
  const raw = await unseal(env, password)
  try {
    await decryptJSON(await importDataKey(raw), env.ivB64, env.ctB64)
    const key = await recoveryKey(code)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: recoveryContext(env) }, key, raw)
    return { v: 1, vaultId: env.vaultId, keyId: env.keyId, ivB64: bytesToB64(iv), ctB64: bytesToB64(new Uint8Array(ct)) }
  } finally { raw.fill(0) }
}

export async function recoverLocalPassword(env: WrappedEnvelope, record: LocalRecovery, code: string, password: string): Promise<WrappedEnvelope> {
  if (record.v !== 1 || record.vaultId !== env.vaultId || record.keyId !== env.keyId) throw new Error('恢复信息与本机保险库不匹配')
  const key = await recoveryKey(code)
  const raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(record.ivB64), additionalData: recoveryContext(env) }, key, b64ToBytes(record.ctB64)))
  try {
    await decryptJSON(await importDataKey(raw), env.ivB64, env.ctB64)
    return { ...env, ...await seal(raw, password, env, newKdfParams()) }
  } finally { raw.fill(0) }
}

function context(header: Pick<KeyHeader, 'vaultId' | 'keyId'>): Uint8Array<ArrayBuffer> {
  if (!/^[0-9a-f-]{36}$/i.test(header.vaultId) || !/^[0-9a-f-]{36}$/i.test(header.keyId)) throw new Error('保险库标识无效')
  return new TextEncoder().encode(JSON.stringify(['personal-hub/data-key', 3, header.vaultId, header.keyId]))
}

async function importDataKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (raw.length !== 32) throw new Error('数据密钥长度无效')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function seal(raw: Uint8Array<ArrayBuffer>, password: string, identity: Pick<KeyHeader, 'vaultId' | 'keyId'>, kdf: KdfParams): Promise<KeyHeader> {
  const key = await deriveVaultKey(password, kdf)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: context(identity) }, key, raw)
  return { v: 3, ...identity, kdf, wrappedKey: { ivB64: bytesToB64(iv), ctB64: bytesToB64(new Uint8Array(ct)) } }
}

async function unseal(header: KeyHeader, password: string): Promise<Uint8Array<ArrayBuffer>> {
  const key = await deriveVaultKey(password, header.kdf)
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(header.wrappedKey.ivB64), additionalData: context(header) }, key, b64ToBytes(header.wrappedKey.ctB64))
  return new Uint8Array(raw)
}

export async function createVaultKey(password: string): Promise<{ key: CryptoKey; header: KeyHeader }> {
  const raw = crypto.getRandomValues(new Uint8Array(32))
  try {
    const header = await seal(raw, password, { vaultId: crypto.randomUUID(), keyId: crypto.randomUUID() }, newKdfParams())
    return { header, key: await importDataKey(raw) }
  } finally {
    raw.fill(0)
  }
}

export async function rewrapVaultKey(header: KeyHeader, oldPassword: string, newPassword: string): Promise<KeyHeader> {
  const raw = await unseal(header, oldPassword)
  try {
    if (raw.length !== 32) throw new Error('数据密钥长度无效')
    return await seal(raw, newPassword, { vaultId: header.vaultId, keyId: header.keyId }, newKdfParams())
  } finally {
    raw.fill(0)
  }
}

export async function unlockEnvelope(envelope: DataEnvelope, password: string): Promise<CryptoKey> {
  let key: CryptoKey
  if (envelope.v === 2) key = await deriveVaultKey(password, envelope.kdf)
  else if (envelope.v === 3) {
    const raw = await unseal(envelope, password)
    try { key = await importDataKey(raw) } finally { raw.fill(0) }
  } else throw new Error('不支持的保险库版本')
  await decryptJSON(key, envelope.ivB64, envelope.ctB64)
  return key
}
