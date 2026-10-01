import { describe, expect, it, vi } from 'vitest'
import { decryptJSON, deriveVaultKey, encryptJSON } from '../crypto'
import { createVaultKey, rewrapVaultKey, unlockEnvelope } from '../vaultKeys'

vi.mock('../crypto', async original => {
  const actual = await original<typeof import('../crypto')>()
  return { ...actual, newKdfParams: () => ({ ...actual.newKdfParams(), memKiB: 8192, timeCost: 1, parallelism: 1 }) }
})

describe('数据密钥封装', () => {
  it('使用随机数据密钥和不可导出的运行时密钥，改密只修改封装', async () => {
    const { key, header } = await createVaultKey('first-password')
    expect(key.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow()
    const encrypted = await encryptJSON(key, { secret: 'private-value' })
    const original = { ...header, ts: 123, ...encrypted }
    const changed = { ...original, ...await rewrapVaultKey(header, 'first-password', 'second-password') }
    expect(changed.ctB64).toBe(original.ctB64)
    expect(changed.vaultId).toBe(original.vaultId)
    expect(changed.keyId).toBe(original.keyId)
    expect(changed.wrappedKey).not.toEqual(original.wrappedKey)
    await expect(unlockEnvelope(changed, 'first-password')).rejects.toThrow()
    const reopened = await unlockEnvelope(changed, 'second-password')
    expect(await decryptJSON(reopened, encrypted.ivB64, encrypted.ctB64)).toEqual({ secret: 'private-value' })
    expect(await unlockEnvelope(original, 'first-password')).toBeDefined()
    expect(JSON.stringify(changed)).not.toContain('private-value')
  })

  it('同一密码创建的保险库使用不同的数据密钥', async () => {
    const a = await createVaultKey('same-password')
    const b = await createVaultKey('same-password')
    const encrypted = await encryptJSON(a.key, 'data')
    await expect(decryptJSON(b.key, encrypted.ivB64, encrypted.ctB64)).rejects.toThrow()
  })

  it('错误密码、被替换的保险库标识和密钥标识均无法解封', async () => {
    const created = await createVaultKey('password')
    const env = { ...created.header, ts: 1, ...await encryptJSON(created.key, 'data') }
    await expect(unlockEnvelope(env, 'wrong')).rejects.toThrow()
    await expect(unlockEnvelope({ ...env, vaultId: crypto.randomUUID() }, 'password')).rejects.toThrow()
    await expect(unlockEnvelope({ ...env, keyId: crypto.randomUUID() }, 'password')).rejects.toThrow()
  })

  it('拒绝恶意 KDF 参数，避免文件导入触发无界计算', async () => {
    const created = await createVaultKey('password')
    await expect(deriveVaultKey('password', { ...created.header.kdf, memKiB: 2 ** 30 })).rejects.toThrow('参数')
    await expect(deriveVaultKey('password', { ...created.header.kdf, timeCost: 100000 })).rejects.toThrow('参数')
    await expect(deriveVaultKey('password', { ...created.header.kdf, saltHex: 'invalid' })).rejects.toThrow('参数')
  })
})

it('恢复封装绑定保险库，错误密钥与篡改不能重设密码', async () => {
  const { generateRecoveryCode, createLocalRecovery, recoverLocalPassword } = await import('../vaultKeys')
  const created = await createVaultKey('password')
  const env = { ...created.header, ts: 1, ...await encryptJSON(created.key, 'data') }
  const code = generateRecoveryCode()
  const record = await createLocalRecovery(env, 'password', code)
  await expect(recoverLocalPassword(env, record, generateRecoveryCode(), 'new-password')).rejects.toThrow()
  await expect(recoverLocalPassword({ ...env, keyId: crypto.randomUUID() }, record, code, 'new-password')).rejects.toThrow()
  await expect(recoverLocalPassword(env, { ...record, ctB64: record.ctB64.slice(4) }, code, 'new-password')).rejects.toThrow()
  const next = await recoverLocalPassword(env, record, code.toLowerCase().replaceAll('-', ' '), 'new-password')
  expect(await decryptJSON(await unlockEnvelope(next, 'new-password'), next.ivB64, next.ctB64)).toBe('data')
})
