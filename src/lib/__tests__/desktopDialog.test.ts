import { afterEach, expect, it, vi } from 'vitest'
const win = vi.hoisted(() => ({ show: vi.fn(), unminimize: vi.fn(), setFocus: vi.fn(), isVisible: vi.fn(), isMinimized: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => win }))
import { prepareDesktopDialog } from '../desktop'
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })
it('弹窗前恢复主窗口，不能恢复时明确失败', async () => {
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
  win.isVisible.mockResolvedValue(true)
  win.isMinimized.mockResolvedValue(false)
  await prepareDesktopDialog()
  expect(win.show.mock.invocationCallOrder[0]).toBeLessThan(win.unminimize.mock.invocationCallOrder[0]!)
  expect(win.unminimize.mock.invocationCallOrder[0]).toBeLessThan(win.setFocus.mock.invocationCallOrder[0]!)
  win.isVisible.mockResolvedValue(false)
  await expect(prepareDesktopDialog()).rejects.toThrow('无法显示主窗口')
  win.show.mockRejectedValue(new Error('ACL'))
  await expect(prepareDesktopDialog()).rejects.toThrow('无法显示主窗口')
})
