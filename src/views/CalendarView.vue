<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Flag, CalendarCheck, ChevronLeft, ChevronRight, Menu, Plus, Search, StickyNote, X } from '@lucide/vue'
import TaskModal from '@/components/TaskModal.vue'
import LongPlanModal from '@/components/LongPlanModal.vue'
import { longPlans, planner } from '@/stores/planning'
import MemoModal from '@/components/MemoModal.vue'
import CalendarTimeline from '@/components/CalendarTimeline.vue'
import CalendarMiniMonth from '@/components/CalendarMiniMonth.vue'
import CalendarInspector from '@/components/CalendarInspector.vue'
import { tasks } from '@/stores/tasks'
import { memos } from '@/stores/memos'
import { interfaceStyle } from '@/stores/theme'
import { WORKSPACE_LABELS } from '@/lib/interfaceStyles'
import { timeMinutes, dayBlocks, lunarLabel, memoDraft, monthDates, shiftMonth } from '@/lib/calendar'
import { shiftYMD, toYMD, weekDates, weekStartYMD } from '@/lib/utils'
import type { LongPlan, Memo, Task } from '@/types'
import '@/calendar-workspace.css'

const route = useRoute()
const router = useRouter()
const now = ref(new Date())
const today = computed(() => toYMD(now.value))
const selected = ref(today.value)
const view = ref<'month' | 'week' | 'day'>(window.matchMedia('(max-width: 767px)').matches ? 'day' : 'week')
const views = [{ id: 'month', label: '月' }, { id: 'week', label: '周' }, { id: 'day', label: '日' }] as const
const showSidebar = ref(window.matchMedia('(min-width: 1100px)').matches)
const query = ref('')
const searchOpen = ref(false)
const searchField = ref<HTMLInputElement | null>(null)
const searchButton = ref<HTMLButtonElement | null>(null)
const sidebarButton = ref<HTMLButtonElement | null>(null)
const showDone = ref(true)
const showTasks = ref(true)
const showLinked = ref(true)
const panel = ref<'agenda' | 'memos' | 'directions' | null>(null)
const panelHost = ref<HTMLElement | null>(null)
const timeline = ref<InstanceType<typeof CalendarTimeline> | null>(null)
const editingGoal = ref<LongPlan | null>(null)
const milestones = computed(() => longPlans.value.filter(goal => goal.status === 'active' && goal.targetDate))
const proposal = ref<{ date: string; time: string }>()
const focusedTask = ref('')
const showTask = ref(false)
const editingTask = ref<Task | null>(null)
const draft = ref<Partial<Task>>({})
const showMemo = ref(false)
const editingMemo = ref<Memo | null>(null)
let returnFocus: HTMLElement | null = null
let timer: ReturnType<typeof setInterval> | undefined
const sidebarMedia = window.matchMedia('(min-width: 1100px)')
function adaptSidebar(event: MediaQueryListEvent): void { if (!event.matches) showSidebar.value = false }
function toggleSidebar(): void { showSidebar.value = !showSidebar.value; if (showSidebar.value && !sidebarMedia.matches) panel.value = null }
const dates = computed(() => view.value === 'month' ? monthDates(selected.value) : view.value === 'week' ? weekDates(weekStartYMD(selected.value)) : [selected.value])
const periodTitle = computed(() => `${selected.value.slice(0, 4)}年${Number(selected.value.slice(5, 7))}月`)
const isLinked = (task: Task) => Boolean(task.links?.some(link => link.kind === 'memos'))
const visibleTasks = computed(() => tasks.value.filter(t => (showDone.value || !t.done) && (isLinked(t) ? showLinked.value : showTasks.value) && `${t.title} ${t.notes} ${t.tags.join(' ')}`.toLowerCase().includes(query.value.trim().toLowerCase())))
const tasksByDate = computed(() => new Map(dates.value.map(date => [date, [...visibleTasks.value.filter(t => t.date === date), ...dayBlocks(visibleTasks.value, date).filter(b => b.continued).map(b => b.task)].sort((a, b) => a.time.localeCompare(b.time) || b.priority - a.priority)])))
const selectedCount = computed(() => tasks.value.filter(task => task.date === selected.value && !task.done).length)
const periodTasks = computed(() => [...new Map([...tasksByDate.value.values()].flat().map(task => [task.id, task])).values()])
const periodPending = computed(() => periodTasks.value.filter(task => !task.done).length)

