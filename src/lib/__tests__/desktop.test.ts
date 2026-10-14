import { afterEach, expect, it, vi } from 'vitest'
import { openExternalUrl } from '../desktop'

const mocks = vi.hoisted(() => ({ openUrl: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => mocks)
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })

it('桌面外链打开失败向调用方返回可展示错误，成功时正常完成', async () => {
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
  mocks.openUrl.mockRejectedValueOnce(new Error('permission denied'))
  await expect(openExternalUrl('https://example.com')).rejects.toThrow('请复制链接')
  mocks.openUrl.mockResolvedValueOnce(undefined)
  await expect(openExternalUrl('https://example.com')).resolves.toBeUndefined()
})

it('不将非 HTTP 链接交给原生 opener，网页继续隔离新窗口', async () => {
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
  await openExternalUrl('file:///private')
  await openExternalUrl('javascript:alert(1)')
  expect(mocks.openUrl).not.toHaveBeenCalled()
  const open = vi.fn()
  vi.stubGlobal('window', { open })
  await openExternalUrl('https://example.com')
  expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
})
