import { ref, watch } from 'vue'

export type ThemeMode = 'dark' | 'light' | 'system'
export type AccentKey = 'teal' | 'indigo' | 'blue' | 'violet' | 'rose' | 'amber'

const KEY = 'xk.theme.v1'
const LIGHT_BASELINE_KEY = 'xk.theme.light-baseline.v1'

export const ACCENTS: { key: AccentKey; label: string; color: string }[] = [
  { key: 'teal', label: '青碧', color: '#427d72' },
  { key: 'indigo', label: '靛蓝', color: '#6574a0' },
  { key: 'blue', label: '湛蓝', color: '#4f819c' },
  { key: 'violet', label: '紫罗兰', color: '#826e9c' },
  { key: 'rose', label: '玫红', color: '#a96d78' },
  { key: 'amber', label: '琥珀', color: '#a8753e' },
]

function load(): { mode: ThemeMode; accent: AccentKey } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { mode?: ThemeMode; accent?: AccentKey }
      if (!localStorage.getItem(LIGHT_BASELINE_KEY)) {
        localStorage.setItem(LIGHT_BASELINE_KEY, '1')
        return {
          mode: 'light',
          accent: parsed.accent ?? 'teal',
        }
      }
      return {
        mode: parsed.mode ?? 'light',
        accent: parsed.accent ?? 'teal',
      }
    }
  } catch {
    /* ignore */
  }
  return { mode: 'light', accent: 'teal' }
}

const initial = load()
const systemMedia = window.matchMedia('(prefers-color-scheme: light)')

export const themeMode = ref<ThemeMode>(initial.mode)
export const themeAccent = ref<AccentKey>(initial.accent)

function resolved(mode: ThemeMode): 'dark' | 'light' {
  if (mode !== 'system') return mode
  return systemMedia.matches ? 'light' : 'dark'
}

function apply(): void {
  const mode = resolved(themeMode.value)
  document.documentElement.dataset.theme = mode
  document.documentElement.dataset.accent = themeAccent.value
  document.documentElement.style.colorScheme = mode
  document.documentElement.style.background = mode === 'light' ? '#f7f6f2' : '#0b0f14'
}

apply()

watch([themeMode, themeAccent], () => {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ mode: themeMode.value, accent: themeAccent.value }),
    )
  } catch {
    /* ignore */
  }
  apply()
})

systemMedia.addEventListener('change', apply)
