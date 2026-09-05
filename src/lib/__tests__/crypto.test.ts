import { describe, expect, it } from 'vitest'
import {
  b64ToBytes,
  bytesToB64,
  decryptBytes,
  decryptJSON,
  deriveVaultKey,
  encryptBytes,
  encryptJSON,
  legacyPbkdf2Hash,
  newKdfParams,
  type KdfParamsLike,
} from '@/lib/crypto'

const FAST_KDF: KdfParamsLike = {
  saltHex: 'aabbccddeeff00112233445566778899',
  memKiB: 8192,
  timeCost: 1,
  parallelism: 1,
}

describe('newKdfParams', () => {
  it('使用默认 Argon2id 参数并生成随机盐', () => {
    const a = newKdfParams()
    const b = newKdfParams()
    expect(a.algo).toBe('argon2id')
    expect(a.memKiB).toBe(65536)
    expect(a.timeCost).toBe(3)
    expect(a.parallelism).toBe(4)
    expect(a.saltHex).toMatch(/^[0-9a-f]{32}$/)
    expect(a.saltHex).not.toBe(b.saltHex)
  })
})

describe('信封加解密', () => {
  it('JSON 往返（含中文与 emoji）', async () => {
    const key = await deriveVaultKey('主密码-P@ss', FAST_KDF)
    const payload = { profile: { name: '张三', bio: '🔒 e2e' }, entries: [1, 2, 3] }
    const { ivB64, ctB64 } = await encryptJSON(key, payload)
    await expect(decryptJSON(key, ivB64, ctB64)).resolves.toEqual(payload)
  })

  it('同参数派生的密钥等价（确定性）', async () => {
    const k1 = await deriveVaultKey('same-password', FAST_KDF)
    const k2 = await deriveVaultKey('same-password', FAST_KDF)
    const { ivB64, ctB64 } = await encryptJSON(k1, { ok: true })
    await expect(decryptJSON(k2, ivB64, ctB64)).resolves.toEqual({ ok: true })
  })

  it('错误密码解密失败（GCM 认证）', async () => {
    const key = await deriveVaultKey('correct', FAST_KDF)
    const { ivB64, ctB64 } = await encryptJSON(key, { secret: 1 })
    const wrong = await deriveVaultKey('incorrect', FAST_KDF)
    await expect(decryptJSON(wrong, ivB64, ctB64)).rejects.toThrow()
  })

  it('换盐后旧密文不可解', async () => {
    const key = await deriveVaultKey('pw', FAST_KDF)
    const otherSalt: KdfParamsLike = { ...FAST_KDF, saltHex: '00112233445566778899aabbccddeeff' }
    const other = await deriveVaultKey('pw', otherSalt)
    const { ivB64, ctB64 } = await encryptJSON(key, { x: 'y' })
    await expect(decryptJSON(other, ivB64, ctB64)).rejects.toThrow()
  })
})

describe('二进制加解密', () => {
  it('字节往返（覆盖全部 0-255 字节值）', async () => {
    const key = await deriveVaultKey('bin', FAST_KDF)
    const data = new Uint8Array(256).map((_, i) => i).buffer
    const { ivB64, ct } = await encryptBytes(key, data)
    const plain = await decryptBytes(key, ivB64, ct)
    expect(new Uint8Array(plain)).toEqual(new Uint8Array(data))
  })
})

describe('Base64 工具', () => {
  it('全部字节值往返', () => {
    const bytes = new Uint8Array(256).map((_, i) => i)
    expect(b64ToBytes(bytesToB64(bytes))).toEqual(bytes)
  })
})

describe('legacyPbkdf2Hash（P1.5 明文迁移兼容）', () => {
  it('符合 PBKDF2-HMAC-SHA-256 官方测试向量', async () => {
    const hash = await legacyPbkdf2Hash('password', '73616c74', 1)
    expect(hash).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b')
  })
})
