import { describe, expect, it } from 'vitest'
import { base32Decode, generateTotp, parseTotpInput } from '@/lib/totp'

const BLOCK = 'GEZDGNBVGY3TQOJQ'
const RFC_SECRET_SHA1 = BLOCK.repeat(2)
const RFC_SECRET_SHA256 = BLOCK.repeat(3) + 'GEZA'
const RFC_SECRET_SHA512 = BLOCK.repeat(6) + 'GEZDGNA'

const SHA1_CASES: Array<[number, string]> = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
]

describe('generateTotp（RFC 6238 官方向量）', () => {
  it.each(SHA1_CASES)('SHA1 T=%is → %s', (t, expected) => {
    return expect(
      generateTotp({ secret: RFC_SECRET_SHA1, digits: 8, period: 30, algorithm: 'SHA1' }, t * 1000),
    ).resolves.toMatchObject({ code: expected })
  })

  it('SHA256 T=59s → 46119246', () => {
    return expect(
      generateTotp({ secret: RFC_SECRET_SHA256, digits: 8, period: 30, algorithm: 'SHA256' }, 59000),
    ).resolves.toMatchObject({ code: '46119246' })
  })

  it('SHA512 T=59s → 90693936', () => {
    return expect(
      generateTotp({ secret: RFC_SECRET_SHA512, digits: 8, period: 30, algorithm: 'SHA512' }, 59000),
    ).resolves.toMatchObject({ code: '90693936' })
  })

  it('remaining 计算周期内剩余秒数', async () => {
    const { remaining } = await generateTotp(
      { secret: RFC_SECRET_SHA1, digits: 6, period: 30, algorithm: 'SHA1' },
      59000,
    )
    expect(remaining).toBe(1)
  })
})

describe('base32Decode', () => {
  it('解码 GEZDGNBV → "12345"', () => {
    expect(Array.from(base32Decode('GEZDGNBV'))).toEqual([0x31, 0x32, 0x33, 0x34, 0x35])
  })

  it('忽略空格与连字符，大小写不敏感', () => {
    expect(Array.from(base32Decode('gezd gnbv'))).toEqual(Array.from(base32Decode('GEZDGNBV')))
    expect(Array.from(base32Decode('GEZD-GNBV'))).toEqual(Array.from(base32Decode('GEZDGNBV')))
  })

  it('无效字符抛错', () => {
    expect(() => base32Decode('ABC1')).toThrow()
  })
})

describe('parseTotpInput', () => {
  it('裸密钥使用默认 6 位/30 秒/SHA1', () => {
    expect(parseTotpInput(' gezdgnbvgy3tqojq ')).toEqual({
      secret: 'gezdgnbvgy3tqojq',
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
    })
  })

  it('解析 otpauth 链接参数', () => {
    const cfg = parseTotpInput(
      'otpauth://totp/Alice?secret=JBSWY3DPEHPK3PXP&digits=8&period=60&algorithm=SHA256',
    )
    expect(cfg).toEqual({ secret: 'JBSWY3DPEHPK3PXP', digits: 8, period: 60, algorithm: 'SHA256' })
  })

  it('越界参数收敛到 6-10 位 / 15-120 秒', () => {
    const small = parseTotpInput('otpauth://totp/x?secret=ABC&digits=4&period=5')
    expect(small.digits).toBe(6)
    expect(small.period).toBe(15)
    const big = parseTotpInput('otpauth://totp/x?secret=ABC&digits=12&period=300')
    expect(big.digits).toBe(10)
    expect(big.period).toBe(120)
  })

  it('拒绝非 totp 类型与缺少 secret 的链接', () => {
    expect(() => parseTotpInput('otpauth://hotp/x?secret=ABC')).toThrow()
    expect(() => parseTotpInput('otpauth://totp/x?digits=6')).toThrow()
  })
})
