import { ref } from 'vue'
import { interfaceStyle, themeAccent, themeMode, type AccentKey, type InterfaceStyle, type ThemeMode } from '@/stores/theme'
import { DEFAULT_WALLPAPER, normalizeWallpaper, wallpaperConfig } from './wallpaper'

export const APPEARANCE_SCENES: { id: string; name: string; description: string; style: InterfaceStyle; accent: AccentKey; mode: ThemeMode; wallpaper: string }[] = [
  { id: 'solar', name: '日光工作室', description: '暖瓷 · 珊瑚 · 立体折页', style: 'sunrise', accent: 'coral', mode: 'light', wallpaper: 'solar' },
  { id: 'abyss', name: '深海指挥台', description: '深蓝 · 钴光 · 精密面板', style: 'precision', accent: 'cobalt', mode: 'dark', wallpaper: 'abyss' },
  { id: 'dunes', name: '暮色手帐', description: '沙丘 · 玫红 · 暖色纸面', style: 'sunrise', accent: 'rose', mode: 'light', wallpaper: 'dunes' },
  { id: 'garden', name: '云端花园', description: '兰紫 · 柔光 · 悬浮卡片', style: 'aurora', accent: 'orchid', mode: 'light', wallpaper: 'garden' },
]

function snapshot() {
  return { style: interfaceStyle.value, accent: themeAccent.value, mode: themeMode.value, wallpaper: { ...wallpaperConfig.value } }
}

export const previousAppearance = ref<ReturnType<typeof snapshot> | null>(null)

export function applyAppearanceScene(id: string): void {
  const scene = APPEARANCE_SCENES.find(item => item.id === id)
  if (!scene) return
  previousAppearance.value = snapshot()
  interfaceStyle.value = scene.style
  themeAccent.value = scene.accent
  themeMode.value = scene.mode
  wallpaperConfig.value = { ...DEFAULT_WALLPAPER, builtin: scene.wallpaper }
}

export function undoAppearanceScene(): void {
  const previous = previousAppearance.value
  if (!previous) return
  interfaceStyle.value = previous.style
  themeAccent.value = previous.accent
  themeMode.value = previous.mode
  wallpaperConfig.value = normalizeWallpaper(previous.wallpaper)
  previousAppearance.value = null
}
