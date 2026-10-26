import { ref, watch } from 'vue'
import { INTERFACE_STYLES, type InterfaceStyle } from '@/lib/interfaceStyles'

export { INTERFACE_STYLES, type InterfaceStyle } from '@/lib/interfaceStyles'

export type ThemeMode = 'dark' | 'light' | 'system'
export type AccentKey = 'teal' | 'indigo' | 'blue' | 'violet' | 'rose' | 'amber' | 'coral' | 'cobalt' | 'orchid'
const KEY = 'xk.theme.v1'
const LIGHT_BASELINE_KEY = 'xk.theme.light-baseline.v1'

export const ACCENTS: { key: AccentKey; label: string; color: string }[] = [
  { key: 'teal', label: '青碧', color: '#427d72' },
  { key: 'indigo', label: '靛蓝', color: '#6574a0' },
  { key: 'blue', label: '湛蓝', color: '#4f819c' },
  { key: 'violet', label: '紫罗兰', color: '#826e9c' },
  { key: 'rose', label: '玫红', color: '#a96d78' },
  { key: 'amber', label: '琥珀', color: '#a8753e' },
  { key: 'coral', label: '珊瑚', color: '#bb4930' },
  { key: 'cobalt', label: '钴蓝', color: '#385bd6' },
  { key: 'orchid', label: '兰紫', color: '#8847bd' },
]

function load(): { mode: ThemeMode; accent: AccentKey; style: InterfaceStyle } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { mode?: ThemeMode; accent?: AccentKey; style?: InterfaceStyle }
      const accent = ACCENTS.find((item) => item.key === parsed.accent)?.key ?? 'teal'
      const style = INTERFACE_STYLES.find((item) => item.key === parsed.style)?.key ?? 'classic'
      if (!localStorage.getItem(LIGHT_BASELINE_KEY)) {
        localStorage.setItem(LIGHT_BASELINE_KEY, '1')
        return {
          mode: 'light',
          accent,
          style,
        }
      }
      return {
        mode: parsed.mode === 'dark' || parsed.mode === 'system' ? parsed.mode : 'light',
        accent,
        style,
      }
    }
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(LIGHT_BASELINE_KEY, '1')
  } catch {}
  return { mode: 'light', accent: 'teal', style: 'classic' }
}

const initial = load()
const systemMedia = window.matchMedia('(prefers-color-scheme: light)')

export const themeMode = ref<ThemeMode>(initial.mode)
export const themeAccent = ref<AccentKey>(initial.accent)
export const interfaceStyle = ref<InterfaceStyle>(initial.style)
export const previousInterfaceAppearance = ref<{ style: InterfaceStyle; mode: ThemeMode; accent: AccentKey } | null>(null)

export function selectInterfaceStyle(style: InterfaceStyle): void {
  const preset = INTERFACE_STYLES.find((item) => item.key === style)
  if (!preset) return
  interfaceStyle.value = preset.key
}

function resolved(mode: ThemeMode): 'dark' | 'light' {
  if (mode !== 'system') return mode
  return systemMedia.matches ? 'light' : 'dark'
}

function apply(): void {
  const mode = resolved(themeMode.value)
  resolvedTheme.value = mode
  document.documentElement.dataset.theme = mode
  document.documentElement.dataset.accent = themeAccent.value
  document.documentElement.dataset.interface = interfaceStyle.value
  document.documentElement.style.colorScheme = mode
  document.documentElement.style.background = 'var(--tk-body)'
}

export const resolvedTheme = ref(resolved(initial.mode))

apply()

watch([themeMode, themeAccent, interfaceStyle], () => {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ mode: themeMode.value, accent: themeAccent.value, style: interfaceStyle.value }),
    )
  } catch {
    /* ignore */
  }
  apply()
})

systemMedia.addEventListener('change', apply)
