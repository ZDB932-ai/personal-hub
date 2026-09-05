const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx === -1) throw new Error('密钥包含无效的 Base32 字符')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'

export interface TotpConfig {
  secret: string
  digits: number
  period: number
  algorithm: TotpAlgorithm
}

const ALGO_MAP: Record<TotpAlgorithm, 'SHA-1' | 'SHA-256' | 'SHA-512'> = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA512: 'SHA-512',
}

export function parseTotpInput(input: string): TotpConfig {
  const s = input.trim()
  if (s.toLowerCase().startsWith('otpauth://')) {
    let url: URL
    try {
      url = new URL(s)
    } catch {
      throw new Error('otpauth 链接格式不正确')
    }
    if (!url.host.toLowerCase().includes('totp')) throw new Error('仅支持 totp 类型的密钥链接')
    const p = url.searchParams
    const secret = p.get('secret')
    if (!secret) throw new Error('otpauth 链接缺少 secret 参数')
    const digits = Number(p.get('digits') ?? 6) || 6
    const period = Number(p.get('period') ?? 30) || 30
    const rawAlg = (p.get('algorithm') ?? 'SHA1').toUpperCase().replace('-', '')
    const algorithm: TotpAlgorithm =
      rawAlg === 'SHA256' ? 'SHA256' : rawAlg === 'SHA512' ? 'SHA512' : 'SHA1'
    return { secret, digits: Math.min(Math.max(digits, 6), 10), period: Math.min(Math.max(period, 15), 120), algorithm }
  }
  return { secret: s, digits: 6, period: 30, algorithm: 'SHA1' }
}

export async function generateTotp(
  cfg: TotpConfig,
  now = Date.now(),
): Promise<{ code: string; remaining: number }> {
  const keyBytes = base32Decode(cfg.secret)
  const counter = Math.floor(now / 1000 / cfg.period)
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setUint32(0, Math.floor(counter / 2 ** 32))
  view.setUint32(4, counter >>> 0)
  const algo = ALGO_MAP[cfg.algorithm] ?? 'SHA-1'
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: algo }, false, [
    'sign',
  ])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf))
  const offset = mac[mac.length - 1] & 0x0f
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff)
  const code = String(binary % 10 ** cfg.digits).padStart(cfg.digits, '0')
  const remaining = cfg.period - (Math.floor(now / 1000) % cfg.period)
  return { code, remaining }
}
