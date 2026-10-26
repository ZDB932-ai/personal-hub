import { createApp, h, ref } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow, Window as NativeWindow } from '@tauri-apps/api/window'
import { initializeVaultRepository, readRepository } from '../../src/lib/vaultRepository'
import { configureDesktopTodo } from '../../src/lib/desktopTodo'
import { toYMD } from '../../src/lib/utils'
import { interfaceStyle, themeMode, themeAccent } from '../../src/stores/theme'
import { INTERFACE_STYLES, type InterfaceStyle } from '../../src/lib/interfaceStyles'
import '../../src/style.css'

if (!import.meta.env.DEV && import.meta.env.MODE !== 'todo-qa') throw new Error('此测试夹具仅用于测试构建')
function stage(value: string) { document.getElementById('app')!.textContent = value }
window.addEventListener('unhandledrejection', event => stage(String(event.reason)))
const password = 'Todo-isolated-fixture-2026'
stage('初始化隔离存储')
await initializeVaultRepository()
const { setupLock, lockApp, unlockApp, isGated } = await import('../../src/stores/lock')
const { tasks, addTask, updateTask } = await import('../../src/stores/tasks')
const { flushPendingSave, getActiveKey } = await import('../../src/stores/database')
const { startDesktopTodoHost } = await import('../../src/lib/desktopTodoHost')
const { saveTodoSelection } = await import('../../src/lib/desktopTodoPreferences')
stage('准备合成数据密钥')
if (!readRepository('xk.data.v2')) await setupLock(password, '')
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:path(.*)*', component: { render: () => null } }] })
stage('连接原生 Todo 通信')
const stop = await startDesktopTodoHost(router)
window.addEventListener('beforeunload', stop)
const report = ref('已就绪'), error = ref('')
async function seed() {
  if (isGated.value) await unlockApp(password)
  if (!tasks.value.length) {
    const a = addTask({ title: '整理今日计划', date: toYMD(new Date()), time: '20:00', notes: '不能出现在小窗的测试备注', tags: ['work'], priority: 3, repeat: 'none', subtasks: [{ id: 'qa-child', title: '检查资料', done: false }] })
    addTask({ title: '准备下周演示', date: toYMD(new Date()), time: '', notes: '', tags: ['work'], priority: 2, repeat: 'daily' })
    addTask({ title: '长标题检查：整理跨设备日历与桌面待办清单，核对各套风格在窄窗口内的完整显示', date: toYMD(new Date()), time: '21:00', notes: '', tags: ['work'], priority: 1, repeat: 'none' })
    await saveTodoSelection({ source: 'today', lockedIds: [a.id] })
  }
  await flushPendingSave()
  await configureDesktopTodo({ enabled: true, pinned: false, collapsed: false })
}
async function run(fn: () => Promise<unknown>) { error.value = ''; try { await fn(); report.value = '操作完成' } catch (reason) { error.value = String(reason) } }
const qa = {
  seed,
  lock: lockApp,
  unlock: () => unlockApp(password),
  inspect: async () => ({ gated: isGated.value, keyPresent: Boolean(getActiveKey()), tasks: JSON.parse(JSON.stringify(tasks.value)), todo: await invoke('todo_read'), mainVisible: await getCurrentWindow().isVisible() }),
  update: async (id: string, title: string) => { updateTask(id, { title }); await flushPendingSave() },
  configure: configureDesktopTodo,
  appearance: (style: InterfaceStyle, mode: 'light' | 'dark') => {
    const preset = INTERFACE_STYLES.find(item => item.key === style)
    if (!preset) throw new Error('未知界面风格')
    interfaceStyle.value = style; themeMode.value = mode; themeAccent.value = preset.accent
  },
  select: saveTodoSelection,
  geometry: async () => {
    const window = new NativeWindow('todo')
    return { position: await window.outerPosition(), size: await window.innerSize(), pinned: await window.isAlwaysOnTop(), visible: await window.isVisible(), scale: await window.scaleFactor() }
  },
  closeMain: () => getCurrentWindow().close(),
}
Object.assign(window, { todoQA: qa })
createApp({ setup: () => () => h('main', { class: 'p-6 text-t1 bg-surface min-h-screen' }, [
  h('h1', { class: 'text-xl font-semibold' }, '桌面清单 · 隔离测试'),
  h('p', { class: 'my-4 text-sm text-t3' }, '仅使用本地合成任务；独立应用标识和 WebView 数据目录。'),
  h('div', { class: 'flex gap-3 flex-wrap' }, [
    h('button', { class: 'ui-primary-button', onClick: () => run(seed) }, '准备测试清单'),
    h('button', { class: 'ui-secondary-button', onClick: () => run(lockApp) }, '模拟锁定'),
    h('button', { class: 'ui-secondary-button', onClick: () => run(() => unlockApp(password)) }, '恢复测试会话'),
    h('button', { class: 'ui-secondary-button', onClick: () => run(qa.closeMain) }, '关闭主窗'),
  ]),
  h('p', { class: 'my-4 text-sm', role: 'status' }, `${report.value} · ${isGated.value ? '已锁定' : '可编辑'}`),
  h('p', { role: 'alert' }, error.value),
  h('ul', tasks.value.map(task => h('li', { class: 'py-2' }, `${task.done ? '✓' : '○'} ${task.title}`))),
]) }).use(router).mount('#app')
