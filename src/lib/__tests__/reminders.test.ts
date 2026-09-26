import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { Task } from '@/types'

const mock = vi.hoisted(() => ({ native: true, getPending: vi.fn(), schedule: vi.fn(), cancel: vi.fn(), cancelAll: vi.fn(), checkPermissions: vi.fn(), checkExactNotificationSetting: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => mock.native } }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: mock }))
vi.mock('@/stores/tasks', async () => ({ tasks: (await import('vue')).ref([]) }))
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }))
vi.mock('@/lib/desktop', () => ({ isTauriDesktop: () => false, sendDesktopNotification: vi.fn(), ensureDesktopNotificationPermission: vi.fn() }))
let stop: (() => void) | undefined

function task(id: string, minute = 1): Task {
  return { id, title: '私密任务正文', notes: '', date: '2030-01-01', time: `10:${String(minute).padStart(2, '0')}`, priority: 2, repeat: 'none', done: false, tags: [], subtasks: [], createdAt: 1, updatedAt: 1 }
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2030, 0, 1, 10, 0))
  mock.native = true
  mock.getPending.mockResolvedValue({ notifications: [] })
  mock.schedule.mockResolvedValue(undefined)
  mock.cancel.mockResolvedValue(undefined)
  mock.cancelAll.mockResolvedValue(undefined)
  mock.checkPermissions.mockResolvedValue({ display: 'granted' })
  mock.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' })
})

afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })

it('锁定并清空内存后保留锁定前的待安排提醒，正文不泄露任务内容', async () => {
  const { tasks } = await import('@/stores/tasks')
  const reminders = await import('../reminders')
  const ready = ref(true)
  tasks.value = [task('first')]
  stop = reminders.bindNativeScheduleWatcher(() => ready.value)
  ready.value = false
  tasks.value = []
  await vi.advanceTimersByTimeAsync(800)
  expect(mock.schedule).toHaveBeenCalledTimes(1)
  expect(mock.schedule.mock.calls[0]![0].notifications[0]).toMatchObject({ body: '有任务到时间啦，请解锁 Personal Hub 查看。', extra: { taskId: 'first' } })
  await reminders.rescheduleNative()
  expect(mock.cancelAll).not.toHaveBeenCalled()
  expect(mock.cancel).not.toHaveBeenCalled()
})

it('解锁后删除全部任务会清理系统队列，启动锁定状态不会清理', async () => {
  const { tasks } = await import('@/stores/tasks')
  const reminders = await import('../reminders')
  const ready = ref(false)
  mock.getPending.mockResolvedValue({ notifications: [{ id: 7 }] })
  stop = reminders.bindNativeScheduleWatcher(() => ready.value)
  await vi.advanceTimersByTimeAsync(900)
  expect(mock.getPending).not.toHaveBeenCalled()
  tasks.value = []
  ready.value = true
  await vi.advanceTimersByTimeAsync(900)
  expect(mock.cancel).toHaveBeenCalledWith({ notifications: [{ id: 7 }] })
})

it('超过上限时选最近60条，哈希碰撞仍保留独立通知', async () => {
  const { tasks } = await import('@/stores/tasks')
  const reminders = await import('../reminders')
  tasks.value = Array.from({ length: 61 }, (_, i) => ({ ...task(`later-${i}`), date: '2030-01-02' }))
  tasks.value.push(task('Aa'), task('BB', 2))
  stop = reminders.bindNativeScheduleWatcher(() => true)
  await reminders.rescheduleNative()
  const notifications = mock.schedule.mock.calls[0]![0].notifications
  expect(notifications).toHaveLength(60)
  expect(notifications.slice(0, 2).map((item: { extra: { taskId: string } }) => item.extra.taskId)).toEqual(['Aa', 'BB'])
  expect(new Set(notifications.map((item: { id: number }) => item.id)).size).toBe(60)
})

it('安排失败保留旧提醒并支持重试，精确闹钟未授权时提示', async () => {
  const { tasks } = await import('@/stores/tasks')
  const reminders = await import('../reminders')
  tasks.value = [task('first')]
  mock.getPending.mockResolvedValue({ notifications: [{ id: 7 }] })
  mock.schedule.mockRejectedValueOnce(new Error('系统拒绝'))
  stop = reminders.bindNativeScheduleWatcher(() => true)
  await reminders.rescheduleNative()
  expect(reminders.reminderError.value).toContain('系统拒绝')
  expect(mock.cancel).not.toHaveBeenCalled()
  mock.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' })
  await reminders.retryReminders()
  expect(mock.cancel).toHaveBeenCalled()
  expect(reminders.reminderError.value).toContain('可能延迟')
})

it('重置取消防抖中的计划，避免清空后再次添加旧提醒', async () => {
  const { tasks } = await import('@/stores/tasks')
  const reminders = await import('../reminders')
  tasks.value = [task('first')]
  stop = reminders.bindNativeScheduleWatcher(() => true)
  await reminders.clearNativeReminders()
  await vi.advanceTimersByTimeAsync(900)
  expect(mock.cancelAll).toHaveBeenCalledTimes(1)
  expect(mock.schedule).not.toHaveBeenCalled()
})

it('浏览器通知失败不标记已提醒，重试成功后才标记', async () => {
  mock.native = false
  const { tasks } = await import('@/stores/tasks')
  const reminders = await import('../reminders')
  const notification = vi.fn(function () {})
  Object.assign(notification, { permission: 'denied' })
  vi.stubGlobal('Notification', notification)
  tasks.value = [task('due', 0)]
  await reminders.retryReminders()
  expect(tasks.value[0]!.lastRemindedTs).toBeUndefined()
  Object.assign(notification, { permission: 'granted' })
  await reminders.retryReminders()
  expect(tasks.value[0]!.lastRemindedTs).toBe(Date.now())
  expect(reminders.reminderError.value).toBe('')
})
