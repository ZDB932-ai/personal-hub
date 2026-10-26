import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { isTauriDesktop } from './desktop'
import { emptyTodoView, type TodoSnapshot, type TodoWindowPreferences } from './desktopTodoProtocol'

export const desktopTodoState = ref<TodoSnapshot>({ preferences: { enabled: false, pinned: false, collapsed: false, snap: true }, view: emptyTodoView(), receipts: [] })
let ready: Promise<void> | undefined
let reads = 0
export async function refreshDesktopTodo(): Promise<void> {
  const read = ++reads
  const value = await invoke<TodoSnapshot>('todo_read')
  if (read === reads) desktopTodoState.value = value
}
export function initializeDesktopTodo(): Promise<void> {
  if (!isTauriDesktop()) return Promise.resolve()
  return ready ??= (async () => {
    const stop = await listen('todo://changed', () => { void refreshDesktopTodo().catch(() => {}) })
    try { await refreshDesktopTodo() }
    catch (error) { stop(); throw error }
  })().catch(error => { ready = undefined; throw error })
}
export async function configureDesktopTodo(patch: Partial<TodoWindowPreferences>): Promise<void> {
  await initializeDesktopTodo()
  await invoke('todo_configure', { patch })
  await refreshDesktopTodo()
}
export function openDesktopTodoSettings(): void { window.dispatchEvent(new Event('desktop-todo-settings')) }
export function desktopTodoVisible(): boolean { return isTauriDesktop() && desktopTodoState.value.preferences.enabled }
