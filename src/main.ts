import { createApp } from 'vue'
import { initializeVaultRepository } from './lib/vaultRepository'
import './style.css'
import './interface-styles.css'
import './appearance-studio.css'

function showError(title: string, detail: string): void {
  console.error(title, detail)
  let overlay = document.getElementById('phub-error-overlay')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = 'phub-error-overlay'
    overlay.style.cssText =
      'position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;max-width:860px;margin:0 auto;' +
      'background:#2a0a0f;border:1px solid #f87171;color:#fecaca;border-radius:12px;' +
      'padding:12px 16px;font:12px/1.7 ui-monospace,Consolas,monospace;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.5);white-space:pre-wrap;word-break:break-all;max-height:45vh;overflow:auto'
    const btn = document.createElement('button')
    btn.textContent = '关闭'
    btn.style.cssText =
      'display:block;margin-top:8px;padding:4px 14px;border-radius:8px;' +
      'border:1px solid #f87171;background:transparent;color:#fecaca;cursor:pointer'
    btn.onclick = () => overlay!.remove()
    overlay.appendChild(btn)
    document.body.appendChild(overlay)
  }
  const line = document.createElement('div')
  line.textContent = `【${title}】${detail}`
  overlay.insertBefore(line, overlay.firstChild)
}

window.addEventListener('error', (e) => {
  showError('脚本错误', `${e.message}\n${e.error?.stack ?? ''}`)
})

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason as Error
  showError('未处理的异步异常', reason?.stack || String(reason))
})

async function start(): Promise<void> {
  if (new URLSearchParams(location.search).get('pet') === '1') {
    document.documentElement.classList.add('pet-window')
    const { default: DesktopPet } = await import('./components/DesktopPet.vue')
    createApp(DesktopPet).mount('#app')
    return
  }
  await initializeVaultRepository()
  const [{ default: App }, { default: router }] = await Promise.all([import('./App.vue'), import('./router'), import('./stores/theme')])
  const app = createApp(App)
  app.config.errorHandler = (err) => {
    const e = err as Error
    showError('应用内部错误', e?.stack || String(err))
  }
  app.use(router).mount('#app')
}

void start().catch(error => showError('本机数据加载失败，未进入应用', `${error instanceof Error ? error.message : String(error)}\n请保留浏览器数据，关闭其他窗口后重新打开应用。`))
