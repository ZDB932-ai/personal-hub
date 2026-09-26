import { afterEach, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

vi.mock('@/stores/theme', () => ({ resolvedTheme: ref('light') }))
vi.mock('../wallpaperdb', () => ({ getImg: vi.fn(), putImg: vi.fn(), deleteImg: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

it('旧设置保留手动遮罩，畸形值回退并限制参数范围', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
  const { normalizeWallpaper } = await import('../wallpaper')
  expect(normalizeWallpaper({ builtin: 'w2', dim: 40 })).toMatchObject({ builtin: 'w2', dim: 40, autoDim: false })
  expect(normalizeWallpaper({ panelTransparency: 300 })).toMatchObject({ transparentPanels: false, panelTransparency: 90 })
  expect(normalizeWallpaper({ builtin: '../secret', dim: NaN, blur: 300, zoom: 20, x: -10, y: 200 })).toMatchObject({ builtin: null, dim: 65, blur: 16, zoom: 100, x: 0, y: 100 })
})

it('迟到的自定义读取不覆盖内置选择，调节不重复读库，删除失败保留图片', async () => {
  vi.resetModules()
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-wallpaper')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const db = await import('../wallpaperdb')
  let finish!: (blob: Blob) => void
  vi.mocked(db.getImg).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const wallpaper = await import('../wallpaper')
  wallpaper.setBuiltInWallpaper('solar')
  finish(new Blob(['image']))
  await nextTick()
  expect(wallpaper.wallpaperUrl.value).toBe('/wallpapers/solar.jpg')
  wallpaper.updateWallpaper({ dim: 80, blur: 5 })
  await nextTick()
  expect(db.getImg).toHaveBeenCalledTimes(1)
  wallpaper.selectCustomWallpaper()
  expect(wallpaper.wallpaperUrl.value).toBe('blob:test-wallpaper')
  vi.mocked(db.deleteImg).mockRejectedValueOnce(new Error('disk failure'))
  await expect(wallpaper.removeCustomWallpaper()).rejects.toThrow('disk failure')
  expect(wallpaper.wallpaperUrl.value).toBe('blob:test-wallpaper')
  expect(revoke).not.toHaveBeenCalled()
  create.mockRestore()
  revoke.mockRestore()
})
