import { afterEach, expect, it, vi } from 'vitest'
import { sendDesktopNotification } from '../desktop'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals() })

it('等待原生通知提交回执，失败不报告成功', async () => {
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
  invoke.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('系统拒绝'))
  expect(await sendDesktopNotification('task', '任务提醒', '内容')).toBe(false)
  invoke.mockResolvedValueOnce(true).mockResolvedValueOnce(undefined)
  expect(await sendDesktopNotification('task', '任务提醒', '内容')).toBe(true)
  expect(invoke).toHaveBeenLastCalledWith('plugin:notification|notify', { options: { title: '任务提醒', body: '内容', extra: { taskId: 'task' } } })
})

it('原生权限未授予时不提交通知', async () => {
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
  invoke.mockResolvedValue(false)
  expect(await sendDesktopNotification('task', '任务提醒', '内容')).toBe(false)
  expect(invoke).toHaveBeenCalledTimes(1)
})
