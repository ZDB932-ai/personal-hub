<script setup lang="ts">
import { ref } from 'vue'
import { ArrowRight, CalendarDays, CheckCheck, ChevronDown, Plus } from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import DashboardStyleHeader from '@/components/DashboardStyleHeader.vue'
import TaskModal from '@/components/TaskModal.vue'
import TaskCompletionModal from '@/components/TaskCompletionModal.vue'
import TodayTaskList from '@/components/TodayTaskList.vue'
import TodayQuickAdd from '@/components/TodayQuickAdd.vue'
import { useTodayWorkspace } from '@/composables/useTodayWorkspace'
import { toggleTaskDone } from '@/stores/tasks'
import { flushPendingSave } from '@/stores/database'
import { completeWithProgress, type CompletionInput } from '@/lib/taskCompletion'
import { toast } from '@/lib/toast'
import { interfaceStyle } from '@/stores/theme'
import { isTauriDesktop } from '@/lib/desktop'
import { desktopTodoState, openDesktopTodoSettings } from '@/lib/desktopTodo'
import type { Task } from '@/types'

const { day, dateLabel, opening, daily, pending, completed, groups, next, timed, upcoming, overdue, capacity, load } = useTodayWorkspace()
const showTask = ref(false)
const editing = ref<Task | null>(null)
const completing = ref<Task | null>(null)
const saving = ref(false)
const saveError = ref(false)
const agendaExpanded = ref(true)
function edit(task: Task | null = null): void { editing.value = task; showTask.value = true }
async function save(): Promise<void> {
  saving.value = true
  try { await flushPendingSave(); saveError.value = false }
  catch { saveError.value = true }
  finally { saving.value = false }
}
async function toggle(task: Task): Promise<void> {
  if (saving.value) return
  if (!task.done) { completing.value = task; return }
  toggleTaskDone(task.id)
  await save()
}
async function finish(input: CompletionInput): Promise<void> {
  if (!completing.value || saving.value) return
  if (!completeWithProgress(completing.value.id, input)) { completing.value = null; return }
  completing.value = null
  await save()
  if (!saveError.value) toast('已完成，进展已记入回顾')
}
</script>

