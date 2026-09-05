import { Capacitor } from '@capacitor/core'
import { watch } from 'vue'
import type { Task } from '@/types'
import { tasks } from '@/stores/tasks'
import { toast } from '@/lib/toast'
import {
  ensureDesktopNotificationPermission,
  isTauriDesktop,
  sendDesktopNotification,
} from '@/lib/desktop'

const isNative = Capacitor.isNativePlatform()

async function ln() {
  return import('@capacitor/local-notifications')
}

let timer: ReturnType<typeof setInterval> | undefined
let rescheduleTimer: ReturnType<typeof setTimeout> | null = null

export function remindTsOf(t: Task): number | null {
  if (!t.date || !t.time || t.done) return null
  const [y, m, d] = t.date.split('-').map(Number)
  const [hh, mm] = t.time.split(':').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, hh ?? 0, mm ?? 0).getTime()
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (isNative) {
    const { LocalNotifications } = await ln()
    const status = await LocalNotifications.checkPermissions()
    if (status.display === 'granted') return true
    const req = await LocalNotifications.requestPermissions()
    if (req.display !== 'granted') {
      toast('未授予通知权限，提醒将不可用', 'error')
      return false
    }
    return true
  }
  if (isTauriDesktop()) {
    const granted = await ensureDesktopNotificationPermission()
    if (!granted) toast('未授予系统通知权限，提醒将不可用', 'error')
    return granted
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') {
    toast('通知权限已被拒绝，请在浏览器设置中开启', 'error')
    return false
  }
  const result = await Notification.requestPermission()
  if (result !== 'granted') {
    toast('未授予通知权限，提醒将不可用', 'error')
    return false
  }
  return true
}

function fireWebNotification(t: Task): void {
  try {
    const n = new Notification('任务提醒', {
      body: `${t.title}${t.time ? ` · ${t.time}` : ''}`,
      tag: t.id,
    })
    n.onclick = () => {
      window.focus()
      location.hash = '#/today'
    }
  } catch {
    /* ignore */
  }
}

async function fireNotification(t: Task): Promise<void> {
  if (isTauriDesktop()) {
    await sendDesktopNotification(t.id, '任务提醒', `${t.title}${t.time ? ` · ${t.time}` : ''}`)
    return
  }
  fireWebNotification(t)
}

async function tick(): Promise<void> {
  const now = Date.now()
  for (const t of tasks.value) {
    const rts = remindTsOf(t)
    if (rts === null) continue
    if ((t.lastRemindedTs ?? 0) >= rts) continue
    if (now < rts) continue
    t.lastRemindedTs = rts
    if (!isNative) void fireNotification(t)
  }
}

export function startReminders(): void {
  if (timer !== undefined || typeof window === 'undefined') return
  void tick()
  timer = setInterval(() => void tick(), 30_000)
}

export function stopReminders(): void {
  if (timer !== undefined) {
    clearInterval(timer)
    timer = undefined
  }
}

function nativeIdOf(taskId: string): number {
  let h = 0
  for (const ch of taskId) h = (h * 31 + ch.charCodeAt(0)) | 0
  return h
}

export async function rescheduleNative(): Promise<void> {
  if (!isNative) return
  try {
    const { LocalNotifications } = await ln()
    await LocalNotifications.cancelAll()
    const now = Date.now()
    const upcoming = tasks.value
      .filter((t) => {
        const rts = remindTsOf(t)
        return rts !== null && rts > now && (t.lastRemindedTs ?? 0) < rts
      })
      .slice(0, 60)
      .map((t) => ({
        id: nativeIdOf(t.id),
        title: '任务提醒',
        body: `${t.title} ${t.time}`.trim(),
        schedule: { at: new Date(remindTsOf(t)!), allowWhileIdle: true },
        extra: { taskId: t.id },
      }))
    if (upcoming.length > 0) {
      await LocalNotifications.schedule({ notifications: upcoming })
    }
  } catch {
    /* ignore */
  }
}

export function bindNativeScheduleWatcher(): () => void {
  if (!isNative) return () => {}
  return watch(
    tasks,
    () => {
      if (rescheduleTimer) clearTimeout(rescheduleTimer)
      rescheduleTimer = setTimeout(() => {
        rescheduleTimer = null
        void rescheduleNative()
      }, 800)
    },
    { deep: true },
  )
}
