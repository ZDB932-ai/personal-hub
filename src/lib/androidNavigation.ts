import { Capacitor } from '@capacitor/core'
import type { Router } from 'vue-router'
import { toast } from './toast'

export function bindAndroidNavigation(router: Router, isLocked: () => boolean): () => void {
  if (Capacitor.getPlatform() !== 'android') return () => {}
  let disposed = false
  let remove: (() => Promise<void>) | undefined
  void import('@capacitor/app').then(async ({ App }) => {
    if (disposed) return
    const listener = await App.addListener('backButton', ({ canGoBack }) => {
      if (disposed) return
      const hadDialog = !!document.querySelector('[role="dialog"]')
      const target = document.querySelector('[role="listbox"]') ?? document.activeElement ?? document.body
      const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      target.dispatchEvent(escape)
      if (escape.defaultPrevented || hadDialog) return
      if (isLocked() || router.currentRoute.value.path === '/') {
        void App.minimizeApp().catch(() => toast('暂时无法返回桌面，请使用系统主页键', 'error'))
      } else if (canGoBack && typeof router.options.history.state.back === 'string') {
        router.back()
      } else {
        void router.replace('/').catch(() => toast('返回失败，请使用底部导航', 'error'))
      }
    })
    if (disposed) await listener.remove()
    else remove = () => listener.remove()
  }).catch(() => {
    if (!disposed) toast('系统返回键初始化失败，请重新打开应用', 'error')
  })
  return () => { disposed = true; void remove?.().catch(() => {}) }
}
