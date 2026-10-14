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

export async function prepareDesktopDialog(): Promise<void> {
  if (!isTauriDesktop()) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const window = getCurrentWindow()
    await window.show()
    await window.unminimize()
    await window.setFocus()
    if (!await window.isVisible() || await window.isMinimized()) throw new Error('窗口不可见')
  } catch {
    throw new Error('无法显示主窗口，请从托盘打开 Personal Hub 后重试')
  }
}

export async function sendDesktopNotification(taskId: string, title: string, body: string): Promise<boolean> {
  if (!isTauriDesktop()) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    if (!await invoke<boolean | null>('plugin:notification|is_permission_granted')) return false
    await invoke('plugin:notification|notify', { options: { title, body, extra: { taskId } } })
    return true
  } catch {
    return false
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
    throw new Error('无法打开浏览器，请复制链接后手动打开')
  }
}
