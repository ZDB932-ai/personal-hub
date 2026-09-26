import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ desktop: vi.fn(), confirm: vi.fn(), toast: vi.fn() }))
vi.mock('../desktop', () => ({ isTauriDesktop: mocks.desktop, prepareDesktopDialog: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: mocks.confirm }))
vi.mock('../toast', () => ({ toast: mocks.toast }))
import { confirmAction } from '../confirmAction'

beforeEach(() => { vi.clearAllMocks() })

it('桌面等待用户结果，取消和失败都不批准操作', async () => {
  mocks.desktop.mockReturnValue(true)
  let answer!: (value: boolean) => void
  mocks.confirm.mockReturnValue(new Promise<boolean>(resolve => { answer = resolve }))
  let settled = false
  const pending = confirmAction('删除测试数据').then(value => { settled = true; return value })
  await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalled())
  expect(settled).toBe(false)
  answer(false)
  expect(await pending).toBe(false)
  mocks.confirm.mockRejectedValue(new Error('ACL'))
  expect(await confirmAction('删除测试数据')).toBe(false)
  expect(mocks.toast).toHaveBeenCalled()
  mocks.confirm.mockResolvedValue(true)
  expect(await confirmAction('删除测试数据')).toBe(true)
})
