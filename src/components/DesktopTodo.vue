<script setup lang="ts">
import { WORKSPACE_LABELS, type InterfaceStyle } from '@/lib/interfaceStyles'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { Pin, X, Minus, ChevronDown, ChevronRight, Ellipsis, GripVertical, LockKeyhole } from '@lucide/vue'
import DesktopTodoTask from './DesktopTodoTask.vue'
import { configureDesktopTodo, desktopTodoState, initializeDesktopTodo, refreshDesktopTodo } from '@/lib/desktopTodo'
import type { TodoItem, TodoReceipt, TodoRequest } from '@/lib/desktopTodoProtocol'
import { parseQuickInput } from '@/lib/quickparse'
import { toYMD } from '@/lib/utils'
import { createTodoWindowGesture, type TodoWindowBounds, type TodoWindowGestureKind } from '@/lib/desktopTodoGesture'

const state = desktopTodoState
const view = computed(() => state.value.view), prefs = computed(() => state.value.preferences)
const readonly = computed(() => view.value.phase !== 'ready')
const input = ref(''), error = ref(''), menu = ref(false), confirming = ref<TodoItem | null>(null)
const pending = ref<string | null>(null), status = ref(''), overdueOpen = ref(false), doneOpen = ref(false)
const reorderId = ref<string | null>(null)
const now = ref(new Date()), day = computed(() => toYMD(now.value))
const preview = computed(() => parseQuickInput(input.value))
const blocked = computed(() => readonly.value || Boolean(pending.value) || Boolean(view.value.error))
const groups = computed(() => {
  const items = view.value.items
  if (readonly.value) return [{ key: 'snapshot', label: '', items, open: true }]
  if (view.value.source === 'manual') return [{ key: 'manual', label: '指定任务', items, open: true }]
  const overdue = items.filter(task => !task.done && task.date && task.date < day.value)
  return [
    { key: 'pending', label: view.value.label, items: items.filter(task => !task.done && !overdue.includes(task)), open: true },
    { key: 'overdue', label: '逾期', items: overdue, open: overdueOpen.value },
    { key: 'done', label: '已完成', items: items.filter(task => task.done), open: doneOpen.value },
  ].filter(group => group.items.length)
})
const remaining = computed(() => view.value.items.filter(task => !task.done).length)
const phaseLabel = computed(() => ({ ready: '', unavailable: '请先解锁主窗口', locking: '正在锁定', locked: '已锁定 · 只读', error: '清单暂不可用', exiting: '正在保存并退出' })[view.value.phase])
let alive = true, lastActivity = 0, timer: ReturnType<typeof setInterval> | undefined
function message(reason: unknown) { return reason instanceof Error ? reason.message : String(reason) }
async function attempt(action: () => Promise<unknown>) { error.value = ''; try { await action() } catch (reason) { error.value = message(reason) } }
function home(id?: string) { menu.value = false; void attempt(() => invoke('todo_home', { taskId: id ?? null })) }
async function submit(action: TodoRequest['action'], fields: Partial<TodoRequest> = {}) {
  if (blocked.value) return
  const request: TodoRequest = { ...fields, id: crypto.randomUUID(), epoch: view.value.epoch, revision: view.value.revision, action }
  pending.value = request.id; status.value = '正在保存到本机'; error.value = ''
  try {
    await invoke<TodoReceipt>('todo_submit', { request })
    await refreshDesktopTodo()
  } catch (reason) { error.value = message(reason); pending.value = null; status.value = '' }
}
function mark(task: TodoItem) {
  if (task.done) void submit('done', { taskId: task.id, value: false })
  else confirming.value = task
}
function complete() {
  const task = confirming.value; confirming.value = null
  if (task) void submit('done', { taskId: task.id, value: true })
}
function add() { if (input.value.trim()) void submit('add', { text: input.value }) }
function reorder(targetId: string) {
  const taskId = reorderId.value; reorderId.value = null
  if (taskId && taskId !== targetId) void submit('move', { taskId, targetId })
}
function activity(event: Event) {
  if (!event.isTrusted || readonly.value || Date.now() - lastActivity < 1000) return
  lastActivity = Date.now(); void invoke('todo_activity').catch(() => {})
}
const windowGesture = createTodoWindowGesture({ read: () => invoke<TodoWindowBounds>('todo_window_bounds'), write: bounds => invoke('todo_set_window_bounds', { bounds }) }, reason => { error.value = message(reason) })
let gesturePointer: number | undefined
function beginGesture(event: PointerEvent, kind: TodoWindowGestureKind) {
  if (event.button !== 0 || gesturePointer !== undefined) return
  event.preventDefault(); gesturePointer = event.pointerId
  windowGesture.begin(event.pointerId, event.screenX, event.screenY, kind)
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function moveGesture(event: PointerEvent) { windowGesture.update(event.pointerId, event.screenX, event.screenY) }
function endGesture(event: PointerEvent) {
  if (gesturePointer !== event.pointerId) return
  gesturePointer = undefined
  if (event.type === 'pointerup') windowGesture.end(event.pointerId, event.screenX, event.screenY)
  else windowGesture.cancel(event.pointerId)
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
}
function escape() { if (confirming.value) confirming.value = null; else menu.value = false }
watch([() => view.value.phase, () => view.value.epoch], () => {
  input.value = ''; confirming.value = null; pending.value = null; status.value = ''; error.value = ''; doneOpen.value = false; overdueOpen.value = false
  reorderId.value = null
})
watch(() => state.value.receipts, receipts => {
  const result = receipts.find(receipt => receipt.id === pending.value)
  if (!result || result.status === 'pending') return
  pending.value = null
  if (result.status === 'applied') { status.value = '已保存到本机'; input.value = ''; error.value = '' }
  else { status.value = ''; error.value = result.error }
}, { deep: true })
watch(() => view.value.theme, theme => {
  document.documentElement.dataset.theme = theme.mode
  document.documentElement.dataset.accent = theme.accent
  document.documentElement.dataset.interface = theme.style
  document.documentElement.style.colorScheme = theme.mode
}, { deep: true, immediate: true })
onMounted(() => {
  void attempt(initializeDesktopTodo)
  timer = setInterval(() => {
    now.value = new Date()
    if (alive) void refreshDesktopTodo().catch(() => { error.value = '连接中断，请回主窗口重新连接'; pending.value = null })
  }, 5000)
})
onUnmounted(() => { alive = false; windowGesture.dispose(); if (timer) clearInterval(timer) })
</script>

<template>
  <section class="desktop-todo-root" :class="{ 'is-collapsed': prefs.collapsed, 'is-readonly': readonly }" aria-label="桌面清单" @pointerdown="activity" @keydown="activity" @keydown.esc="escape">
    <header class="desktop-todo-titlebar">
      <div class="desktop-todo-drag" @pointerdown="beginGesture($event, 'move')" @pointermove="moveGesture" @pointerup="endGesture" @pointercancel="endGesture" @lostpointercapture="endGesture"><GripVertical class="h-4 w-4 shrink-0 text-t3" /><span class="truncate text-sm font-semibold text-t1">{{ prefs.collapsed ? `清单 · ${remaining} 项${readonly ? ' · 只读' : ''}` : '桌面清单' }}</span></div>
      <button class="desktop-todo-icon ui-icon-button" :aria-label="prefs.pinned ? '取消置顶' : '置顶小窗'" :aria-pressed="prefs.pinned" :class="{ 'text-primary': prefs.pinned }" @click="attempt(() => configureDesktopTodo({ pinned: !prefs.pinned }))"><Pin class="h-4 w-4" /></button>
      <button class="desktop-todo-icon ui-icon-button" :aria-label="prefs.collapsed ? '展开清单' : '折叠清单'" @click="attempt(() => configureDesktopTodo({ collapsed: !prefs.collapsed }))"><ChevronDown v-if="prefs.collapsed" class="h-4 w-4" /><Minus v-else class="h-4 w-4" /></button>
      <button v-if="!prefs.collapsed" class="desktop-todo-icon ui-icon-button" aria-label="更多操作" :aria-expanded="menu" @click="menu = !menu"><Ellipsis class="h-4 w-4" /></button>
      <button class="desktop-todo-icon ui-icon-button" aria-label="关闭桌面清单" @click="attempt(() => configureDesktopTodo({ enabled: false }))"><X class="h-4 w-4" /></button>
    </header>
    <template v-if="!prefs.collapsed">
      <div class="desktop-todo-summary flex min-h-11 items-center justify-between gap-2 px-3 py-1">
        <span v-if="readonly" class="flex items-center gap-2 text-xs text-t3"><LockKeyhole class="h-4 w-4" />{{ phaseLabel }}</span>
        <button v-else class="min-h-9 text-xs text-primary" @click="home('settings')">{{ view.label }} · 选择清单</button>
        <span class="desktop-todo-count text-xs tabular-nums text-t3"><strong>{{ remaining }}</strong> 项待办</span>
      </div>
      <p v-if="!readonly" class="desktop-todo-style-label">{{ WORKSPACE_LABELS[view.theme.style as InterfaceStyle]?.todo ?? '桌面待办' }}<span>{{ day.replaceAll('-', '.') }}</span></p>
      <p v-if="view.phase === 'locked'" class="px-3 pb-2 text-xs text-t3">快照更新于 {{ new Date(view.capturedAt).toLocaleString('zh-CN') }}</p>
      <div class="desktop-todo-list">
        <section v-for="group in groups" :key="group.key">
          <button v-if="group.key === 'done' || group.key === 'overdue'" class="flex min-h-11 w-full items-center gap-1 text-xs text-t3" :aria-expanded="group.open" @click="group.key === 'done' ? doneOpen = !doneOpen : overdueOpen = !overdueOpen"><ChevronDown v-if="group.open" class="h-3 w-3" /><ChevronRight v-else class="h-3 w-3" />{{ group.label }} {{ group.items.length }} 项</button>
          <template v-if="group.open"><DesktopTodoTask v-for="task in group.items" :key="`${view.epoch}:${task.id}:${readonly}`" :task="task" :readonly="readonly" :disabled="blocked" :manual="view.source === 'manual'" @done="mark" @open="home(task.id)" @subtask="(id, value) => submit('subtask', { taskId: task.id, subtaskId: id, value })" @move="direction => submit('move', { taskId: task.id, direction })" @reorder-start="reorderId = task.id" @reorder-end="reorderId = null" @reorder-drop="reorder" /></template>
        </section>
        <p v-if="!view.items.length" class="py-8 text-center text-sm text-t3">{{ readonly ? '解锁后查看待办' : '当前清单没有任务' }}</p>
      </div>
      <div class="desktop-todo-footer border-t border-line px-3 py-2">
        <form v-if="!readonly" aria-label="小窗快速添加任务" @submit.prevent="add">
          <label for="desktop-todo-input" class="mb-1 block text-xs text-t3">快速添加</label>
          <div class="flex gap-2"><input id="desktop-todo-input" v-model="input" :disabled="blocked" maxlength="500" class="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-t1" placeholder="接下来做什么？" /><button class="ui-primary-button" :disabled="blocked || !preview.title.trim()">添加</button></div>
          <p v-if="input.trim()" class="mt-1 break-words text-xs text-t3">{{ preview.title || '请输入标题' }} · {{ preview.date || day }} {{ preview.time }} {{ preview.tags.map(tag => `#${tag}`).join(' ') }}</p>
        </form>
        <p v-if="error || view.error" role="alert" class="mt-2 break-words text-xs text-danger">{{ error || view.error }}<button class="ml-2 min-h-9 text-primary" @click="home('settings')">回主窗重试</button></p>
        <div class="flex min-h-10 items-center justify-between gap-2"><span role="status" aria-live="polite" class="text-xs text-t3">{{ readonly ? (view.phase === 'locked' ? '仅显示已授权任务' : '') : pending ? '等待保存回执…' : view.saving ? '待保存到本机' : status || '已保存到本机' }}</span><button class="min-h-10 text-xs text-primary" @click="home()">{{ readonly ? '解锁以编辑' : '打开主窗' }}</button></div>
      </div>
    </template>
    <div v-if="menu && !prefs.collapsed" class="desktop-todo-menu"><button @click="home('settings')">设置清单与锁定展示</button><button @click="attempt(() => invoke('todo_reset_position')); menu = false">找回窗口位置</button><button @click="attempt(() => configureDesktopTodo({ snap: !prefs.snap })); menu = false">{{ prefs.snap ? '关闭边缘吸附' : '开启边缘吸附' }}</button></div>
    <div v-if="confirming && !readonly && !prefs.collapsed" class="desktop-todo-confirm" role="dialog" aria-label="完成任务确认" aria-modal="true"><p class="text-sm font-semibold text-t1">完成这项待办？</p><p class="mt-2 break-words text-sm text-t2">{{ confirming.title }}</p><div class="mt-4 flex justify-end gap-2"><button class="ui-secondary-button" @click="confirming = null">取消</button><button class="ui-primary-button" @click="complete">确认完成</button></div></div>
    <button v-if="!prefs.collapsed" class="desktop-todo-resize" aria-label="调整窗口大小" @pointerdown="beginGesture($event, 'resize')" @pointermove="moveGesture" @pointerup="endGesture" @pointercancel="endGesture" @lostpointercapture="endGesture"></button>
  </section>
</template>

<style>
html.todo-window, html.todo-window body, html.todo-window #app { height: 100%; min-height: 0; overflow: hidden; background: var(--tk-surface); }
.desktop-todo-root { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--tk-t1); background: var(--tk-surface); border: 1px solid var(--tk-line); border-radius: 12px; overflow: hidden; }
.desktop-todo-titlebar { display: flex; flex-shrink: 0; align-items: center; height: 54px; padding: 4px 5px; border-bottom: 1px solid var(--tk-line); }
.desktop-todo-drag { display: flex; flex: 1; min-width: 0; height: 44px; align-items: center; gap: 4px; cursor: grab; user-select: none; touch-action: none; }
.desktop-todo-icon { display: flex; flex: 0 0 44px; height: 44px; align-items: center; justify-content: center; border-radius: 8px; color: var(--tk-t3); }
.desktop-todo-icon:hover { background: var(--tk-surface-2); }
.desktop-todo-icon[aria-pressed=true] { color: var(--tk-primary); }
.desktop-todo-list { flex: 1; min-height: 0; overflow: auto; padding: 0 12px; }
.desktop-todo-menu { position: absolute; z-index: 2; right: 6px; top: 54px; width: min(220px, calc(100% - 12px)); border: 1px solid var(--tk-line); border-radius: 8px; padding: 4px; background: var(--tk-surface); }
.desktop-todo-menu button { display: block; min-height: 44px; width: 100%; padding: 8px; text-align: left; font-size: 12px; border-radius: 8px; }
.desktop-todo-menu button:hover { background: var(--tk-surface-2); }
.desktop-todo-confirm { position: absolute; z-index: 3; inset: 54px 0 auto; padding: 16px; background: var(--tk-surface); border-bottom: 1px solid var(--tk-line); }
.desktop-todo-resize { position: absolute; right: 4px; bottom: 4px; width: 20px; height: 20px; border-right: 2px solid var(--tk-line); border-bottom: 2px solid var(--tk-line); border-radius: 0 0 8px 0; cursor: se-resize; touch-action: none; }
</style>
