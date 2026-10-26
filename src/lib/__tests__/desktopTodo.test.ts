import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { Router } from 'vue-router'
import type { Task, DataEnvelope, VaultPayload } from '@/types'
import type { TodoRequest, TodoSnapshot, TodoView } from '../desktopTodoProtocol'

const native = vi.hoisted(() => ({ listeners: new Map<string, Set<() => void>>(), snapshot: undefined as TodoSnapshot | undefined, requests: [] as TodoRequest[], calls: [] as string[], quit: false }))
vi.mock('@tauri-apps/api/event', () => ({ listen: async (name: string, callback: () => void) => {
  const listeners = native.listeners.get(name) ?? new Set()
  listeners.add(callback); native.listeners.set(name, listeners)
  return () => listeners.delete(callback)
} }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: async (name: string, args: Record<string, unknown> = {}) => {
  native.calls.push(name)
  if (name === 'todo_read') return structuredClone(native.snapshot)
  if (name === 'todo_publish') {
    native.snapshot!.view = structuredClone(args.view as TodoView)
    for (const callback of native.listeners.get('todo://changed') ?? []) callback()
  }
  if (name === 'todo_work') return { requests: [...native.requests], activity: false, navigation: null, quit: native.quit }
  if (name === 'todo_resolve') {
    native.requests = native.requests.filter(request => request.id !== args.id)
    native.snapshot!.receipts.push({ id: String(args.id), status: args.error ? 'failed' : 'applied', error: String(args.error) })
  }
} }))
vi.mock('@/lib/biometric', () => ({ biometricEnabled: () => false, biometricClear: vi.fn(async () => {}), biometricStoreSecret: vi.fn() }))
vi.mock('@/lib/crypto', async original => {
  const actual = await original<typeof import('@/lib/crypto')>()
  return { ...actual, newKdfParams: () => ({ ...actual.newKdfParams(), memKiB: 8192, timeCost: 1, parallelism: 1 }) }
})

let stop: (() => void) | undefined
beforeEach(async () => {
  vi.resetModules()
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
  vi.stubGlobal('window', Object.assign(new EventTarget(), { __TAURI_INTERNALS__: {}, matchMedia: () => ({ matches: true, addEventListener: vi.fn() }) }))
  vi.stubGlobal('document', { createElement: () => ({}), documentElement: { dataset: {}, style: {} } })
  vi.stubGlobal('indexedDB', new IDBFactory())
  native.listeners.clear(); native.calls = []; native.requests = []; native.quit = false
  const protocol = await import('../desktopTodoProtocol')
  native.snapshot = { preferences: { enabled: true, pinned: false, collapsed: false, snap: true }, view: protocol.emptyTodoView(), receipts: [] }
  await (await import('../vaultRepository')).initializeVaultRepository()
})
afterEach(async () => {
  stop?.(); stop = undefined
  await (await import('@/stores/lock')).lockApp()
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})
async function setup() {
  const lock = await import('@/stores/lock'), db = await import('@/stores/database'), store = await import('@/stores/tasks')
  await lock.setupLock('todo-test-password', '')
  const preferences = await import('../desktopTodoPreferences')
  stop = await (await import('../desktopTodoHost')).startDesktopTodoHost({ push: vi.fn() } as unknown as Router)
  return { lock, db, store, preferences }
}
function add(store: typeof import('@/stores/tasks'), title = '指定任务') {
  return store.addTask({ title, date: new Date().toLocaleDateString('sv-SE'), time: '10:00', priority: 2, repeat: 'none', tags: ['work'], notes: '不应进入小窗的备注', subtasks: [{ id: 'child', title: '私密子任务', done: false }] })
}
async function settle() { await vi.waitFor(() => expect(native.snapshot!.view.phase).toBe('ready')); await new Promise(resolve => setTimeout(resolve, 20)) }
function send(fields: Partial<TodoRequest>) {
  const request: TodoRequest = { id: crypto.randomUUID(), action: 'done', epoch: native.snapshot!.view.epoch, revision: native.snapshot!.view.revision, ...fields }
  native.requests.push(request)
  for (const callback of native.listeners.get('todo://wake') ?? []) callback()
  return request
}
async function receipt(id: string) { await vi.waitFor(() => expect(native.snapshot!.receipts.some(item => item.id === id)).toBe(true)); return native.snapshot!.receipts.find(item => item.id === id)! }

