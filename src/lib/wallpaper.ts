import { computed, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { deleteImg, getImg, putImg } from './wallpaperdb'
import { resolvedTheme } from '@/stores/theme'
import { BUILT_IN_WALLPAPERS } from './wallpaperCatalog'

export { BUILT_IN_WALLPAPERS } from './wallpaperCatalog'
const KEY = 'xk.wallpaper.v1'

export interface WallpaperConfig {
  builtin: string | null
  custom: boolean
  dim: number
  autoDim: boolean
  blur: number
  x: number
  y: number
  zoom: number
  readingSurface: boolean
  transparentPanels: boolean
  panelTransparency: number
}

export const DEFAULT_WALLPAPER: WallpaperConfig = {
  builtin: null, custom: false, dim: 65, autoDim: true, blur: 0, x: 50, y: 50, zoom: 100, readingSurface: true, transparentPanels: false, panelTransparency: 30,
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
}

export function normalizeWallpaper(value: unknown): WallpaperConfig {
  const raw = value && typeof value === 'object' ? value as Partial<WallpaperConfig> : {}
  return {
    builtin: BUILT_IN_WALLPAPERS.some(item => item.id === raw.builtin) ? raw.builtin! : null,
    custom: raw.custom === true,
    dim: bounded(raw.dim, 65, 0, 90),
    autoDim: typeof raw.autoDim === 'boolean' ? raw.autoDim : raw.dim === undefined,
    blur: bounded(raw.blur, 0, 0, 16),
    x: bounded(raw.x, 50, 0, 100),
    y: bounded(raw.y, 50, 0, 100),
    zoom: bounded(raw.zoom, 100, 100, 150),
    readingSurface: raw.readingSurface !== false,
    transparentPanels: raw.transparentPanels === true,
    panelTransparency: bounded(raw.panelTransparency, 30, 0, 90),
  }
}

function load(): WallpaperConfig {
  try { return normalizeWallpaper(JSON.parse(localStorage.getItem(KEY) || '{}')) } catch { return { ...DEFAULT_WALLPAPER } }
}

export const wallpaperConfig = ref<WallpaperConfig>(load())
export const customWallpaperUrl = ref<string | null>(null)
export const wallpaperError = ref('')
export const wallpaperReady = ref(false)
export const hasCustomImage = computed(() => customWallpaperUrl.value !== null)
export const wallpaperUrl = computed(() => wallpaperConfig.value.custom
  ? customWallpaperUrl.value
  : BUILT_IN_WALLPAPERS.find(item => item.id === wallpaperConfig.value.builtin)?.src ?? null)
export const wallpaperName = computed(() => wallpaperConfig.value.custom ? '我的图片'
  : BUILT_IN_WALLPAPERS.find(item => item.id === wallpaperConfig.value.builtin)?.name ?? '纯色空间')
export const effectiveWallpaperDim = computed(() => wallpaperConfig.value.autoDim
  ? resolvedTheme.value === 'dark' ? 48 : 30 : wallpaperConfig.value.dim)
export const wallpaperImageStyle = computed<CSSProperties>(() => ({
  backgroundImage: wallpaperUrl.value ? `url("${wallpaperUrl.value}")` : undefined,
  backgroundPosition: `${wallpaperConfig.value.x}% ${wallpaperConfig.value.y}%`,
  filter: wallpaperConfig.value.blur ? `blur(${wallpaperConfig.value.blur}px)` : undefined,
  transform: `scale(${wallpaperConfig.value.zoom / 100})`,
}))
export const wallpaperPanelStyle = computed<CSSProperties>(() => ({
  '--panel-fill': `${100 - wallpaperConfig.value.panelTransparency}%`,
}))

let customRevision = 0

function replaceCustomUrl(blob: Blob | null): void {
  const previous = customWallpaperUrl.value
  customWallpaperUrl.value = blob ? URL.createObjectURL(blob) : null
  if (previous) URL.revokeObjectURL(previous)
}

export async function refreshCustomWallpaper(): Promise<void> {
  const revision = ++customRevision
  try {
    const blob = await getImg('custom')
    if (revision !== customRevision) return
    replaceCustomUrl(blob ?? null)
    wallpaperError.value = !blob && wallpaperConfig.value.custom ? '自定义图片已不存在，请重新上传或选择内置壁纸。' : ''
  } catch {
    if (revision === customRevision) wallpaperError.value = '无法读取本机图片，可重试或选择内置壁纸。'
  } finally {
    if (revision === customRevision) wallpaperReady.value = true
  }
}

export function updateWallpaper(changes: Partial<WallpaperConfig>): void {
  wallpaperConfig.value = normalizeWallpaper({ ...wallpaperConfig.value, ...changes })
}

export function setBuiltInWallpaper(id: string | null): void {
  wallpaperError.value = ''
  updateWallpaper({ builtin: id, custom: false })
}

export function selectCustomWallpaper(): void {
  if (hasCustomImage.value) updateWallpaper({ builtin: null, custom: true })
}

export async function validateWallpaper(file: File): Promise<void> {
  if (file.size > 8 * 1024 * 1024) throw new Error('图片不能超过 8MB')
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('请选择 JPG、PNG、WebP 或 AVIF 静态图片')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('empty image')
    if (image.naturalWidth * image.naturalHeight > 32_000_000) throw new Error('图片分辨率过高，请缩小到 3200 万像素以内')
  } catch (error) {
    if (error instanceof Error && error.message.includes('3200')) throw error
    throw new Error('无法解码这张图片，请换一张有效的静态图片')
  } finally { URL.revokeObjectURL(url) }
}

export async function setCustomWallpaper(file: File): Promise<void> {
  await validateWallpaper(file)
  await putImg('custom', file)
  ++customRevision
  replaceCustomUrl(file)
  wallpaperReady.value = true
  wallpaperError.value = ''
  updateWallpaper({ builtin: null, custom: true, x: 50, y: 50, zoom: 100 })
}

export async function removeCustomWallpaper(): Promise<void> {
  await deleteImg('custom')
  ++customRevision
  replaceCustomUrl(null)
  wallpaperError.value = ''
  if (wallpaperConfig.value.custom) updateWallpaper({ custom: false, builtin: null })
}

export function setWallpaperDim(dim: number): void { updateWallpaper({ dim, autoDim: false }) }

export function resetWallpaperAdjustments(): void {
  updateWallpaper({ ...DEFAULT_WALLPAPER, builtin: wallpaperConfig.value.builtin, custom: wallpaperConfig.value.custom })
}

watch(wallpaperConfig, cfg => {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)) } catch { wallpaperError.value = '外观设置暂时无法保存，当前会话仍可使用。' }
}, { deep: true })

void refreshCustomWallpaper()
