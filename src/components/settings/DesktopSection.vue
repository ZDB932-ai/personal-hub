<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import AppSelect from '@/components/AppSelect.vue'
import { tasks } from '@/stores/tasks'
import { databaseBusy } from '@/stores/database'
import { interfaceStyle } from '@/stores/theme'
import { INTERFACE_STYLES } from '@/lib/interfaceStyles'
import { configureDesktopTodo, desktopTodoState, initializeDesktopTodo } from '@/lib/desktopTodo'
import { saveTodoSelection, todoSelection, todoSelectionReady } from '@/lib/desktopTodoPreferences'
import type { TodoSelection, TodoWindowPreferences } from '@/lib/desktopTodoProtocol'

const error = ref(''), busy = ref(false), search = ref('')
const preferences = computed(() => desktopTodoState.value.preferences)
const disabled = computed(() => busy.value || databaseBusy.value || !todoSelectionReady.value)
const sourceOptions = [{ value: 'today', label: '今天与逾期任务' }, { value: 'manual', label: '手动选择任务' }, { value: 'tag', label: '按任务标签' }]
const tagOptions = computed(() => [...new Set(tasks.value.flatMap(task => task.tags))].sort().map(value => ({ value, label: value })))
const filtered = computed(() => tasks.value.filter(task => task.title.toLowerCase().includes(search.value.toLowerCase())).sort((a, b) => Number(a.done) - Number(b.done)))
async function run(action: () => Promise<unknown>) {
  busy.value = true; error.value = ''
  try { await action() } catch (reason) { error.value = reason instanceof Error ? reason.message : String(reason) }
  finally { busy.value = false }
}
function configure(key: keyof TodoWindowPreferences, event: Event) {
  const input = event.target as HTMLInputElement
  void run(async () => { try { await configureDesktopTodo({ [key]: input.checked }) } finally { input.checked = preferences.value[key] } })
}
function select(patch: Partial<TodoSelection>) { void run(() => saveTodoSelection(patch)) }
function choose(key: 'selectedIds' | 'lockedIds', id: string, event: Event) {
  const input = event.target as HTMLInputElement, checked = input.checked
  void run(async () => { try { await saveTodoSelection({ [key]: checked ? [...todoSelection.value[key], id] : todoSelection.value[key].filter(value => value !== id) }) } finally { input.checked = todoSelection.value[key].includes(id) } })
}
function retry() { window.dispatchEvent(new Event('desktop-todo-retry')) }
onMounted(() => { void run(initializeDesktopTodo) })
</script>