<template>
  <div class="today-workspace">
    <PageHeader v-if="interfaceStyle === 'classic'" title="今天" :description="dateLabel"><template #actions><button :class="next ? 'ui-secondary-button' : 'ui-primary-button'" class="gap-2" @click="edit()"><Plus class="h-4 w-4" />新建任务</button></template></PageHeader>
    <DashboardStyleHeader v-else :style="interfaceStyle" :day="day" :date-label="dateLabel" :pending="pending.length" :completed="completed.length" :total="daily.length" :load="load" :capacity="capacity" @create="edit()" />
    <p v-if="opening" class="mt-4 break-words text-sm leading-6 text-primary">昨天留给今天：{{ opening }}</p>
    <RouterLink v-if="upcoming" :to="{ path: '/calendar', query: { date: day } }" class="today-upcoming"><CalendarDays class="h-4 w-4 shrink-0" /><span class="shrink-0 text-xs">{{ upcoming.label }} · {{ upcoming.task.time }}</span><span class="min-w-0 flex-1 truncate text-sm text-t1">{{ upcoming.task.title }}</span><ArrowRight class="h-4 w-4 shrink-0" /></RouterLink>
    <div v-if="saveError" role="alert" class="mt-4 rounded-lg border border-danger/30 bg-surface p-4 text-sm text-danger">修改尚未保存，请重试。<button class="ui-secondary-button ml-3" :disabled="saving" @click="save">重试保存</button></div>
    <section v-if="next" class="today-resume" aria-label="从这里继续"><div class="min-w-0"><p class="text-xs text-t3">从上次停下的地方继续</p><h2 class="mt-2 break-words text-lg font-semibold text-t1">{{ next.title }}</h2><p class="mt-2 line-clamp-2 text-sm leading-6 text-t3">{{ next.resumeNextStep || next.resumeNote }}</p></div><RouterLink :to="{ path: '/focus', query: { task: next.id, from: '/' } }" class="ui-primary-button shrink-0 gap-2">从这里继续<ArrowRight class="h-4 w-4" /></RouterLink></section>
    <div class="today-columns">
      <section class="today-task-panel min-w-0" aria-label="今天的任务">
        <div class="today-section-header"><h2 class="text-base font-semibold text-t1">今天的任务</h2><div class="flex flex-wrap items-center justify-end gap-2"><span class="text-xs tabular-nums text-t3">完成 {{ completed.length }} / {{ daily.length }}</span><button v-if="isTauriDesktop()" class="ui-secondary-button today-desktop-todo-entry" @click="openDesktopTodoSettings">{{ desktopTodoState.preferences.enabled ? '管理桌面清单' : '开启桌面清单' }}</button></div></div>
        <TodayQuickAdd :date="day" />
        <RouterLink v-if="overdue" to="/today?view=inbox" class="today-overdue">{{ overdue }} 项任务需要重新安排<ArrowRight class="h-4 w-4" /></RouterLink>
        <div v-if="!pending.length" class="today-empty"><CheckCheck class="h-7 w-7 text-primary" /><h3 class="mt-4 text-base font-medium text-t1">{{ completed.length ? '今天的任务已完成' : '今天还没有安排' }}</h3><p class="mt-2 text-sm text-t3">{{ completed.length ? '可以留下今天的进展，也可以安心休息。' : '在上方记下一件想做的事，或从待安排中挑选。' }}</p><div class="mt-4 flex flex-wrap gap-2"><RouterLink :to="completed.length ? '/review?tab=closing' : '/today?view=inbox'" class="ui-ghost-button">{{ completed.length ? '一天收尾' : '查看待安排' }}</RouterLink></div></div>
        <section v-for="group in groups" :key="group.label" class="today-task-group"><h3 v-if="groups.length > 1 || group.label === '今日重点'" class="text-xs text-t3">{{ group.label }} · {{ group.items.length }}</h3><TodayTaskList :day="day" :items="group.items" :busy="saving" @edit="edit" @toggle="toggle" /></section>
        <details v-if="completed.length" class="today-completed"><summary>已完成 · {{ completed.length }}</summary><TodayTaskList :day="day" :items="completed" :busy="saving" @edit="edit" @toggle="toggle" /></details>
        <div class="today-footer-links"><RouterLink to="/today?view=all">查看已排期任务<ArrowRight class="h-4 w-4" /></RouterLink><RouterLink to="/focus">选择一件事开始<ArrowRight class="h-4 w-4" /></RouterLink></div>
      </section>
      <aside class="today-agenda" :class="{ 'is-collapsed': !agendaExpanded }" aria-label="今日时间安排"><div class="today-section-header"><h2 class="text-base font-semibold text-t1">今日时间安排</h2><button class="today-agenda-toggle" :aria-expanded="agendaExpanded" aria-controls="today-agenda-body" :aria-label="agendaExpanded ? '收起今日时间安排' : '展开今日时间安排'" @click="agendaExpanded = !agendaExpanded"><CalendarDays class="h-4 w-4" /><ChevronDown class="h-3 w-3" /></button></div><div v-show="agendaExpanded" id="today-agenda-body" class="today-agenda-body"><p class="text-xs leading-6 text-t3">待办预计 {{ load }} / 可用 {{ capacity }} 分钟<span v-if="load > capacity" class="block text-warn">超出 {{ load - capacity }} 分钟，可到计划中调整</span></p><div v-if="timed.length" class="today-agenda-list"><button v-for="task in timed" :key="task.id" @click="edit(task)"><time class="text-xs tabular-nums text-primary">{{ task.time }}</time><span class="mt-1 block break-words text-sm text-t1">{{ task.title }}</span><span v-if="task.estimatedMinutes" class="mt-1 block text-xs text-t3">{{ task.estimatedMinutes }} 分钟</span></button></div><p v-else class="py-5 text-sm leading-6 text-t3">还没有定时任务，可以到日历安排时间或留白。</p><RouterLink :to="{ path: '/calendar', query: { date: day } }" class="today-agenda-link">到日历安排时间<ArrowRight class="h-4 w-4" /></RouterLink><div class="today-agenda-bottom"><RouterLink to="/collect">先记下一个想法<ArrowRight class="h-4 w-4" /></RouterLink><RouterLink to="/review?tab=closing">收好今天<ArrowRight class="h-4 w-4" /></RouterLink></div></div></aside>
    </div>
    <TaskModal :open="showTask" :entry="editing" :default-date="day" @close="showTask = false" />
    <TaskCompletionModal :open="Boolean(completing)" :task="completing" @close="completing = null" @confirm="finish" />
  </div>
</template>
