export function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function ensureDesktopNotificationPermission(): Promise<boolean> {
  if (!isTauriDesktop()) return false
  try {
    const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification')
    if (await isPermissionGranted()) return true
    return (await requestPermission()) === 'granted'
  } catch {
    return false
  }
}

export async function revealDesktopWindow(): Promise<void> {
  if (!isTauriDesktop()) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const appWindow = getCurrentWindow()
    await appWindow.unminimize()
    await appWindow.show()
    await appWindow.setFocus()
  } catch {
    return
  }
}

function openDesktopTask(taskId: string): void {
  location.hash = `#/today?task=${encodeURIComponent(taskId)}`
  void revealDesktopWindow()
}

export async function sendDesktopNotification(taskId: string, title: string, body: string): Promise<void> {
  if (!isTauriDesktop()) return
  try {
    const notification = new Notification(title, {
      body,
      tag: `task-${taskId}`,
      data: { taskId },
    })
    notification.onclick = () => openDesktopTask(taskId)
  } catch {
    return
  }
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return
  if (!isTauriDesktop()) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  } catch {
    return
  }
}