function navigate(amount: number): void { selected.value = view.value === 'month' ? shiftMonth(selected.value, amount) : shiftYMD(selected.value, amount * (view.value === 'week' ? 7 : 1)) }
async function goToday(): Promise<void> { now.value = new Date(); selected.value = today.value; await nextTick(); timeline.value?.scrollToTime() }
function create(date = selected.value, time = '', initial: Partial<Task> = {}): void { proposal.value = undefined; selected.value = date; editingTask.value = null; draft.value = { estimatedMinutes: 30, ...initial, time }; showTask.value = true }
function edit(task: Task): void { proposal.value = undefined; editingTask.value = task; showTask.value = true }
function suggest(task: Task, date: string, time: string): void { editingTask.value = task; proposal.value = { date, time }; showTask.value = true }
async function locateTask(): Promise<void> {
  const task = tasks.value.find(item => item.id === route.query.task)
  if (!task?.date) return
  selected.value = task.date; view.value = 'day'; query.value = ''; showDone.value = true; showTasks.value = true; showLinked.value = true; focusedTask.value = task.id
  await setPanel('agenda'); await nextTick(); timeline.value?.scrollToMinute(task.time ? timeMinutes(task.time) : 8 * 60)
  await router.replace({ path: '/calendar' })
}
watch(() => route.query.task, () => { void locateTask() })
function createFromMemo(memo: Memo): void { create(selected.value, '', memoDraft(memo)) }
function editMemo(memo: Memo | null): void { editingMemo.value = memo; showMemo.value = true }
async function setPanel(mode: 'agenda' | 'memos' | 'directions' | null): Promise<void> {
  if (!mode) { panel.value = null; await nextTick(); returnFocus?.focus(); return }
  if (!panel.value) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  panel.value = mode
  if (window.innerWidth < 1100) showSidebar.value = false
  await nextTick()
  panelHost.value?.querySelector<HTMLElement>('.calendar-inspector')?.focus()
}
function selectDay(date: string, detail = false): void { selected.value = date; if (detail) void setPanel('agenda') }
async function toggleSearch(): Promise<void> {
  searchOpen.value = !searchOpen.value
  if (!searchOpen.value) query.value = ''
  await nextTick()
  if (searchOpen.value) searchField.value?.focus(); else searchButton.value?.focus()
}
function onKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || document.querySelector('[role="dialog"]')) return
  if (panel.value) { void setPanel(null); event.preventDefault() }
  else if (searchOpen.value) { void toggleSearch(); event.preventDefault() }
  else if (showSidebar.value && window.innerWidth < 1100) { showSidebar.value = false; sidebarButton.value?.focus(); event.preventDefault() }
}
onMounted(() => {
  void locateTask()
  const date = typeof route.query.date === 'string' ? route.query.date : ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(`${date}T12:00:00`).getTime())) { selected.value = date; void setPanel('agenda') }
  const memo = memos.value.find(m => m.id === route.query.memo)
  if (memo) { createFromMemo(memo); void router.replace({ path: '/calendar' }) }
  timer = setInterval(() => { now.value = new Date() }, 30_000)
  window.addEventListener('keydown', onKey)
  sidebarMedia.addEventListener('change', adaptSidebar)
})
onUnmounted(() => { clearInterval(timer); window.removeEventListener('keydown', onKey); sidebarMedia.removeEventListener('change', adaptSidebar) })
</script>

