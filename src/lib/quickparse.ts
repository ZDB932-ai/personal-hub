import { toYMD } from './utils'

const WEEK_MAP: Record<string, number> = { 日: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }

export interface ParsedQuick {
  title: string
  date?: string
  time?: string
  tags: string[]
}

export function parseQuickInput(raw: string, base = new Date()): ParsedQuick {
  let s = raw.trim()
  const tags: string[] = []
  s = s.replace(/#([\p{L}\p{N}_-]+)/gu, (_, t: string) => {
    if (tags.length < 5 && !tags.includes(t)) tags.push(t)
    return ''
  })

  let date: string | undefined
  let time: string | undefined

  const today = new Date(base.getFullYear(), base.getMonth(), base.getDate())

  if (/大后天/.test(s)) {
    const d = new Date(today)
    d.setDate(d.getDate() + 3)
    date = toYMD(d)
    s = s.replace('大后天', '')
  } else if (/后天/.test(s)) {
    const d = new Date(today)
    d.setDate(d.getDate() + 2)
    date = toYMD(d)
    s = s.replace('后天', '')
  } else if (/明天/.test(s)) {
    const d = new Date(today)
    d.setDate(d.getDate() + 1)
    date = toYMD(d)
    s = s.replace('明天', '')
  } else if (/今天|今晚/.test(s)) {
    date = toYMD(today)
    s = s.replace(/今天|今晚/, '')
  }

  if (!date) {
    const m = s.match(/(下{0,2})(?:周|礼拜|星期)([一二三四五六日天])/)
    if (m) {
      const target = WEEK_MAP[m[2] === '天' ? '日' : m[2]] ?? 1
      const d = new Date(today)
      let delta = (target - d.getDay() + 7) % 7
      if (delta === 0) delta = 7
      if (m[1]) delta += 7
      d.setDate(d.getDate() + delta)
      date = toYMD(d)
      s = s.replace(m[0], '')
    }
  }

  if (!date) {
    const m = s.match(/(\d{1,2})月(\d{1,2})[日号]/)
    if (m) {
      const mo = Number(m[1])
      const day = Number(m[2])
      let d = new Date(base.getFullYear(), mo - 1, day)
      if (d < today) d = new Date(base.getFullYear() + 1, mo - 1, day)
      if (!Number.isNaN(d.getTime())) {
        date = toYMD(d)
        s = s.replace(m[0], '')
      }
    }
  }

  const tm = s.match(
    /(上午|早上|清晨|下午|傍晚|晚上|夜里|中午)?\s*(\d{1,2})[点:：时]\s*(半|\d{1,2})?\s*分?/,
  )
  if (tm) {
    let hh = Number(tm[2])
    const mm = tm[3] === '半' ? 30 : Number(tm[3] ?? 0)
    const prefix = tm[1]
    if ((prefix === '下午' || prefix === '傍晚' || prefix === '晚上' || prefix === '夜里') && hh < 12) {
      hh += 12
    }
    if (prefix === '中午' && hh < 12) hh = 12
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
      s = s.replace(tm[0], '')
    }
  }

  const title = s.replace(/\s+/g, ' ').trim()
  return { title, date, time, tags }
}