<template>
  <section class="settings-stack" aria-label="桌面清单设置">
    <section class="settings-card space-y-3">
      <div class="settings-row"><div class="settings-row-copy"><h3 class="settings-section-title">桌面清单</h3><p class="settings-description">让待办事项留在桌面，关闭主窗口后仍可继续使用。</p></div><span class="settings-status" :class="preferences.enabled ? 'text-ok' : 'text-t3'">{{ preferences.enabled ? '已开启' : '已关闭' }}</span></div>
      <label class="settings-row min-h-11 cursor-pointer text-sm text-t1"><span class="settings-row-copy">开启桌面清单</span><input type="checkbox" :checked="preferences.enabled" :disabled="disabled" @change="configure('enabled', $event)" /></label>
      <p class="desktop-todo-appearance-note settings-description">跟随「{{ INTERFACE_STYLES.find(style => style.key === interfaceStyle)?.label }}」风格、明暗和配色。任务与主窗口共用同一份数据。</p>
    </section>
    <section class="settings-card space-y-2">
      <h3 class="settings-section-title">窗口行为</h3>
      <label class="settings-row min-h-11 cursor-pointer text-sm text-t2"><span class="settings-row-copy">始终显示在其他窗口上方</span><input type="checkbox" :checked="preferences.pinned" :disabled="busy" @change="configure('pinned', $event)" /></label>
      <label class="settings-row min-h-11 cursor-pointer text-sm text-t2"><span class="settings-row-copy">靠近屏幕边缘时吸附</span><input type="checkbox" :checked="preferences.snap" :disabled="busy" @change="configure('snap', $event)" /></label>
    </section>
    <section class="settings-card space-y-3">
      <h3 class="settings-section-title">清单来源</h3>
      <div><label id="todo-source-label" class="mb-2 block text-sm text-t2">显示哪些任务</label><AppSelect :model-value="todoSelection.source" :options="sourceOptions" :disabled="disabled" aria-labelledby="todo-source-label" @update:model-value="select({ source: $event as TodoSelection['source'] })" /></div>
      <div v-if="todoSelection.source === 'tag'"><label id="todo-tag-label" class="mb-2 block text-sm text-t2">任务标签</label><AppSelect :model-value="todoSelection.tag" :options="tagOptions" :disabled="disabled" placeholder="选择标签" aria-labelledby="todo-tag-label" @update:model-value="select({ tag: String($event) })" /><p v-if="!tagOptions.length" class="settings-description">为任务添加标签后，即可在此按标签展示。</p></div>
      <p v-if="todoSelection.source === 'manual'" class="settings-description">已选择 {{ todoSelection.selectedIds.length }} 项任务。可在下方列表调整。</p>
    </section>
    <details class="settings-card settings-disclosure" :open="todoSelection.source === 'manual'">
      <summary class="settings-section-title">任务选择与锁定可见<span class="settings-status text-t3">{{ todoSelection.lockedIds.length }} 项锁定可见</span></summary>
      <div class="settings-disclosure-body space-y-3">
        <p class="settings-description">应用锁定后，仅展示你指定任务的标题、日期和时间快照，不能编辑；解锁后更新。退出应用后清除快照。重复任务的下一次需要重新选择。</p>
        <label class="settings-field">搜索任务<input v-model="search" class="control-input px-3" placeholder="输入任务标题" type="search" /></label>
        <div class="max-h-72 overflow-y-auto rounded-xl border border-line px-3" tabindex="0" aria-label="可选任务列表">
          <div v-for="task in filtered" :key="task.id" class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-2 last:border-0">
            <div class="min-w-0 flex-1"><p class="break-words text-sm text-t1" :class="{ 'line-through': task.done }">{{ task.title }}</p><p class="text-xs text-t3">{{ task.date || '未安排日期' }} {{ task.time }}</p></div>
            <div class="flex flex-wrap gap-3">
              <label v-if="todoSelection.source === 'manual'" class="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-t2"><input type="checkbox" :checked="todoSelection.selectedIds.includes(task.id)" :disabled="disabled" @change="choose('selectedIds', task.id, $event)" />加入清单</label>
              <label class="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-t2"><input type="checkbox" :checked="todoSelection.lockedIds.includes(task.id)" :disabled="disabled" @change="choose('lockedIds', task.id, $event)" />锁定可见</label>
            </div>
          </div>
          <p v-if="!filtered.length" class="py-6 text-center text-sm text-t3">{{ tasks.length ? '没有匹配的任务，请尝试其他关键词。' : '还没有任务。创建任务后，可在此选择。' }}</p>
        </div>
      </div>
    </details>
    <details class="settings-card settings-disclosure"><summary class="settings-section-title">窗口恢复</summary><div class="settings-disclosure-body space-y-3"><p class="settings-description">找不到清单或显示异常时，可重新定位窗口、展开内容或重新连接。</p><div class="settings-actions flex flex-wrap gap-2"><button class="ui-secondary-button" :disabled="busy" @click="run(() => invoke('todo_reset_position'))">找回窗口位置</button><button class="ui-secondary-button" :disabled="busy" @click="run(() => configureDesktopTodo({ collapsed: false }))">展开清单</button><button class="ui-secondary-button" :disabled="busy" @click="retry">重新连接</button></div></div></details>
    <p v-if="error" role="alert" class="settings-note text-sm text-danger">{{ error }}</p>
    <p class="settings-description">关闭清单不会删除任务。从系统托盘退出 Personal Hub 时，清单也会关闭。</p>
  </section>
</template>
