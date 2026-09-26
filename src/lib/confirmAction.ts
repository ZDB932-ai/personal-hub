import { isTauriDesktop, prepareDesktopDialog } from './desktop'
import { toast } from './toast'

export async function confirmAction(message: string): Promise<boolean> {
  try {
    if (isTauriDesktop()) {
      const { confirm } = await import('@tauri-apps/plugin-dialog')
      await prepareDesktopDialog()
      return await confirm(message, { title: 'Personal Hub', kind: 'warning', okLabel: '确认', cancelLabel: '取消' }) === true
    }
    return await window.confirm(message) === true
  } catch {
    toast('无法打开确认窗口，操作已取消')
    return false
  }
}
