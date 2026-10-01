<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowUpRight, Plus, X } from '@lucide/vue'
import { tasks, removeTask, toggleTaskDone } from '@/stores/tasks'
import { memos } from '@/stores/memos'
import { dayBlocks } from '@/lib/calendar'
import { confirmAction } from '@/lib/confirmAction'
import CalendarDayRhythm from './CalendarDayRhythm.vue'
import CalendarDirections from './CalendarDirections.vue'
import CalendarTaskContext from './CalendarTaskContext.vue'
import TaskCompletionModal from './TaskCompletionModal.vue'
import { completeWithProgress, type CompletionInput } from '@/lib/taskCompletion'
import { toast } from '@/lib/toast'
import type { Memo, Task } from '@/types'

const props = defineProps<{ mode: 'agenda' | 'memos' | 'directions'; selected: string; visibleTasks: Task[]; now: Date; focusedTask?: string }>()
const emit = defineEmits<{ close: []; create: [date: string, time: string]; edit: [task: Task]; memo: [memo: Memo | null]; schedule: [memo: Memo]; step: [draft: Partial<Task>, time: string]; suggest: [task: Task, date: string, time: string]; locate: [date: string] }>()
const host = ref<HTMLElement | null>(null)
const completing = ref<Task | null>(null)
watch(() => [props.mode, props.selected], async () => { await nextTick(); host.value?.querySelector('.inspector-content')?.scrollTo({ top: 0 }) })
watch(() => props.focusedTask, async () => { await nextTick(); Array.from(host.value?.querySelectorAll<HTMLElement>('[data-task-id]') ?? []).find(el => el.dataset.taskId === props.focusedTask)?.scrollIntoView({ block: 'nearest' }) }, { immediate: true })
function confirmCompletion(input: CompletionInput): void { if (completing.value && completeWithProgress(completing.value.id, input)) toast('已留下这一步'); completing.value = null }
const query = ref('')
const tray = ref<'memos' | 'tasks'>('memos')
const dayTasks = computed(() => [...props.visibleTasks.filter(t => t.date === props.selected), ...dayBlocks(props.visibleTasks, props.selected).filter(b => b.continued).map(b => b.task)].sort((a, b) => a.time.localeCompare(b.time) || b.priority - a.priority))
const conflicts = computed(() => dayBlocks(tasks.value.filter(t => !t.done), props.selected).filter(b => b.lanes > 1).length)
const pending = computed(() => tasks.value.filter(t => !t.date && !t.done))
const memoList = computed(() => [...memos.value].filter(m => `${m.title} ${m.content}`.toLowerCase().includes(query.value.trim().toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt))
function linkedCount(memo: Memo): number { return tasks.value.filter(t => t.links?.some(link => link.kind === 'memos' && link.id === memo.id)).length }
async function complete(task: Task): Promise<void> {
  if (!task.done) { completing.value = task; return }
  if (await confirmAction(`重新打开「${task.title}」？`)) toggleTaskDone(task.id)
}
async function deleteTask(task: Task): Promise<void> {
  if (await confirmAction(`删除「${task.title}」？它也会从计划中移除，关联便签会保留。`)) removeTask(task.id)
}
</script>

<template>
  <aside ref="host" class="calendar-inspector" :aria-label="mode === 'agenda' ? '日期详情' : mode === 'memos' ? '便签面板' : '方向与足迹'" tabindex="-1">
    <header class="inspector-header"><div><h2 class="text-base font-semibold text-t1">{{ mode === 'agenda' ? '当日安排' : mode === 'memos' ? '灵感待安排' : '方向与足迹' }}</h2><p class="mt-1 text-xs text-t3">{{ selected }} · {{ new Date(`${selected}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'long' }) }}</p></div><button class="calendar-icon" aria-label="关闭侧面板" @click="emit('close')"><X class="h-5 w-5" /></button></header>
    <div class="inspector-content">
      <template v-if="mode === 'agenda'">
        <CalendarDayRhythm :date="selected" :now="now" @create="(date, time) => emit('create', date, time)" @suggest="(task, date, time) => emit('suggest', task, date, time)" /><section aria-label="当日安排" class="mt-6">
          <p v-if="conflicts" class="mb-4 rounded-lg bg-warn/10 p-3 text-xs leading-5 text-warn">{{ conflicts }} 项未完成安排处在重叠时段，打开任务可调整时间。</p>
          <p v-if="!dayTasks.length" class="py-8 text-sm leading-6 text-t3">这一天还很宽敞。可以安排一件小事，也可以留白。</p>
          <article v-for="task in dayTasks" :key="task.id" class="inspector-task" :data-task-id="task.id" :class="{ 'ring-2 ring-primary': focusedTask === task.id }">
            <p class="flex items-center justify-between text-xs text-t3"><span>{{ task.date !== selected ? '接前日' : task.time || '不定时' }}</span><span>{{ task.done ? '已完成' : `${task.estimatedMinutes ?? 30} 分钟` }}</span></p>
            <button class="min-h-11 w-full break-words py-2 text-left text-sm font-medium text-t1 hover:text-primary" :class="{ 'line-through': task.done }" @click="emit('edit', task)">{{ task.title }}</button>
            <CalendarTaskContext :task="task" /><RouterLink v-if="!task.done" :to="{ path: '/focus', query: { task: task.id } }" class="mb-2 flex min-h-11 items-center text-xs text-primary">专注这件事 →</RouterLink>
            <div class="flex gap-4"><button class="min-h-11 text-xs text-primary hover:underline" @click="emit('edit', task)">编辑安排</button><button class="min-h-11 text-xs text-primary hover:underline" @click="complete(task)">{{ task.done ? '重新打开' : '完成任务' }}</button><button class="ml-auto min-h-11 text-xs text-danger hover:underline" @click="deleteTask(task)">删除</button></div>
          </article>
          <button class="ui-secondary-button mt-3 w-full gap-2" @click="emit('create', selected, '')"><Plus class="h-4 w-4" />为这一天添加任务</button>
        </section>
      </template>
      <CalendarDirections v-else-if="mode === 'directions'" :date="selected" :now="now" @step="(draft, time) => emit('step', draft, time)" @edit="emit('edit', $event)" @locate="emit('locate', $event)" />
      <template v-else>
        <div class="flex items-center justify-between"><p class="text-xs text-t3">把想法放进选中的这一天</p><button class="calendar-icon" aria-label="写便签" title="写便签" @click="emit('memo', null)"><Plus class="h-4 w-4" /></button></div>
        <div class="inspector-tabs" role="group" aria-label="待安排来源"><button :class="{ 'is-active': tray === 'memos' }" :aria-pressed="tray === 'memos'" @click="tray = 'memos'">便签 {{ memos.length }}</button><button :class="{ 'is-active': tray === 'tasks' }" :aria-pressed="tray === 'tasks'" @click="tray = 'tasks'">收集箱 {{ pending.length }}</button></div>
        <template v-if="tray === 'memos'">
          <input v-model="query" class="control-input my-4 w-full px-3" aria-label="查找便签" placeholder="查找便签" />
          <article v-for="memo in memoList" :key="memo.id" class="inspector-task">
            <button class="min-h-11 w-full truncate text-left text-sm font-medium text-t1 hover:text-primary" @click="emit('memo', memo)">{{ memo.title || '无标题' }}</button>
            <p class="line-clamp-4 whitespace-pre-wrap break-words text-xs leading-6 text-t3">{{ memo.content }}</p>
            <p v-if="linkedCount(memo)" class="mt-3 text-xs text-t4">已关联 {{ linkedCount(memo) }} 项任务</p>
            <button class="mt-2 flex min-h-11 items-center gap-1 text-xs text-primary hover:underline" @click="emit('schedule', memo)">安排到 {{ selected.slice(5) }}<ArrowUpRight class="h-3.5 w-3.5" /></button>
          </article>
          <p v-if="!memoList.length" class="py-6 text-sm leading-6 text-t3">{{ query ? '没有找到便签。' : '写下一个想法，再为它挑个时间。' }}</p>
          <RouterLink to="/memos" class="mt-4 inline-flex min-h-11 items-center gap-2 text-xs text-primary hover:underline">打开全部备忘录<ArrowUpRight class="h-3.5 w-3.5" /></RouterLink>
        </template>
        <template v-else><p v-if="!pending.length" class="py-6 text-sm text-t3">没有待安排的任务。</p><button v-for="task in pending" :key="task.id" class="min-h-11 w-full truncate border-b border-line py-3 text-left text-sm text-t2 hover:text-primary" @click="emit('edit', task)">{{ task.title }} · 选择日期</button></template>
      </template>
    </div>
    <TaskCompletionModal :open="Boolean(completing)" :task="completing" @close="completing = null" @confirm="confirmCompletion" />
  </aside>
</template>

<style scoped>
.calendar-inspector { display: flex; height: 100%; flex-direction: column; background: var(--tk-surface); border-left: 1px solid var(--tk-line); }
.inspector-header { display: flex; flex-shrink: 0; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--tk-line); }
.inspector-content { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 20px; }
.inspector-task { margin-bottom: 12px; padding: 12px; border: 1px solid var(--tk-line); border-radius: 12px; }
.inspector-tabs { display: flex; border-bottom: 1px solid var(--tk-line); }
.inspector-tabs button { flex: 1; min-height: 44px; color: var(--tk-t3); font-size: 12px; border-bottom: 2px solid transparent; }
.inspector-tabs button:hover { background: var(--tk-surface-2); }
.inspector-tabs .is-active { color: var(--tk-primary); border-bottom-color: var(--tk-primary); }
</style>
