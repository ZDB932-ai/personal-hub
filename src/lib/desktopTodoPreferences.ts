import { ref } from 'vue'
import { decryptJSON, encryptJSON } from './crypto'
import { getActiveKey } from './keyring'
import { commitRepository, readRepository } from './vaultRepository'
import { emptyTodoSelection, normalizeTodoSelection, type TodoSelection } from './desktopTodoProtocol'

export const todoSelection = ref<TodoSelection>(emptyTodoSelection())
export const todoSelectionReady = ref(false)
let generation = 0
let queue: Promise<void> = Promise.resolve()
export function clearTodoSelection(): void { generation++; todoSelection.value = emptyTodoSelection(); todoSelectionReady.value = false }
export async function loadTodoSelection(): Promise<void> {
  const key = getActiveKey()
  if (!key) return
  const version = ++generation
  const record = readRepository<{ ivB64: string; ctB64: string }>('xk.desktop-todo.secure')
  const value = record ? normalizeTodoSelection(await decryptJSON(key, record.ivB64, record.ctB64)) : emptyTodoSelection()
  if (generation !== version || getActiveKey() !== key) return
  todoSelection.value = value
  todoSelectionReady.value = true
}
export function saveTodoSelection(patch: Partial<TodoSelection>): Promise<void> {
  const key = getActiveKey(), version = generation
  const operation = queue.then(async () => {
    const valid = () => Boolean(key) && getActiveKey() === key && generation === version && todoSelectionReady.value
    if (!valid()) throw new Error('请先解锁并等待清单载入')
    const value = normalizeTodoSelection({ ...todoSelection.value, ...patch })
    const encrypted = await encryptJSON(key!, value)
    await commitRepository({ 'xk.desktop-todo.secure': encrypted }, valid)
    if (valid()) todoSelection.value = value
  })
  queue = operation.catch(() => {})
  return operation
}
export function flushTodoSelection(): Promise<void> { return queue }
