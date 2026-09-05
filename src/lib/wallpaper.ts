import { ref, watch } from 'vue'
import { deleteImg, getImg, putImg } from './wallpaperdb'
import { writeJSON } from './utils'

const KEY = 'xk.wallpaper.v1'

export interface WallpaperConfig {
  builtin: string | null
  custom: boolean
  dim: number
}

export const BUILT_IN_WALLPAPERS = [
  { id: 'w1', name: '极光' },
  { id: 'w2', name: '暮色' },
  { id: 'w3', name: '海洋' },
  { id: 'w4', name: '日出' },
  { id: 'w5', name: '森林' },
  { id: 'w6', name: '石墨' },
]

function load(): WallpaperConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WallpaperConfig>
      return {
        builtin: parsed.builtin ?? null,
        custom: parsed.custom ?? false,
        dim: typeof parsed.dim === 'number' ? parsed.dim : 65,
      }
    }
  } catch {
    /* ignore */
  }
  return { builtin: null, custom: false, dim: 65 }
}

export const wallpaperConfig = ref<WallpaperConfig>(load())

export const wallpaperUrl = ref<string | null>(null)

export const hasCustomImage = ref(wallpaperConfig.value.custom)

let currentObjectUrl: string | null = null

function releaseObjectUrl(): void {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
}

async function applyWallpaper(): Promise<void> {
  const cfg = wallpaperConfig.value
  releaseObjectUrl()
  if (cfg.custom) {
    try {
      const blob = await getImg('custom')
      if (blob) {
        currentObjectUrl = URL.createObjectURL(blob)
        wallpaperUrl.value = currentObjectUrl
        return
      }
    } catch {
      /* ignore */
    }
    wallpaperUrl.value = null
    return
  }
  wallpaperUrl.value = cfg.builtin ? `/wallpapers/${cfg.builtin}.jpg` : null
}

export function setBuiltInWallpaper(id: string | null): void {
  wallpaperConfig.value = { ...wallpaperConfig.value, builtin: id, custom: false }
}

export async function setCustomWallpaper(file: File): Promise<void> {
  if (file.size > 8 * 1024 * 1024) throw new Error('图片不能超过 8MB')
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
  await putImg('custom', file)
  hasCustomImage.value = true
  wallpaperConfig.value = { ...wallpaperConfig.value, builtin: null, custom: true }
}

export async function removeCustomWallpaper(): Promise<void> {
  await deleteImg('custom').catch(() => {})
  hasCustomImage.value = false
  if (wallpaperConfig.value.custom) {
    wallpaperConfig.value = { ...wallpaperConfig.value, custom: false, builtin: null }
  }
}

export function setWallpaperDim(dim: number): void {
  wallpaperConfig.value = { ...wallpaperConfig.value, dim }
}

watch(
  wallpaperConfig,
  () => {
    try {
      writeJSON(KEY, { ...wallpaperConfig.value })
    } catch {
      /* ignore */
    }
    void applyWallpaper()
  },
  { deep: true },
)

void applyWallpaper()