describe('桌面 Todo 会话与持久化', () => {
  it('主窗变更会发布最小清单，小窗完成只在密文保存成功后回执', async () => {
    const { store, db } = await setup(), task = add(store)
    await settle()
    expect(JSON.stringify(native.snapshot!.view)).not.toContain('不应进入小窗的备注')
    const request = send({ taskId: task.id, value: true })
    expect((await receipt(request.id)).status).toBe('applied')
    const env = (await import('../vaultRepository')).readRepository<DataEnvelope>('xk.data.v2')!
    const payload = await (await import('../crypto')).decryptJSON<VaultPayload>(db.getActiveKey()!, env.ivB64, env.ctB64)
    expect(payload.tasks!.find(item => item.id === task.id)?.done).toBe(true)
  })
  it('重复请求与再次勾选不会生成两份重复任务', async () => {
    const { store } = await setup(), task = add(store)
    store.updateTask(task.id, { repeat: 'daily' })
    await settle()
    const request = send({ taskId: task.id, value: true })
    native.requests.push(request)
    await receipt(request.id)
    await new Promise(resolve => setTimeout(resolve, 25))
    expect(store.tasks.value.filter(item => item.repeatSourceId === task.id)).toHaveLength(1)
    const again = send({ taskId: task.id, value: true })
    expect((await receipt(again.id)).status).toBe('applied')
    expect(store.tasks.value.filter(item => item.repeatSourceId === task.id)).toHaveLength(1)
  })
  it('拒绝旧版本操作，不会覆盖主窗的新状态', async () => {
    const { store } = await setup(), task = add(store)
    await settle()
    const request = send({ revision: 0, taskId: task.id, value: true })
    expect((await receipt(request.id)).error).toContain('清单已变化')
    expect(task.done).toBe(false)
  })
  it('锁定只保留授权字段，清空密钥、主库和设置内存，解锁后恢复', async () => {
    const { store, db, preferences, lock } = await setup(), task = add(store)
    add(store, '未授权任务')
    await preferences.saveTodoSelection({ lockedIds: [task.id] })
    await lock.lockApp()
    expect(db.getActiveKey()).toBeNull()
    expect(store.tasks.value).toHaveLength(0)
    expect(preferences.todoSelection.value.lockedIds).toEqual([])
    expect(native.snapshot!.view.phase).toBe('locked')
    expect(native.snapshot!.view.items).toEqual([{ id: task.id, title: task.title, date: task.date, time: task.time, done: false }])
    const request = send({ taskId: task.id, value: true })
    expect((await receipt(request.id)).status).toBe('failed')
    await lock.unlockApp('todo-test-password'); await settle()
    expect(native.snapshot!.view.items).toHaveLength(2)
    expect(preferences.todoSelection.value.lockedIds).toEqual([task.id])
  })
  it('锁定等待实际保存，失败时保留解锁内存，不发布成功快照', async () => {
    const { store, lock, db } = await setup()
    add(store)
    const repository = await import('../vaultRepository')
    const failure = vi.spyOn(repository.vaultRepository, 'commit').mockRejectedValue(new Error('磁盘已满'))
    await expect(lock.lockApp()).rejects.toThrow('磁盘已满')
    expect(db.getActiveKey()).not.toBeNull()
    expect(store.tasks.value).toHaveLength(1)
    expect(native.snapshot!.view.phase).toBe('error')
    failure.mockRestore()
  })
  it('保存失败可重试，已执行的新增不会重复插入', async () => {
    const { store } = await setup()
    const repository = await import('../vaultRepository')
    const failure = vi.spyOn(repository.vaultRepository, 'commit').mockRejectedValue(new Error('磁盘已满'))
    const request = send({ action: 'add', text: '失败后重试的任务' })
    expect((await receipt(request.id)).status).toBe('failed')
    expect(store.tasks.value).toHaveLength(1)
    failure.mockRestore()
    window.dispatchEvent(new Event('desktop-todo-retry'))
    await vi.waitFor(() => expect(native.snapshot!.receipts.filter(item => item.id === request.id).at(-1)?.status).toBe('applied'))
    expect(store.tasks.value).toHaveLength(1)
  })
  it('展示配置密文保存，账号清除会撤销锁定快照', async () => {
    const { store, preferences, lock, db } = await setup(), task = add(store)
    await preferences.saveTodoSelection({ source: 'manual', selectedIds: [task.id], lockedIds: [task.id] })
    const record = (await import('../vaultRepository')).readRepository('xk.desktop-todo.secure')
    expect(JSON.stringify(record)).not.toContain(task.id)
    await lock.lockApp()
    db.wipeMemory()
    await vi.waitFor(() => expect(native.snapshot!.view.phase).toBe('unavailable'))
    expect(native.snapshot!.view.items).toEqual([])
  })
  it('备份替换清除本机展示授权', async () => {
    const { store, db, preferences } = await setup(), task = add(store)
    await preferences.saveTodoSelection({ lockedIds: [task.id] }); await db.flushPendingSave()
    const repository = await import('../vaultRepository'), env = repository.readRepository<DataEnvelope>('xk.data.v2')!
    await db.initFromEnvelope(env, db.getActiveKey()!, () => true, () => {}, true)
    await settle()
    expect(repository.readRepository('xk.desktop-todo.secure')).toBeNull()
    expect(preferences.todoSelection.value.lockedIds).toEqual([])
  })
  it('旧格式改密会重新加密展示授权并切换小窗会话', async () => {
    const { store, preferences, lock, db } = await setup(), task = add(store)
    await preferences.saveTodoSelection({ lockedIds: [task.id] })
    await settle()
    const epoch = native.snapshot!.view.epoch, oldKey = db.getActiveKey()
    expect(await lock.changePassword('todo-test-password', 'new-todo-password', '')).toEqual({ ok: true })
    await vi.waitFor(() => expect(native.snapshot!.view.epoch).not.toBe(epoch))
    await settle()
    expect(db.getActiveKey()).not.toBe(oldKey)
    expect(preferences.todoSelection.value.lockedIds).toEqual([task.id])
    await lock.lockApp()
    expect(await lock.unlockApp('new-todo-password')).toBe(true)
    await settle()
    expect(preferences.todoSelection.value.lockedIds).toEqual([task.id])
  })
  it('指定清单新增与重排保存到同一任务库和加密配置', async () => {
    const { store, preferences } = await setup(), first = add(store)
    await preferences.saveTodoSelection({ source: 'manual', selectedIds: [first.id] })
    await settle()
    const added = send({ action: 'add', text: '第二个任务 #work' })
    expect((await receipt(added.id)).status).toBe('applied')
    const second = store.tasks.value.find(task => task.title === '第二个任务')!
    expect(preferences.todoSelection.value.selectedIds).toEqual([first.id, second.id])
    const move = send({ action: 'move', taskId: second.id, direction: -1 })
    expect((await receipt(move.id)).status).toBe('applied')
    expect(native.snapshot!.view.items.map(task => task.id)).toEqual([second.id, first.id])
    const drop = send({ action: 'move', taskId: second.id, targetId: first.id })
    expect((await receipt(drop.id)).status).toBe('applied')
    expect(native.snapshot!.view.items.map(task => task.id)).toEqual([first.id, second.id])
  })
  it('退出请求会先保存已经接收的操作，再允许原生进程结束', async () => {
    const { store } = await setup()
    native.quit = true
    const request = send({ action: 'add', text: '退出前最后一项' })
    expect((await receipt(request.id)).status).toBe('applied')
    await vi.waitFor(() => expect(native.calls).toContain('todo_finish_quit'))
    expect(store.tasks.value.map(task => task.title)).toEqual(['退出前最后一项'])
    expect(native.calls.lastIndexOf('todo_finish_quit')).toBeGreaterThan(native.calls.lastIndexOf('todo_resolve'))
  })
})

describe('清单筛选', () => {
  it('手动顺序、标签来源与锁定白名单互相独立', async () => {
    const { selectTodoTasks, lockedTodoSnapshot, normalizeTodoSelection } = await import('../desktopTodoProtocol')
    const rows = [1, 2, 3].map(id => ({ id: String(id), title: `任务${id}`, date: '2026-10-22', time: '', done: false, tags: id === 1 ? ['work'] : [], priority: 1, subtasks: [] }) as unknown as Task)
    const selection = normalizeTodoSelection({ source: 'manual', selectedIds: ['2', '1', '2'], lockedIds: ['3'] })
    expect(selectTodoTasks(rows, selection, '2026-10-22').map(row => row.id)).toEqual(['2', '1'])
    expect(lockedTodoSnapshot(rows, selection.lockedIds).map(row => row.id)).toEqual(['3'])
    expect(selectTodoTasks(rows, { ...selection, source: 'tag', tag: 'work' }, '2026-10-22').map(row => row.id)).toEqual(['1'])
  })
})
