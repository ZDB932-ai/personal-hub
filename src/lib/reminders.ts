import { Capacitor } from '@capacitor/core'
import { ref, watch } from 'vue'
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
let canSchedule = () => false
let nativeQueue: Promise<void> = Promise.resolve()
let nativeGeneration = 0
let ticking = false
let webGeneration = 0
export const reminderError = ref('')

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

function fireWebNotification(t: Task): boolean {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
    const n = new Notification('任务提醒', {
      body: `${t.title}${t.time ? ` · ${t.time}` : ''}`,
      tag: t.id,
    })
    n.onclick = () => {
      window.focus()
      location.hash = '#/today'
    }
    return true
  } catch {
    return false
  }
}

async function fireNotification(t: Task): Promise<boolean> {
  if (isTauriDesktop()) {
    const sent = await sendDesktopNotification(t.id, '任务提醒', `${t.title}${t.time ? ` · ${t.time}` : ''}`)
    if (sent) void import('@tauri-apps/api/event').then(({ emitTo }) => emitTo('pet', 'pet://reminder')).catch(() => {})
    return sent
  }
  return fireWebNotification(t)
}

async function tick(): Promise<void> {
  if (ticking || isNative) return
  ticking = true
  const generation = webGeneration
  try {
    const now = Date.now()
    for (const t of tasks.value) {
      if (generation !== webGeneration) break
      const rts = remindTsOf(t)
      if (rts === null) continue
      if ((t.lastRemindedTs ?? 0) >= rts) continue
      if (now < rts) continue
      if (await fireNotification(t)) {
        t.lastRemindedTs = rts
        reminderError.value = ''
      } else {
        reminderError.value = '任务提醒未发送，请检查系统通知权限后重试。'
        break
      }
    }
  } finally { ticking = false }
}

export function startReminders(): void {
  if (timer !== undefined || typeof window === 'undefined') return
  void tick()
  timer = setInterval(() => void tick(), 30_000)
}

export function stopReminders(): void {
  webGeneration++
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

function nativePlan() {
    const now = Date.now()
    const ids = new Set<number>()
    return tasks.value
      .filter((t) => {
        const rts = remindTsOf(t)
        return rts !== null && rts > now && (t.lastRemindedTs ?? 0) < rts
      })
      .sort((a, b) => remindTsOf(a)! - remindTsOf(b)! || a.id.localeCompare(b.id))
      .slice(0, 60)
      .map((t) => {
        let id = nativeIdOf(t.id) & 0x7fffffff
        while (ids.has(id)) id = (id + 1) & 0x7fffffff
        ids.add(id)
        return {
        id,
        title: '任务提醒',
        body: '有任务到时间啦，请解锁 Personal Hub 查看。',
        schedule: { at: new Date(remindTsOf(t)!), allowWhileIdle: true },
        extra: { taskId: t.id },
      } })
}

function schedulePlan(upcoming: ReturnType<typeof nativePlan>): Promise<void> {
  const generation = nativeGeneration
  nativeQueue = nativeQueue.then(async () => {
    if (generation !== nativeGeneration) return
    try {
      const { LocalNotifications } = await ln()
      if (generation !== nativeGeneration) return
      const pending = await LocalNotifications.getPending()
      if (upcoming.length > 0) {
        if ((await LocalNotifications.checkPermissions()).display !== 'granted') throw new Error('未授予通知权限，请在系统设置中开启后重试。')
        await LocalNotifications.schedule({ notifications: upcoming })
      }
      const desired = new Set(upcoming.map(item => item.id))
      const removed = pending.notifications.filter(item => !desired.has(item.id))
      if (removed.length) await LocalNotifications.cancel({ notifications: removed.map(({ id }) => ({ id })) })
      reminderError.value = upcoming.length && (await LocalNotifications.checkExactNotificationSetting()).exact_alarm !== 'granted'
        ? '精确闹钟权限未开启，提醒可能延迟，请在系统设置中开启后重试。' : ''
    } catch (error) {
      reminderError.value = error instanceof Error ? `提醒安排失败：${error.message}` : '提醒安排失败，请检查系统通知设置后重试。'
    }
  })
  return nativeQueue
}

export async function rescheduleNative(): Promise<void> {
  if (!isNative || !canSchedule()) return
  if (rescheduleTimer) clearTimeout(rescheduleTimer)
  rescheduleTimer = null
  await schedulePlan(nativePlan())
}

export async function retryReminders(): Promise<void> {
  if (isNative) await rescheduleNative()
  else await tick()
}

export async function clearNativeReminders(): Promise<void> {
  if (!isNative) return
  nativeGeneration++
  if (rescheduleTimer) clearTimeout(rescheduleTimer)
  rescheduleTimer = null
  await nativeQueue
  const { LocalNotifications } = await ln()
  await LocalNotifications.cancelAll()
  reminderError.value = ''
}

export function bindNativeScheduleWatcher(ready: () => boolean): () => void {
  if (!isNative) return () => {}
  canSchedule = ready
  const stop = watch(
    [tasks, ready],
    () => {
      if (!ready()) return
      const upcoming = nativePlan()
      if (rescheduleTimer) clearTimeout(rescheduleTimer)
      rescheduleTimer = setTimeout(() => {
        rescheduleTimer = null
        void schedulePlan(upcoming)
      }, 800)
    },
    { deep: true, immediate: true, flush: 'sync' },
  )
  return () => {
    stop()
    canSchedule = () => false
    if (rescheduleTimer) clearTimeout(rescheduleTimer)
    rescheduleTimer = null
  }
}
