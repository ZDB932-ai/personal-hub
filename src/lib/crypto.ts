import type { KdfParams } from '@/types'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const DEFAULT_KDF = {
  memKiB: 65536,
  timeCost: 3,
  parallelism: 4,
}

export function newKdfParams(): KdfParams {
  return { algo: 'argon2id', saltHex: randomHex(16), ...DEFAULT_KDF }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function randomHex(byteLength = 16): string {
  const buf = new Uint8Array(byteLength)
  crypto.getRandomValues(buf)
  return bytesToHex(buf)
}

export function bytesToB64(bytes: Uint8Array): string {
  let str = ''
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i])
  }
  return btoa(str)
}

export function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i)
  }
  return out
}

export interface KdfParamsLike {
  saltHex: string
  memKiB: number
  timeCost: number
  parallelism: number
}

export async function deriveVaultKey(
  password: string,
  kdf: KdfParamsLike,
): Promise<CryptoKey> {
  const { argon2id } = await import('hash-wasm')
  const bits = (await argon2id({
    password,
    salt: hexToBytes(kdf.saltHex),
    parallelism: kdf.parallelism,
    iterations: kdf.timeCost,
    memorySize: kdf.memKiB,
    hashLength: 32,
    outputType: 'binary',
  })) as Uint8Array
  return crypto.subtle.importKey(
    'raw',
    bits as unknown as Uint8Array<ArrayBuffer>,
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptJSON(
  key: CryptoKey,
  value: unknown,
): Promise<{ ivB64: string; ctB64: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(value)),
  )
  return { ivB64: bytesToB64(iv), ctB64: bytesToB64(new Uint8Array(ct)) }
}

export async function decryptJSON<T>(
  key: CryptoKey,
  ivB64: string,
  ctB64: string,
): Promise<T> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(ivB64) },
    key,
    b64ToBytes(ctB64),
  )
  return JSON.parse(decoder.decode(pt)) as T
}

export async function encryptBytes(
  key: CryptoKey,
  data: ArrayBuffer,
): Promise<{ ivB64: string; ct: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  return { ivB64: bytesToB64(iv), ct }
}

export async function decryptBytes(
  key: CryptoKey,
  ivB64: string,
  ct: ArrayBuffer,
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(ivB64) }, key, ct)
}

export async function legacyPbkdf2Hash(
  password: string,
  saltHex: string,
  iterations: number,
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations },
    keyMaterial,
    256,
  )
  return bytesToHex(new Uint8Array(bits))
}
