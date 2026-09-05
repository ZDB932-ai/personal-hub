import { reactive } from 'vue'

export interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error'
}

export const toasts = reactive<ToastItem[]>([])

let seq = 0

export function toast(message: string, type: ToastItem['type'] = 'success'): void {
  const id = ++seq
  toasts.push({ id, message, type })
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id)
    if (i >= 0) toasts.splice(i, 1)
  }, 2000)
}

export async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast(`${label}已复制`)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
    toast(`${label}已复制`)
  }
}