<template>
  <div class="calendar-workspace" :data-calendar-view="view">
    <header class="calendar-toolbar">
      <div class="calendar-brand"><button ref="sidebarButton" class="calendar-icon ui-icon-button" aria-label="切换日历侧栏" :aria-expanded="showSidebar" aria-controls="calendar-navigation" @click="toggleSidebar"><Menu class="h-5 w-5" /></button><h1>日历</h1></div>
      <div class="calendar-period-nav"><button class="calendar-today-button ui-secondary-button" @click="goToday">今天</button><button class="calendar-icon ui-icon-button" aria-label="上一段日期" @click="navigate(-1)"><ChevronLeft class="h-5 w-5" /></button><button class="calendar-icon ui-icon-button" aria-label="下一段日期" @click="navigate(1)"><ChevronRight class="h-5 w-5" /></button></div>
      <div class="calendar-period-title" aria-live="polite"><h2>{{ periodTitle }}</h2><span>农历{{ lunarLabel(selected, true) }}</span></div>
      <div class="calendar-toolbar-actions">
        <button ref="searchButton" class="calendar-icon ui-icon-button" :class="{ 'is-active': searchOpen }" aria-label="搜索日历" title="搜索日历" :aria-expanded="searchOpen" @click="toggleSearch"><Search class="h-5 w-5" /></button>
        <div class="calendar-view-switch" role="group" aria-label="日历视图"><button v-for="mode in views" :key="mode.id" :class="{ 'is-active': view === mode.id }" :aria-pressed="view === mode.id" @click="view = mode.id">{{ mode.label }}</button></div>
        <button class="calendar-icon ui-icon-button" :class="{ 'is-active': panel === 'agenda' }" aria-label="当日安排" title="当日安排与留白窗口" :aria-expanded="panel === 'agenda'" @click="setPanel(panel === 'agenda' ? null : 'agenda')"><CalendarCheck class="h-5 w-5" /></button>
        <button class="calendar-icon ui-icon-button calendar-secondary-tool" :class="{ 'is-active': panel === 'memos' }" aria-label="便签" title="便签与收集箱" :aria-expanded="panel === 'memos'" @click="setPanel(panel === 'memos' ? null : 'memos')"><StickyNote class="h-5 w-5" /></button>
        <button class="calendar-icon ui-icon-button calendar-secondary-tool" :class="{ 'is-active': panel === 'directions' }" aria-label="目标与回顾" title="目标与回顾" :aria-expanded="panel === 'directions'" @click="setPanel(panel === 'directions' ? null : 'directions')"><Flag class="h-5 w-5" /></button>
        <button class="calendar-create-compact ui-primary-button" aria-label="安排任务" title="安排任务" @click="create()"><Plus class="h-5 w-5" /></button>
      </div>
    </header>
    <div v-if="searchOpen" class="calendar-search-bar"><Search class="h-4 w-4 text-t3" /><input ref="searchField" v-model="query" type="search" aria-label="搜索日历任务" placeholder="搜索任务、备注或标签" /><span class="text-xs text-t3">{{ visibleTasks.length }} 项</span><button class="calendar-icon ui-icon-button" aria-label="关闭日历搜索" @click="toggleSearch"><X class="h-4 w-4" /></button></div>
    <div class="calendar-body">
      <button v-if="showSidebar" class="calendar-sidebar-backdrop" aria-label="关闭日历侧栏" @click="showSidebar = false; sidebarButton?.focus()"></button>
      <aside v-if="showSidebar" id="calendar-navigation" class="calendar-navigation" aria-label="日历导航">
        <button class="calendar-create-button ui-primary-button" @click="create()"><Plus class="h-6 w-6" />创建任务</button>
        <CalendarMiniMonth :selected="selected" :today="today" :range="dates" @select="selectDay($event)" />
        <button class="calendar-day-summary" @click="setPanel('agenda')"><span>{{ Number(selected.slice(5, 7)) }}月{{ Number(selected.slice(8)) }}日</span><span>{{ selectedCount ? `${selectedCount} 项待办` : '留一点空白' }}</span><ChevronRight class="h-4 w-4" /></button>
        <section class="calendar-sources"><h2>我的日历</h2><label><input v-model="showTasks" type="checkbox" /><span>计划任务</span></label><label class="source-linked"><input v-model="showLinked" type="checkbox" /><span>便签安排</span><StickyNote class="ml-auto h-3.5 w-3.5 text-info" /></label><label><input v-model="showDone" type="checkbox" /><span>显示已完成</span></label></section>
        <button class="calendar-memo-link" @click="setPanel('memos')"><StickyNote class="h-4 w-4" /><span>便签与收集箱</span><span class="ml-auto text-xs text-t4">{{ memos.length }}</span></button>
        <button class="calendar-memo-link" @click="setPanel('directions')"><Flag class="h-4 w-4" /><span>目标与回顾</span></button>
        <details class="calendar-help"><summary>使用提示</summary><p>点击时间格创建任务，半小时为一格。时间块未填写时长时按 30 分钟估算。</p><p>重复任务完成后才生成下一次。便签安排始终保留原文关联。</p><p>迷你月历支持方向键、Home / End 和 Page Up / Down。</p></details>
      </aside>
      <section class="calendar-canvas" aria-label="日历面板">
        <div v-if="interfaceStyle !== 'classic'" class="calendar-style-strip">
          <div class="calendar-style-heading"><span class="calendar-style-index" aria-hidden="true">{{ selected.slice(8) }}</span><div><p class="calendar-style-label">{{ WORKSPACE_LABELS[interfaceStyle].calendar }}</p><p class="calendar-style-caption">{{ view === 'month' ? '整月概览' : view === 'week' ? '本周排期' : '单日安排' }} · {{ selected }}</p></div></div>
          <div class="calendar-style-count"><strong>{{ periodPending }}</strong><span>项待办</span><span class="calendar-style-total"> / {{ periodTasks.length }} 项安排</span></div>
        </div>
        <template v-if="view === 'month'">
          <div class="calendar-month-head"><span v-for="day in ['周一', '周二', '周三', '周四', '周五', '周六', '周日']" :key="day">{{ day }}</span></div>
          <div class="calendar-month-grid"><div v-for="date in dates" :key="date" class="calendar-month-cell" :class="{ 'is-selected': date === selected, 'is-outside': date.slice(0, 7) !== selected.slice(0, 7) }"><button class="calendar-month-date" :class="{ 'is-today': date === today }" :aria-label="`选择 ${date}`" @click="selectDay(date, true)"><span>{{ Number(date.slice(8)) }}</span><span class="calendar-month-lunar">{{ lunarLabel(date) }}</span></button><button v-if="planner.protectedTimes?.some(item => item.date === date)" class="calendar-month-more text-primary" @click="selectDay(date, true)">有保护的留白</button><button v-for="goal in milestones.filter(item => item.targetDate === date).slice(0, 1)" :key="goal.id" class="calendar-month-task text-primary" :title="`目标日 · ${goal.title}`" @click="editingGoal = goal">◇ {{ goal.title }}</button><button v-for="task in (tasksByDate.get(date) ?? []).slice(0, 2)" :key="task.id" class="calendar-month-task" :class="{ 'is-done': task.done, 'is-linked': isLinked(task) }" :title="task.title" @click="edit(task)"><span>{{ task.date !== date ? '接前日' : task.time }}</span> {{ task.title }}</button><button v-if="(tasksByDate.get(date)?.length ?? 0) > 2" class="calendar-month-more" @click="selectDay(date, true)">另 {{ (tasksByDate.get(date)?.length ?? 0) - 2 }} 项</button></div></div>
        </template>
        <CalendarTimeline v-else :key="view" ref="timeline" :dates="dates" :tasks="visibleTasks" :selected="selected" :today="today" :now="now" :milestones="milestones" :protected-times="planner.protectedTimes" @goal="editingGoal = $event" @select="selectDay($event, true)" @create="create" @edit="edit" />
      </section>
      <div v-if="panel" ref="panelHost" class="calendar-panel-host"><CalendarInspector :mode="panel" :selected="selected" :visible-tasks="visibleTasks" :now="now" :focused-task="focusedTask" @step="(draft, time) => create(selected, time, draft)" @suggest="suggest" @locate="selectDay($event, true)" @close="setPanel(null)" @create="create" @edit="edit" @memo="editMemo" @schedule="createFromMemo" /></div>
    </div>
    <TaskModal :open="showTask" :entry="editingTask" :default-date="selected" :default-draft="draft" :schedule-proposal="proposal" @close="showTask = false" />
    <LongPlanModal :open="Boolean(editingGoal)" :entry="editingGoal" @close="editingGoal = null" />
    <MemoModal :open="showMemo" :entry="editingMemo" @close="showMemo = false" />
  </div>
</template>

