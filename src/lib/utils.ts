import type { ProfileInfo, TaskRepeat, VaultDraft } from '@/types'
import { recoverStorageTransaction } from './storageTransaction'
import { isRepositoryKey, readRepository } from './vaultRepository'

recoverStorageTransaction()

export function readJSON<T>(key: string): T | null {
  if (isRepositoryKey(key)) return readRepository<T>(key)
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeJSON(key: string, value: unknown): void {
  if (isRepositoryKey(key)) throw new Error('加密数据必须通过事务存储接口保存')
  localStorage.setItem(key, JSON.stringify(value))
}

export function uid(): string {
  return crypto.randomUUID()
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ts)
}

export function passwordStrength(pw: string): {
  score: number
  label: string
  color: string
} {
  if (!pw) return { score: -1, label: '', color: '' }
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12 && /[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: '弱', color: 'bg-danger' }
  if (score === 2) return { score, label: '中', color: 'bg-warn' }
  return { score, label: '强', color: 'bg-ok' }
}

export function randomPassword(length = 16): string {
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const symbols = '!@#$%&*?'
  const all = lower + upper + digits + symbols
  const pick = (chars: string): string => {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return chars[buf[0] % chars.length]
  }
  const result = [pick(lower), pick(upper), pick(digits), pick(symbols)]
  for (let i = result.length; i < length; i++) {
    result.push(pick(all))
  }
  for (let i = result.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    const j = buf[0] % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result.join('')
}

export const FILTER_CATEGORIES = [
  '全部',
  '社交',
  '邮箱',
  '开发',
  '金融',
  '购物',
  '工作',
  '其他',
] as const

export const ENTRY_CATEGORIES = FILTER_CATEGORIES.filter((c) => c !== '全部')

export const CATEGORY_BADGE: Record<string, string> = {
  社交: 'badge badge-sky',
  邮箱: 'badge badge-amber',
  开发: 'badge badge-emerald',
  金融: 'badge badge-rose',
  购物: 'badge badge-fuchsia',
  工作: 'badge badge-cyan',
  其他: 'badge badge-slate',
}

export const AVATAR_GRADIENTS = ['bg-primary']

export function avatarGradient(seed: string): string {
  const s = String(seed ?? '')
  if (!s) return AVATAR_GRADIENTS[0]
  let hash = 0
  for (const ch of s) hash += ch.charCodeAt(0)
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}

export function emptyProfile(): ProfileInfo {
  return {
    name: '',
    nickname: '',
    bio: '',
    email: '',
    phone: '',
    birthday: '',
    location: '',
    github: '',
    blog: '',
  }
}

export function emptyDraft(): VaultDraft {
  return {
    title: '',
    username: '',
    password: '',
    url: '',
    notes: '',
    category: '其他',
    totp: '',
  }
}

export function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayYMD(): string {
  return toYMD(new Date())
}

export function shiftYMD(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toYMD(d)
}

export function weekStartYMD(dateStr = todayYMD()): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return toYMD(d)
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => shiftYMD(weekStart, index))
}

export function nextOccurrence(dateStr: string, repeat: TaskRepeat): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (repeat === 'daily') {
    d.setDate(d.getDate() + 1)
  } else if (repeat === 'weekly') {
    d.setDate(d.getDate() + 7)
  } else if (repeat === 'workdays') {
    do {
      d.setDate(d.getDate() + 1)
    } while (d.getDay() === 0 || d.getDay() === 6)
  }
  return toYMD(d)
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function weekdayLabel(dateStr: string): string {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return names[new Date(`${dateStr}T00:00:00`).getDay()] ?? ''
}
