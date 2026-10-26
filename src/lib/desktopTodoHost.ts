import { watch } from 'vue'
import type { Router } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { tasks } from '@/stores/tasks'
import { databaseBusy, flushPendingSave, getActiveKey, getDataRevision, hasPendingSave, onDataSaved, storageError } from '@/stores/database'
import { isGated, noteDesktopActivity } from '@/stores/lock'
import { resolvedTheme, themeAccent, interfaceStyle } from '@/stores/theme'
import { bindDesktopTodoLifecycle } from './desktopTodoLifecycle'
import { clearTodoSelection, flushTodoSelection, loadTodoSelection, saveTodoSelection, todoSelection } from './desktopTodoPreferences'
import { applyTodoAction } from './desktopTodoActions'
import { emptyTodoView, lockedTodoSnapshot, projectTodoTasks, selectTodoTasks, type TodoPhase, type TodoRequest, type TodoView } from './desktopTodoProtocol'
import { desktopTodoVisible, initializeDesktopTodo, refreshDesktopTodo } from './desktopTodo'
import { toYMD } from './utils'
import { toast } from './toast'

interface TodoWork { requests: TodoRequest[]; activity: boolean; navigation: string | null; quit: boolean }
export async function startDesktopTodoHost(router: Router): Promise<() => void> {
  const owner = crypto.randomUUID()
  let epoch = '', phase: TodoPhase = 'unavailable', revision = 0, signature = '', stopped = false
  let view = emptyTodoView(), generation = 0, preparingLock = false, starting: Promise<void> | undefined
  let queue: Promise<void> = Promise.resolve(), publishing: Promise<unknown> = Promise.resolve(), pumping = false, wakeAgain = false
  let deferredNavigation: string | null = null, lastSyncWake = 0
  let sessionKey: CryptoKey | null = null
  let quitting = false
  const handled = new Set<string>()
  const failedSaves = new Map<string, { selection?: string[] }>()
  const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
  const theme = () => ({ mode: resolvedTheme.value, accent: themeAccent.value, style: interfaceStyle.value })
  function currentView(): TodoView {
    if (phase !== 'ready') return { ...view, phase, theme: theme() }
    const day = toYMD(new Date()), selection = todoSelection.value
    const items = projectTodoTasks(selectTodoTasks(tasks.value, selection, day), day)
    const nextSignature = JSON.stringify([getDataRevision(), items, selection])
    if (signature !== nextSignature) { signature = nextSignature; revision++ }
    return { phase, epoch, revision, items, capturedAt: Date.now(), source: selection.source, label: selection.source === 'today' ? '今天' : selection.source === 'manual' ? '指定任务' : `标签：${selection.tag || '未选择'}`, saving: hasPendingSave(), error: storageError.value, theme: theme() }
  }
  function publish(): Promise<unknown> {
    if (quitting && phase === 'ready') return Promise.resolve()
    view = currentView()
    const next = structuredClone(view), token = generation
    const operation = publishing.catch(() => {}).then(() => {
      if (stopped || token !== generation) return
      return invoke('todo_publish', { owner, view: next })
    })
    publishing = operation
    return operation
  }
  async function setPhase(next: TodoPhase, error = ''): Promise<void> {
    generation++
    phase = next
    view = { ...emptyTodoView(), phase, epoch, revision: ++revision, error, theme: theme() }
    await publish()
  }
  async function unlock(): Promise<void> {
    const key = getActiveKey()
    if (!key || isGated.value || databaseBusy.value || preparingLock || phase === 'ready' || phase === 'error') return
    const token = ++generation
    try {
      await loadTodoSelection()
      if (stopped || token !== generation || getActiveKey() !== key || isGated.value) return
      epoch = crypto.randomUUID(); signature = ''; handled.clear(); failedSaves.clear()
      sessionKey = key
      phase = 'ready'
      await publish()
      await initializeDesktopTodo()
      window.dispatchEvent(new Event('desktop-todo-wake'))
    } catch (error) { if (token === generation) await setPhase('error', `清单载入失败：${errorText(error)}`) }
  }
  async function execute(request: TodoRequest): Promise<void> {
    if (handled.has(request.id)) return
    handled.add(request.id)
    let mutated = false
    try {
      const current = currentView()
      if (phase !== 'ready' || isGated.value || !getActiveKey() || databaseBusy.value) throw new Error('当前已锁定或正在保存账户，请稍后重试')
      if (failedSaves.size) throw new Error('有操作尚未保存，请先重试保存')
      if (request.epoch !== epoch || request.revision !== current.revision) throw new Error('清单已变化，请刷新后重试')
      if (request.action !== 'add' && !current.items.some(task => task.id === request.taskId)) throw new Error('任务不在当前清单中')
      const selected = todoSelection.value.selectedIds.filter(id => tasks.value.some(task => task.id === id))
      if (request.action === 'move') {
        if (todoSelection.value.source !== 'manual' || !request.targetId && ![-1, 1].includes(request.direction ?? 0)) throw new Error('仅指定任务清单支持调整顺序')
        const index = selected.indexOf(request.taskId!), target = request.targetId ? selected.indexOf(request.targetId) : index + request.direction!
        if (index < 0 || target < 0 || target >= selected.length) throw new Error('已到清单边缘')
        const id = selected.splice(index, 1)[0]!
        selected.splice(target, 0, id)
        await saveTodoSelection({ selectedIds: selected })
      } else {
        const added = applyTodoAction(request, todoSelection.value)
        mutated = true
        if (added && todoSelection.value.source === 'manual') {
          selected.push(added)
          failedSaves.set(request.id, { selection: selected })
          await saveTodoSelection({ selectedIds: selected })
        }
      }
      await flushPendingSave()
      failedSaves.delete(request.id)
      await publish()
      await invoke('todo_resolve', { owner, id: request.id, error: '' })
    } catch (error) {
      if (mutated) {
        if (!failedSaves.has(request.id)) failedSaves.set(request.id, {})
        await publish().catch(() => {})
        await invoke('todo_resolve', { owner, id: request.id, error: `操作尚未保存：${errorText(error)}。请重试保存。` })
      } else await invoke('todo_resolve', { owner, id: request.id, error: errorText(error) })
    }
  }
  async function retrySaves(): Promise<void> {
    for (const [id, pending] of failedSaves) {
      if (pending.selection) await saveTodoSelection({ selectedIds: pending.selection })
      await flushPendingSave()
      failedSaves.delete(id)
      await invoke('todo_resolve', { owner, id, error: '' })
    }
  }
  async function pump(): Promise<void> {
    if (stopped) return
    if (pumping) { wakeAgain = true; return }
    pumping = true
    try {
      const work = await invoke<TodoWork>('todo_work', { owner })
      if (work.activity && !isGated.value) noteDesktopActivity()
      if (work.navigation !== null) deferredNavigation = work.navigation
      if (deferredNavigation !== null && !isGated.value) {
        const id = deferredNavigation; deferredNavigation = null
        if (id === 'settings') window.dispatchEvent(new Event('desktop-todo-settings'))
        else await router.push(id ? { path: '/today', query: { task: id } } : { path: '/today' })
      }
      for (const request of work.requests) {
        queue = queue.catch(() => {}).then(() => execute(request))
      }
      if (work.quit) {
        quitting = true
        await queue
        try {
          await retrySaves(); await flushTodoSelection()
          if (getActiveKey()) await flushPendingSave()
          await setPhase('exiting')
          await invoke('todo_finish_quit', { owner })
        } catch (error) {
          quitting = false
          await invoke('todo_cancel_quit', { owner })
          await setPhase('error', `退出前保存失败：${errorText(error)}`)
          toast('退出前保存失败，请重试保存后再退出', 'error')
        }
      } else if (phase === 'ready' && !isGated.value) {
        await publish()
        if (desktopTodoVisible() && Date.now() - lastSyncWake > 45_000) {
          lastSyncWake = Date.now(); window.dispatchEvent(new Event('desktop-todo-wake'))
        }
      }
    } finally { pumping = false; if (wakeAgain) { wakeAgain = false; void pump().catch(() => {}) } }
  }
  await invoke('todo_connect', { owner })
  const unbind = bindDesktopTodoLifecycle({
    async beforeLock() {
      preparingLock = true
      await setPhase('locking')
      await queue
      await retrySaves()
      await flushTodoSelection()
    },
    async afterLock() {
      phase = 'locked'; generation++
      view = { ...emptyTodoView(), phase, epoch, revision: ++revision, items: lockedTodoSnapshot(tasks.value, todoSelection.value.lockedIds), capturedAt: Date.now(), label: '锁定时快照', theme: theme() }
      await publish()
      clearTodoSelection(); handled.clear(); failedSaves.clear(); preparingLock = false
    },
    async lockFailed() { preparingLock = false; await setPhase('error', '保存失败，锁定尚未完成。请回主窗口重试锁定。') },
    invalidate() {
      generation++; phase = 'unavailable'; epoch = ''; preparingLock = false
      sessionKey = null
      clearTodoSelection(); handled.clear(); failedSaves.clear(); deferredNavigation = null
      view = emptyTodoView()
      void publish().catch(() => {})
    },
  })
  const stopWatch = watch([isGated, getActiveKey, tasks, todoSelection, databaseBusy, storageError, resolvedTheme, themeAccent, interfaceStyle], () => {
    if (stopped) return
    if (phase === 'ready' && getActiveKey() !== sessionKey) {
      generation++; phase = 'unavailable'; epoch = ''; sessionKey = null
      view = emptyTodoView(); clearTodoSelection()
      void publish().catch(() => {})
    }
    if (!isGated.value && phase !== 'ready' && !preparingLock) {
      starting ??= unlock().finally(() => { starting = undefined })
    } else if (phase === 'ready') void publish().catch(() => {})
  }, { deep: true })
  const stopSaved = onDataSaved(() => { if (phase === 'ready') void publish().catch(() => {}) })
  const stopWake = await listen('todo://wake', () => { void pump().catch(() => {}) })
  const stopChanges = await listen('todo://changed', () => { void refreshDesktopTodo().catch(() => {}) })
  await initializeDesktopTodo()
  await unlock()
  await pump()
  const retry = async () => {
    if (isGated.value) return
    try { await retrySaves(); await flushPendingSave(); if (phase === 'error') { phase = 'unavailable'; await unlock() } await publish() }
    catch (error) { toast(errorText(error), 'error') }
  }
  window.addEventListener('desktop-todo-retry', retry)
  const heartbeat = setInterval(() => { void invoke('todo_heartbeat', { owner }).then(() => pump()).catch(() => {}) }, 5000)
  return () => {
    stopped = true; generation++; clearInterval(heartbeat)
    stopWatch(); stopSaved(); stopWake(); stopChanges(); unbind()
    clearTodoSelection(); window.removeEventListener('desktop-todo-retry', retry)
    void invoke('todo_disconnect', { owner }).catch(() => {})
  }
}
