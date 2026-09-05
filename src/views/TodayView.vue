<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  CalendarDays,
  CalendarCheck,
  CalendarRange,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Compass,
  Inbox,
  Lightbulb,
  ListPlus,
  ListTodo,
  Pause,
  Pencil,
  Play,
  Plus,
  Search as SearchIcon,
  Sparkles,
  Star,
  Tag as TagIcon,
  Target,
  Trash2,
} from '@lucide/vue'
import {
  addSubTask,
  addTask,
  removeSubTask,
  removeTask,
  setTaskFocus,
  tasks,
  toggleSubTask,
  toggleTaskDone,
  updateTask,
} from '@/stores/tasks'
import {
  applyWeekScheduleDraft,
  createWeekScheduleDraft,
  longPlans,
  plannerEnergyForDate,
  planner,
  removeLongPlan,
  removeWeeklyPlan,
  restoreWeeklyPlan,
  setLongPlanStatus,
  setPlannerDayEnergy,
  toggleRestDate,
  undoWeekSchedule,
  weeklyPlans,
} from '@/stores/planning'
import TaskModal from '@/components/TaskModal.vue'
import TaskCompletionModal from '@/components/TaskCompletionModal.vue'
import TaskDeleteModal from '@/components/TaskDeleteModal.vue'
import TaskRow from '@/components/TaskRow.vue'
import PageHeader from '@/components/PageHeader.vue'
import AppDatePicker from '@/components/AppDatePicker.vue'
import CardActionMenu from '@/components/CardActionMenu.vue'
import GentlePauseModal from '@/components/GentlePauseModal.vue'
import GentleResetModal from '@/components/GentleResetModal.vue'
import OverdueTaskQueueModal from '@/components/OverdueTaskQueueModal.vue'
import LongPlanModal from '@/components/LongPlanModal.vue'
import PlanDeleteModal from '@/components/PlanDeleteModal.vue'
import WeekSchedulePreviewModal from '@/components/WeekSchedulePreviewModal.vue'
import WeeklyPlanModal from '@/components/WeeklyPlanModal.vue'
import { toast } from '@/lib/toast'
import { dispatchToAgent } from '@/lib/aiopencode'
import { parseQuickInput } from '@/lib/quickparse'
import { nextOccurrence, shiftYMD, todayYMD, weekDates, weekStartYMD, weekdayLabel } from '@/lib/utils'
import type { WeekScheduleDraft, WeeklyPlanRemoval } from '@/stores/planning'
import type { LongPlan, PlannerEnergy, Task, WeeklyPlan } from '@/types'

const today = todayYMD()
const route = useRoute()
const router = useRouter()
const selected = ref(today)
const weekStart = ref(weekStartYMD(today))
const selectedWeekDate = ref(today)
const view = ref<'today' | 'week' | 'inbox' | 'long' | 'all' | 'done'>('today')
const searchQ = ref('')
const activeTag = ref<string | null>(null)
const quickInput = ref('')
const quickUndo = ref<{ id: string; title: string } | null>(null)
const showModal = ref(false)
const editing = ref<Task | null>(null)
const completing = ref<Task | null>(null)
const deleting = ref<Task | null>(null)
const deleteMode = ref<'delete' | 'cancel'>('delete')
const showWeeklyPlanModal = ref(false)
const editingWeeklyPlan = ref<WeeklyPlan | null>(null)
const presetLongPlanId = ref('')
const schedulePlan = ref<WeeklyPlan | null>(null)
const scheduleDraft = ref<WeekScheduleDraft | null>(null)
const lastSchedule = ref<{ planId: string; taskIds: string[] } | null>(null)
const showLongPlanModal = ref(false)
const editingLongPlan = ref<LongPlan | null>(null)
const deletingPlan = ref<{ kind: '周计划' | '长期方向'; plan: WeeklyPlan | LongPlan } | null>(null)
const showGentlePause = ref(false)
const showGentleReset = ref(false)
const showOverdueQueue = ref(false)
const lastRemovedWeeklyPlan = ref<WeeklyPlanRemoval | null>(null)
let weeklyDeleteUndoTimer: ReturnType<typeof setTimeout> | null = null
let quickUndoTimer: ReturnType<typeof setTimeout> | null = null

const VIEWS = [
  { key: 'today' as const, label: '今天', icon: CalendarCheck },
  { key: 'week' as const, label: '本周', icon: CalendarRange },
  { key: 'inbox' as const, label: '待安排', icon: Inbox },
  { key: 'long' as const, label: '长期方向', icon: Compass },
  { key: 'all' as const, label: '全部', icon: ListTodo },
  { key: 'done' as const, label: '已完成', icon: CheckCheck },
]

const ENERGY_OPTIONS: { value: PlannerEnergy; label: string }[] = [
  { value: 'gentle', label: '想慢一点' },
  { value: 'steady', label: '平稳' },
  { value: 'focused', label: '有余力' },
]

function shiftDate(days: number): void {
  selected.value = shiftYMD(selected.value, days)
}

function shiftWeek(amount: number): void {
  weekStart.value = shiftYMD(weekStart.value, amount * 7)
  selectedWeekDate.value = weekDates(weekStart.value).includes(today) ? today : weekStart.value
  selected.value = selectedWeekDate.value
}

function returnToCurrentWeek(): void {
  weekStart.value = weekStartYMD(today)
  selectedWeekDate.value = today
  selected.value = today
}

function selectWeekDay(date: string): void {
  selectedWeekDate.value = date
  selected.value = date
}

function openCreate(): void {
  editing.value = null
  showModal.value = true
}

function openEdit(task: Task): void {
  editing.value = task
  showModal.value = true
}

function openTaskFromDesktop(rawTaskId: unknown): void {
  if (typeof rawTaskId !== 'string') return
  const task = tasks.value.find((item) => item.id === rawTaskId)
  if (!task) return
  if (task.date) {
    selected.value = task.date
    selectedWeekDate.value = task.date
    weekStart.value = weekStartYMD(task.date)
    view.value = 'today'
  } else {
    view.value = 'inbox'
  }
  searchQ.value = ''
  activeTag.value = null
  openEdit(task)
  void router.replace({ path: '/today' })
}

watch(
  () => [route.query.task, tasks.value.length],
  ([taskId]) => openTaskFromDesktop(taskId),
  { immediate: true },
)

function openWeeklyPlanCreate(longPlanId = ''): void {
  editingWeeklyPlan.value = null
  presetLongPlanId.value = longPlanId
  showWeeklyPlanModal.value = true
}

function openWeeklyPlanEdit(plan: WeeklyPlan): void {
  editingWeeklyPlan.value = plan
  presetLongPlanId.value = ''
  showWeeklyPlanModal.value = true
}

function openLongPlanCreate(): void {
  editingLongPlan.value = null
  showLongPlanModal.value = true
}

function openLongPlanEdit(plan: LongPlan): void {
  editingLongPlan.value = plan
  showLongPlanModal.value = true
}

const allTags = computed(() => {
  const s = new Set<string>()
  for (const t of tasks.value) {
    if (view.value === 'done' ? !t.done : t.done) continue
    for (const g of t.tags ?? []) s.add(g)
  }
  return [...s].sort()
})

const hasFilters = computed(() => Boolean(activeTag.value || searchQ.value.trim()))

const quickPreview = computed(() => {
  const raw = quickInput.value.trim()
  if (!raw) return null
  const parsed = parseQuickInput(raw)
  if (!parsed.title) return null
  const defaultDate = view.value === 'week' ? selectedWeekDate.value : view.value === 'inbox' ? '' : selected.value
  return {
    parsed,
    date: parsed.date ?? defaultDate,
  }
})

function clearFilters(): void {
  activeTag.value = null
  searchQ.value = ''
}

function match(t: Task): boolean {
  if (activeTag.value && !(t.tags ?? []).includes(activeTag.value)) return false
  const q = searchQ.value.trim().toLowerCase()
  if (!q) return true
  return `${t.title} ${t.notes ?? ''} ${(t.tags ?? []).join(' ')}`.toLowerCase().includes(q)
}

const sortFn = (a: Task, b: Task): number => {
  if (a.priority !== b.priority) return b.priority - a.priority
  const at = a.time || '99:99'
  const bt = b.time || '99:99'
  if (at !== bt) return at < bt ? -1 : 1
  return a.createdAt - b.createdAt
}

const openTasks = computed(() => tasks.value.filter((t) => !t.done && match(t)))
const inboxList = computed(() => openTasks.value.filter((task) => !task.date).sort(sortFn))
const doneList = computed(() =>
  tasks.value
    .filter((t) => t.done && match(t))
    .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
    .slice(0, 100),
)

const overdueList = computed(() =>
  openTasks.value
    .filter((t) => t.date && t.date < today)
    .sort((a, b) => (a.date < b.date ? -1 : 1)),
)
const pendingTaskCount = computed(() => overdueList.value.length + inboxList.value.length)

const selectedTasks = computed(() => tasks.value.filter((t) => t.date === selected.value && match(t)))
const selectedTotal = computed(() => selectedTasks.value.length)
const selectedDone = computed(() => selectedTasks.value.filter((t) => t.done).length)
const todayList = computed(() => selectedTasks.value.filter((t) => !t.done).sort(sortFn))
const todayRemainingTasks = computed(() => todayList.value.filter((task) => task.focusDate !== selected.value))

const progressPercent = computed(() =>
  selectedTotal.value === 0 ? 0 : Math.round((selectedDone.value / selectedTotal.value) * 100),
)

interface Group {
  key: string
  label: string
  items: Task[]
}

const allGroups = computed<Group[]>(() => {
  const out: Group[] = []
  const dated = openTasks.value.filter((t) => t.date && t.date >= today)
  const dates = [...new Set(dated.map((t) => t.date))].sort()
  for (const d of dates) {
    out.push({
      key: d,
      label: d === today ? '今天' : displayDate(d),
      items: dated.filter((t) => t.date === d).sort(sortFn),
    })
  }
  return out
})

const weekEnd = computed(() => shiftYMD(weekStart.value, 6))
const weekRangeLabel = computed(() => `${weekStart.value.slice(5).replace('-', '/')} – ${weekEnd.value.slice(5).replace('-', '/')}`)
const weekPlansForView = computed(() => weeklyPlans.value
  .filter((plan) => plan.weekStart === weekStart.value)
  .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt))
const activeLongPlans = computed(() => longPlans.value.filter((plan) => plan.status === 'active'))

const weekDays = computed(() => weekDates(weekStart.value).map((date) => {
  const dayTasks = tasks.value.filter((task) => task.date === date)
  const open = dayTasks.filter((task) => !task.done).sort(sortFn)
  const done = dayTasks.filter((task) => task.done)
  const rest = planner.value.restDates.includes(date)
  return {
    date,
    label: weekdayLabel(date),
    open,
    done,
    rest,
    state: rest ? '留白' : open.length === 0 ? '尚未安排' : '已有安排',
  }
}))

const weekSelectedTasks = computed(() => tasks.value
  .filter((task) => !task.done && task.date === selectedWeekDate.value && match(task))
  .sort(sortFn))

const weekOpenCount = computed(() => weekDays.value.reduce((total, day) => total + day.open.length, 0))
const weekDoneCount = computed(() => weekDays.value.reduce((total, day) => total + day.done.length, 0))

function relatedPlanTasks(plan: WeeklyPlan): Task[] {
  return tasks.value.filter((task) => task.weeklyPlanId === plan.id)
}

function planProgress(plan: WeeklyPlan): { done: number; total: number; scheduled: number } {
  const related = relatedPlanTasks(plan)
  return {
    done: related.filter((task) => task.done).length,
    total: Math.max(plan.sessions, related.length),
    scheduled: related.length,
  }
}

function longPlanProgress(plan: LongPlan): { done: number; total: number; weeklyCount: number } {
  const related = tasks.value.filter((task) => task.longPlanId === plan.id)
  return {
    done: related.filter((task) => task.done).length,
    total: related.length,
    weeklyCount: weeklyPlans.value.filter((weeklyPlan) => weeklyPlan.longPlanId === plan.id).length,
  }
}

const gentleMessage = computed(() => {
  const energy = plannerEnergyForDate(selected.value)
  if (energy === 'gentle') return '今天可以按自己的速度来，先从最想开始的事做起。'
  if (energy === 'focused') return '状态不错时可以多推进一些，也随时可以停下来调整。'
  return '计划是参考，不是要求；留一点空白给意外和休息也很好。'
})

const selectedDayEnergy = computed(() => plannerEnergyForDate(selected.value))
const selectedDayEnergyLabel = computed(() =>
  ENERGY_OPTIONS.find((option) => option.value === selectedDayEnergy.value)?.label ?? '平稳',
)
const gentleResetTasks = computed(() => tasks.value
  .filter((task) => !task.done && task.date === selected.value)
  .sort(sortFn))

const deletingPlanTaskStats = computed(() => {
  const target = deletingPlan.value
  if (!target || target.kind !== '周计划') return { total: 0, done: 0 }
  const linked = relatedPlanTasks(target.plan as WeeklyPlan)
  return { total: linked.length, done: linked.filter((task) => task.done).length }
})

const focusedTasks = computed(() => tasks.value
  .filter((task) => !task.done && task.focusDate === selected.value)
  .sort(sortFn))

type TodayTimeGroup = {
  key: 'morning' | 'afternoon' | 'evening' | 'anytime'
  label: string
  items: Task[]
}

const todayTimeGroups = computed<TodayTimeGroup[]>(() => {
  const buckets: Record<TodayTimeGroup['key'], Task[]> = {
    morning: [],
    afternoon: [],
    evening: [],
    anytime: [],
  }
  for (const task of todayRemainingTasks.value) {
    const hour = Number(task.time.slice(0, 2))
    const key: TodayTimeGroup['key'] = !task.time || Number.isNaN(hour)
      ? 'anytime'
      : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
    buckets[key].push(task)
  }
  const groups: TodayTimeGroup[] = [
    { key: 'morning', label: '上午', items: buckets.morning },
    { key: 'afternoon', label: '下午', items: buckets.afternoon },
    { key: 'evening', label: '晚上', items: buckets.evening },
    { key: 'anytime', label: '任选时间', items: buckets.anytime },
  ]
  return groups.filter((group) => group.items.length > 0)
})

type FocusSuggestion = {
  task: Task
  reason: string
  tone: 'overdue' | 'inbox' | 'today' | 'upcoming'
  rank: number
}

const focusSuggestions = computed(() => {
  const upcomingEnd = shiftYMD(selected.value, 3)
  return tasks.value
    .filter((task) => !task.done && !task.focusDate)
    .map<FocusSuggestion | null>((task) => {
      if (!task.date) return { task, reason: '来自收集箱', tone: 'inbox', rank: 1 }
      if (task.date < selected.value) return { task, reason: '已逾期', tone: 'overdue', rank: 0 }
      if (task.date === selected.value) return { task, reason: '当天待办', tone: 'today', rank: 2 }
      if (task.priority === 3 && task.date <= upcomingEnd) return { task, reason: '临近高优', tone: 'upcoming', rank: 3 }
      return null
    })
    .filter((item): item is FocusSuggestion => item !== null)
    .sort((a, b) => a.rank - b.rank || sortFn(a.task, b.task))
    .slice(0, 3)
})

const visibleCount = computed(() => {
  if (view.value === 'today') return todayList.value.length
  if (view.value === 'week') return weekOpenCount.value
  if (view.value === 'inbox') return pendingTaskCount.value
  if (view.value === 'long') return longPlans.value.length
  if (view.value === 'done') return doneList.value.length
  return allGroups.value.reduce((count, group) => count + group.items.length, 0)
})

function displayDate(dateStr: string): string {
  if (dateStr === today) return '今天'
  if (dateStr === shiftYMD(today, -1)) return '昨天'
  if (dateStr === shiftYMD(today, 1)) return '明天'
  return `${dateStr.slice(5)} ${weekdayLabel(dateStr)}`
}

function quickAdd(): void {
  const preview = quickPreview.value
  if (!preview) {
    toast('请填写任务内容', 'error')
    return
  }
  const { parsed, date } = preview
  const defaultDate = view.value === 'week' ? selectedWeekDate.value : view.value === 'inbox' ? '' : selected.value
  const task = addTask({
    title: parsed.title,
    notes: '',
    date,
    time: parsed.time ?? '',
    priority: 2,
    repeat: 'none',
    tags: parsed.tags,
  })
  quickInput.value = ''
  const extras = [
    parsed.date && parsed.date !== defaultDate ? displayDate(parsed.date) : '',
    parsed.time ?? '',
    parsed.tags.length > 0 ? `${parsed.tags.length} 个标签` : '',
  ].filter(Boolean)
  toast(extras.length > 0 ? `已添加 · ${extras.join(' · ')}` : '已添加')
  if (quickUndoTimer) clearTimeout(quickUndoTimer)
  quickUndo.value = { id: task.id, title: task.title }
  quickUndoTimer = setTimeout(() => {
    quickUndo.value = null
    quickUndoTimer = null
  }, 8000)
}

function undoQuickAdd(): void {
  const item = quickUndo.value
  if (!item) return
  removeTask(item.id)
  quickUndo.value = null
  if (quickUndoTimer) clearTimeout(quickUndoTimer)
  quickUndoTimer = null
  toast('已撤销刚才添加的任务')
}

function handleToggle(task: Task): void {
  if (!task.done) {
    completing.value = task
    return
  }
  toggleTaskDone(task.id)
}

function toggleFocus(task: Task): void {
  if (task.focusDate === selected.value) {
    setTaskFocus(task.id)
    toast('已移出日重点')
    return
  }
  if (task.focusDate) {
    toast(`这项任务已在 ${displayDate(task.focusDate)} 设为重点，请切换日期后调整`, 'error')
    return
  }
  const wasScheduledForAnotherDay = task.date !== selected.value
  if (wasScheduledForAnotherDay) updateTask(task.id, { date: selected.value })
  setTaskFocus(task.id, selected.value)
  toast(wasScheduledForAnotherDay ? `已安排到${displayDate(selected.value)}并加入重点` : '已加入本日重点')
}

const priorityLabel: Record<Task['priority'], string> = {
  1: '低优先级',
  2: '中优先级',
  3: '高优先级',
}

const priorityTone: Record<Task['priority'], string> = {
  1: 'is-low',
  2: 'is-medium',
  3: 'is-high',
}

function confirmCompletion(payload: { note: string; nextTitle: string }): void {
  const task = completing.value
  if (!task || task.done) {
    completing.value = null
    return
  }
  if (payload.note) {
    updateTask(task.id, { notes: task.notes ? `${task.notes}\n\n完成记录：${payload.note}` : `完成记录：${payload.note}` })
  }
  toggleTaskDone(task.id)
  if (payload.nextTitle) {
    addTask({
      title: payload.nextTitle,
      notes: '',
      date: '',
      time: '',
      priority: task.priority,
      repeat: 'none',
      tags: task.tags,
    })
  }
  completing.value = null
  if (task.repeat !== 'none') {
    toast(`已完成，下一次已排到 ${nextOccurrence(task.date, task.repeat)}`)
  } else if (payload.nextTitle) {
    toast('已完成，下一步已放入待安排')
  } else if (payload.note) {
    toast('已完成，进展已记录')
  }
}

async function dispatchToAI(task: Task): Promise<void> {
  try {
    await dispatchToAgent(task.title, task.notes)
    toast(`已派发给 AI：${task.title.slice(0, 20)}`)
  } catch (e) {
    toast(e instanceof Error ? e.message : '派发失败（请先在 AI 工作台连接 opencode）', 'error')
  }
}

function handleDelete(task: Task): void {
  deleteMode.value = 'delete'
  deleting.value = task
}

function handleCancel(task: Task): void {
  deleteMode.value = 'cancel'
  deleting.value = task
}

function postponeOverdueTask(task: Task): void {
  updateTask(task.id, { date: shiftYMD(today, 1), focusDate: undefined })
  toast('已推迟到明天')
}

function scheduleTaskToday(task: Task): void {
  updateTask(task.id, { date: today, focusDate: undefined })
  toast('已安排到今天')
}

function confirmDelete(): void {
  const task = deleting.value
  if (!task) return
  removeTask(task.id)
  deleting.value = null
  toast(deleteMode.value === 'cancel' ? '任务已取消' : '任务已删除')
  deleteMode.value = 'delete'
}

function previewWeekSchedule(plan: WeeklyPlan): void {
  const draft = createWeekScheduleDraft(plan.id)
  if (!draft) return
  schedulePlan.value = plan
  scheduleDraft.value = draft
}

function applyWeekSchedule(): void {
  const plan = schedulePlan.value
  const draft = scheduleDraft.value
  if (!plan || !draft) return
  const taskIds = applyWeekScheduleDraft(draft)
  lastSchedule.value = taskIds.length > 0 ? { planId: plan.id, taskIds } : null
  schedulePlan.value = null
  scheduleDraft.value = null
  toast(taskIds.length > 0 ? `已安排 ${taskIds.length} 个行动块` : '这份安排没有需要新增的行动块')
}

function undoLastSchedule(): void {
  if (!lastSchedule.value) return
  undoWeekSchedule(lastSchedule.value.planId, lastSchedule.value.taskIds)
  lastSchedule.value = null
  toast('已撤回刚才的自动安排')
}

function addLongPlanNextStep(plan: LongPlan): void {
  const title = plan.nextStep.trim()
  if (!title) {
    openLongPlanEdit(plan)
    toast('先写下一个足够小的下一步')
    return
  }
  const exists = tasks.value.some((task) => !task.done && task.longPlanId === plan.id && task.title === title)
  if (exists) {
    toast('这一步已经在待安排里了')
    return
  }
  addTask({
    title,
    notes: '',
    date: '',
    time: '',
    priority: 2,
    repeat: 'none',
    tags: [],
    longPlanId: plan.id,
    scheduledBy: 'manual',
  })
  toast('已放进待安排，准备好时再带入本周')
}

function toggleLongPlanPause(plan: LongPlan): void {
  const wasPaused = plan.status === 'paused'
  setLongPlanStatus(plan.id, wasPaused ? 'active' : 'paused')
  toast(wasPaused ? '已继续这个方向' : '已暂停，不会从默认建议中出现')
}

function completeLongPlan(plan: LongPlan): void {
  setLongPlanStatus(plan.id, 'completed')
  toast('已标记完成，辛苦了')
}

function requestPlanDelete(kind: '周计划' | '长期方向', plan: WeeklyPlan | LongPlan): void {
  deletingPlan.value = { kind, plan }
}

function confirmPlanDelete(): void {
  const target = deletingPlan.value
  if (!target) return
  if (target.kind === '周计划') {
    const removal = removeWeeklyPlan(target.plan.id)
    if (removal) {
      lastRemovedWeeklyPlan.value = removal
      if (weeklyDeleteUndoTimer) clearTimeout(weeklyDeleteUndoTimer)
      weeklyDeleteUndoTimer = setTimeout(() => {
        lastRemovedWeeklyPlan.value = null
        weeklyDeleteUndoTimer = null
      }, 10000)
      toast(`已撤销本周安排，并移除 ${removal.tasks.length} 项每日行动`)
    }
  } else {
    removeLongPlan(target.plan.id)
    toast('长期方向已删除，已有任务仍会保留')
  }
  deletingPlan.value = null
}

function restoreRemovedWeeklyPlan(): void {
  const removal = lastRemovedWeeklyPlan.value
  if (!removal) return
  restoreWeeklyPlan(removal)
  lastRemovedWeeklyPlan.value = null
  if (weeklyDeleteUndoTimer) clearTimeout(weeklyDeleteUndoTimer)
  weeklyDeleteUndoTimer = null
  toast('已恢复周计划和关联的每日行动')
}

function chooseDayEnergy(energy: PlannerEnergy): void {
  setPlannerDayEnergy(selected.value, energy)
  const label = ENERGY_OPTIONS.find((option) => option.value === energy)?.label ?? '平稳'
  toast(`已把这一天设为「${label}」`)
}

function applyGentleReset(payload: { ids: string[]; destination: 'tomorrow' | 'inbox' }): void {
  if (payload.ids.length === 0) return
  const date = payload.destination === 'tomorrow' ? shiftYMD(selected.value, 1) : ''
  for (const id of payload.ids) {
    updateTask(id, { date, time: '', focusDate: undefined })
  }
  showGentleReset.value = false
  toast(payload.destination === 'tomorrow'
    ? `已把 ${payload.ids.length} 项留给明天`
    : `已把 ${payload.ids.length} 项放回待安排`)
}

function applyOverdueQueue(payload: { ids: string[]; destination: 'today' | 'tomorrow' | 'inbox' | 'cancel' }): void {
  if (payload.ids.length === 0) return
  if (payload.destination === 'cancel') {
    for (const id of payload.ids) removeTask(id)
    toast(`已取消 ${payload.ids.length} 项任务`)
  } else {
    const date = payload.destination === 'today' ? today : payload.destination === 'tomorrow' ? shiftYMD(today, 1) : ''
    for (const id of payload.ids) {
      updateTask(id, { date, time: date ? tasks.value.find((task) => task.id === id)?.time ?? '' : '', focusDate: undefined })
    }
    const label = payload.destination === 'today' ? '今天' : payload.destination === 'tomorrow' ? '明天' : '待安排'
    toast(`已安放 ${payload.ids.length} 项到${label}`)
  }
  showOverdueQueue.value = false
}

function openGentleResetFromPause(): void {
  showGentlePause.value = false
  showGentleReset.value = true
}

onUnmounted(() => {
  if (weeklyDeleteUndoTimer) clearTimeout(weeklyDeleteUndoTimer)
  if (quickUndoTimer) clearTimeout(quickUndoTimer)
})
</script>

<template>
  <div>
    <PageHeader title="计划工作台" eyebrow="日常">
      <template #description>
        <template v-if="view === 'today'">
          {{ displayDate(selected) }}
          <span v-if="selectedTotal > 0">· 完成 {{ selectedDone }}/{{ selectedTotal }}</span>
        </template>
        <span v-else-if="view === 'week'">{{ weekRangeLabel }} · 已完成 {{ weekDoneCount }} 件</span>
        <span v-else-if="view === 'inbox'">{{ pendingTaskCount }} 项待安排 · {{ overdueList.length }} 项需要重新决定日期</span>
        <span v-else-if="view === 'long'">{{ activeLongPlans.length }} 个方向正在慢慢靠近</span>
        <span v-else-if="view === 'all'">所有已安排日期的待办</span>
        <span v-else>最近完成的任务</span>
        <button v-if="overdueList.length > 0 && view !== 'done' && view !== 'long'" type="button" class="task-overdue-link" @click="showOverdueQueue = true">
          {{ overdueList.length }} 项待重新安排 · 整理
        </button>
      </template>
      <template #actions>
        <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <div v-if="view === 'today'" class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <button class="ui-icon-button" aria-label="前一天" @click="shiftDate(-1)">
              <ChevronLeft class="h-4 w-4" />
            </button>
            <AppDatePicker v-model="selected" aria-label="选择计划日期" />
            <button class="ui-icon-button" aria-label="后一天" @click="shiftDate(1)">
              <ChevronRight class="h-4 w-4" />
            </button>
            <button v-if="selected !== today" class="ui-secondary-button text-xs" @click="selected = today">
              回到今天
            </button>
          </div>
          <div v-else-if="view === 'week'" class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <button class="ui-icon-button" aria-label="上一周" @click="shiftWeek(-1)">
              <ChevronLeft class="h-4 w-4" />
            </button>
            <span class="rounded-lg border border-line bg-surface px-3 py-2.5 text-xs font-medium tabular-nums text-t2">{{ weekRangeLabel }}</span>
            <button class="ui-icon-button" aria-label="下一周" @click="shiftWeek(1)">
              <ChevronRight class="h-4 w-4" />
            </button>
            <button v-if="weekStart !== weekStartYMD(today)" class="ui-secondary-button text-xs" @click="returnToCurrentWeek">
              回到本周
            </button>
          </div>
          <button v-if="view === 'week'" class="ui-primary-button gap-2" @click="openWeeklyPlanCreate()">
            <Plus class="h-4 w-4" />
            新建周计划
          </button>
          <button v-else-if="view === 'long'" class="ui-primary-button gap-2" @click="openLongPlanCreate">
            <Plus class="h-4 w-4" />
            新建长期方向
          </button>
          <button v-else class="ui-primary-button gap-2" @click="openCreate">
            <Plus class="h-4 w-4" />
            新建任务
          </button>
        </div>
      </template>
    </PageHeader>

    <div class="control-bar mt-4">
      <div role="tablist" aria-label="任务视图" class="filter-rail">
        <button
          v-for="v in VIEWS"
          :key="v.key"
          role="tab"
          :aria-selected="view === v.key"
          class="filter-chip"
          :class="{ 'is-active': view === v.key }"
          @click="view = v.key"
        >
          <component :is="v.icon" class="h-3.5 w-3.5" />
          {{ v.label }}
        </button>
      </div>
      <span class="ml-auto shrink-0 text-xs tabular-nums text-t4">显示 {{ visibleCount }} 项</span>
    </div>

    <div v-if="view === 'today' && selectedTotal > 0" class="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
      <div
        class="h-full rounded-full bg-primary transition-all duration-300"
        :style="{ width: `${progressPercent}%` }"
      ></div>
    </div>

    <section v-if="view === 'today'" class="task-focus-board mt-4" aria-labelledby="focus-heading">
      <div class="task-focus-header">
        <div>
          <p class="task-focus-eyebrow">{{ selected === today ? '今日工作台' : '当日工作台' }}</p>
          <h2 id="focus-heading" class="task-focus-title">
            {{ focusedTasks.length ? `本日重点 · ${focusedTasks.length} 项` : '先选出今天最重要的事' }}
          </h2>
        </div>
        <span class="task-focus-count">{{ focusedTasks.length }} 项</span>
      </div>

      <div v-if="focusedTasks.length" class="task-focus-grid mt-4">
        <article v-for="task in focusedTasks" :key="task.id" class="task-focus-card">
          <button
            type="button"
            class="task-focus-check"
            :aria-label="`完成任务：${task.title}`"
            @click="handleToggle(task)"
          >
            <CheckCheck class="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" class="task-focus-content" @click="openEdit(task)">
            <span class="task-priority" :class="priorityTone[task.priority]">
              <span class="task-priority-dot" aria-hidden="true"></span>
              {{ priorityLabel[task.priority] }}
            </span>
            <p class="task-focus-task-title">{{ task.title }}</p>
            <p v-if="task.time" class="task-focus-task-meta">{{ task.time }}</p>
            <p v-if="task.notes" class="task-focus-task-note">{{ task.notes }}</p>
          </button>
          <button
            type="button"
            class="task-focus-remove"
            :aria-label="`移出本日重点：${task.title}`"
            title="移出本日重点"
            @click="toggleFocus(task)"
          >
            <Star class="h-4 w-4" fill="currentColor" aria-hidden="true" />
          </button>
        </article>
      </div>
      <div v-else class="task-focus-empty mt-4">
        <Star class="h-5 w-5" aria-hidden="true" />
        <div>
          <p>把最重要的事放在这里</p>
          <span>想放几件都可以；完成后会自动移出。</span>
        </div>
      </div>

      <div v-if="focusSuggestions.length" class="task-focus-suggestions">
        <div class="task-focus-suggestion-heading">
          <span class="task-focus-suggestion-heading-main">
            <Lightbulb class="h-4 w-4" aria-hidden="true" />
            值得优先处理
          </span>
        </div>
        <div class="task-focus-suggestion-list">
          <button
            v-for="suggestion in focusSuggestions"
            :key="suggestion.task.id"
            type="button"
            class="task-focus-suggestion"
            @click="toggleFocus(suggestion.task)"
          >
            <span class="task-focus-suggestion-copy">
              <span class="task-suggestion-reason" :class="`is-${suggestion.tone}`">{{ suggestion.reason }}</span>
              <span class="task-focus-suggestion-title">{{ suggestion.task.title }}</span>
            </span>
            <span class="task-focus-suggestion-action">
              设为重点
              <Plus class="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </button>
        </div>
      </div>

      <details class="plan-day-support">
        <summary>
          <span class="plan-day-support-copy">
            <span class="gentle-plan-icon"><Coffee class="h-4 w-4" /></span>
            <span>
              <span class="plan-day-support-title">今天的节奏 · {{ selectedDayEnergyLabel }}</span>
              <span class="plan-day-support-meta">节奏仅作提醒，由你决定今天放多少事情。</span>
            </span>
          </span>
          <span class="plan-day-support-toggle">
            调整
            <ChevronDown class="h-4 w-4" aria-hidden="true" />
          </span>
        </summary>
        <div class="plan-day-support-body">
          <p class="text-xs leading-relaxed text-t3">{{ gentleMessage }}</p>
          <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap gap-1.5" role="group" aria-label="选择今天的节奏">
              <button
                v-for="option in ENERGY_OPTIONS"
                :key="option.value"
                type="button"
                class="gentle-energy-option"
                :class="{ 'is-active': selectedDayEnergy === option.value }"
                :aria-pressed="selectedDayEnergy === option.value"
                @click="chooseDayEnergy(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="ui-secondary-button gap-1.5 text-xs" @click="showGentlePause = true">
                <Coffee class="h-3.5 w-3.5" />
                缓一缓
              </button>
              <button type="button" class="ui-ghost-button text-xs" @click="showGentleReset = true">安放任务</button>
            </div>
          </div>
        </div>
      </details>
    </section>

    <label v-if="view !== 'long'" class="relative mt-4 block">
      <Plus class="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-t4" />
      <input
        v-model="quickInput"
        :placeholder="view === 'week' ? `添加到 ${displayDate(selectedWeekDate)}，支持语法：下午3点 写周报 #工作` : view === 'inbox' ? '先收下这件事，之后再决定日期' : '添加任务，支持语法：明天 下午3点 写周报 #工作'"
        aria-label="快速添加任务"
        class="control-input py-3 pl-10 pr-4"
        @keydown.enter.prevent
      />
    </label>

    <div v-if="quickPreview" class="quick-add-preview">
      <div class="min-w-0">
        <p class="quick-add-preview-label">将要添加</p>
        <p class="mt-0.5 truncate text-sm font-medium text-t2">{{ quickPreview.parsed.title }}</p>
        <div class="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-t4">
          <span>{{ quickPreview.date ? displayDate(quickPreview.date) : '待安排' }}</span>
          <span v-if="quickPreview.parsed.time">{{ quickPreview.parsed.time }}</span>
          <span v-if="quickPreview.parsed.tags.length">{{ quickPreview.parsed.tags.map((tag) => `#${tag}`).join(' ') }}</span>
        </div>
      </div>
      <button type="button" class="ui-primary-button shrink-0 text-xs" @click="quickAdd">确认添加</button>
    </div>

    <div v-if="quickUndo" class="quick-add-undo">
      <span class="truncate">已添加「{{ quickUndo.title }}」</span>
      <button type="button" @click="undoQuickAdd">撤销</button>
    </div>

    <div v-if="view !== 'long' && tasks.length > 0" class="control-bar mt-3">
      <label class="control-search w-full sm:w-48">
        <SearchIcon class="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-t4" />
        <input
          v-model="searchQ"
          placeholder="搜索任务"
          aria-label="搜索任务"
          class="control-input py-2 pl-9 pr-3 text-xs"
        />
      </label>
      <div v-if="allTags.length > 0" class="filter-rail min-w-0 flex-1">
        <button
          v-for="tag in allTags"
          :key="tag"
          class="filter-chip"
          :class="{ 'is-active': activeTag === tag }"
          @click="activeTag = activeTag === tag ? null : tag"
        >
          <TagIcon class="h-3 w-3" />
          {{ tag }}
        </button>
      </div>
      <button
        v-if="hasFilters"
        class="filter-reset"
        @click="clearFilters"
      >
        清除筛选
      </button>
    </div>

    <template v-if="view === 'today'">
      <div v-if="todayList.length === 0" class="empty-state mt-8">
        <ListTodo class="mx-auto h-10 w-10 text-t4" />
        <p class="mt-4 text-sm font-medium text-t2">{{ hasFilters ? '没有匹配的任务' : selectedTotal > 0 ? '这一天的任务已经完成' : '这一天还没有安排' }}</p>
        <p class="mt-1 text-xs text-t4">{{ hasFilters ? '清除筛选后查看全部任务' : selectedTotal > 0 ? '可以停下来休息一下，或为之后留下一件小事。' : '在上方输入框回车即可秒加，试试「明天 下午3点 开会」' }}</p>
        <button v-if="hasFilters" class="ui-secondary-button mt-4 text-xs" @click="clearFilters">清除筛选</button>
      </div>
      <div v-else-if="todayRemainingTasks.length" class="mt-6">
        <div class="plan-task-section-heading">
          <div>
            <p>{{ focusedTasks.length ? '其余安排' : '今天的安排' }}</p>
            <span>{{ focusedTasks.length ? '重点已单独呈现，剩下的按优先级排列。' : '按优先级和时间排列。' }}</span>
          </div>
          <span>{{ todayRemainingTasks.length }} 项</span>
        </div>
        <div class="mt-3 space-y-5">
          <section v-for="group in todayTimeGroups" :key="group.key" class="plan-time-group">
            <div class="plan-time-group-heading">
              <span>{{ group.label }}</span>
              <span>{{ group.items.length }} 项</span>
            </div>
            <div class="mt-1 space-y-2">
              <TaskRow
                v-for="t in group.items"
                :key="t.id"
                :task="t"
                @toggle="handleToggle(t)"
                @edit="openEdit(t)"
                @dispatch="dispatchToAI(t)"
                @toggle-focus="toggleFocus(t)"
                @remove="handleDelete(t)"
                @add-sub="addSubTask(t.id, $event)"
                @toggle-sub="toggleSubTask(t.id, $event)"
                @remove-sub="removeSubTask(t.id, $event)"
              />
            </div>
          </section>
        </div>
      </div>
      <div v-else class="plan-today-settled mt-6">
        <CheckCheck class="h-4 w-4" aria-hidden="true" />
        <div>
          <p>今天的重点已经清楚了</p>
          <span>先从上面的重点开始；完成后，其余安排会自然出现。</span>
        </div>
      </div>
    </template>

    <template v-else-if="view === 'week'">
      <section class="week-rhythm-card mt-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-xs font-medium text-primary">本周节奏</p>
            <h2 class="mt-1 text-base font-semibold text-t1">不用排满，给自己留一点空间</h2>
            <p class="mt-1 text-xs leading-relaxed text-t3">自动安排会参考每天的节奏和留白日，并尽量分散行动；不会设置每日数量上限。</p>
          </div>
          <span class="week-rhythm-count">{{ weekOpenCount }} 项待办 · {{ weekDoneCount }} 项完成</span>
        </div>
      </section>

      <div v-if="lastSchedule" class="week-schedule-undo mt-4">
        <p>刚刚自动安排的行动块还可以撤回。</p>
        <button type="button" @click="undoLastSchedule">撤回刚才安排</button>
      </div>

      <div v-if="lastRemovedWeeklyPlan" class="week-schedule-undo mt-4">
        <p>刚刚撤销的「{{ lastRemovedWeeklyPlan.plan.title }}」还可以恢复。</p>
        <button type="button" @click="restoreRemovedWeeklyPlan">恢复周计划</button>
      </div>

      <section class="mt-5" aria-label="本周每日计划">
        <div class="week-day-rail">
          <article
            v-for="day in weekDays"
            :key="day.date"
            class="week-day-card"
            :class="{ 'is-selected': selectedWeekDate === day.date, 'is-rest': day.rest }"
          >
            <button type="button" class="week-day-main" @click="selectWeekDay(day.date)">
              <span class="flex items-center justify-between gap-2">
                <span class="text-xs font-medium text-t3">{{ day.label }}</span>
                <span class="text-xs tabular-nums text-t4">{{ day.date.slice(8) }}</span>
              </span>
              <span class="mt-3 block text-sm font-semibold text-t1">{{ day.state }}</span>
              <p v-if="day.open[0]" class="mt-2 truncate text-xs text-t2">{{ day.open[0].title }}</p>
              <p v-else class="mt-2 text-xs text-t4">{{ day.rest ? '不安排也很好' : '还留着空白' }}</p>
              <span class="mt-3 block text-xs tabular-nums text-t4">{{ day.open.length }} 项待办</span>
            </button>
            <button
              type="button"
              class="week-day-rest-toggle"
              :aria-label="`${day.rest ? '取消' : '设置'} ${displayDate(day.date)} 留白日`"
              @click="toggleRestDate(day.date)"
            >
              {{ day.rest ? '取消留白' : '留白' }}
            </button>
          </article>
        </div>
      </section>

      <section class="mt-7" aria-labelledby="week-plan-heading">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p class="text-xs font-medium text-primary">本周方向</p>
            <h2 id="week-plan-heading" class="mt-1 text-base font-semibold text-t1">这周想照顾的事</h2>
          </div>
          <button class="ui-secondary-button gap-1.5 text-xs" @click="openWeeklyPlanCreate()">
            <Plus class="h-3.5 w-3.5" />
            新建周计划
          </button>
        </div>

        <div v-if="weekPlansForView.length === 0" class="week-plan-empty mt-4">
          <Target class="h-5 w-5" />
          <div>
            <p>先留下一件这周想照顾的事</p>
            <span>它可以是工作推进，也可以是休息、关系或一点自己的时间。</span>
          </div>
          <button class="ui-primary-button shrink-0 text-xs" @click="openWeeklyPlanCreate()">加入本周</button>
        </div>
        <div v-else class="week-plan-list mt-4">
          <article v-for="plan in weekPlansForView" :key="plan.id" class="week-plan-card">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <span class="task-priority" :class="priorityTone[plan.priority]">
                  <span class="task-priority-dot" aria-hidden="true"></span>
                  {{ priorityLabel[plan.priority] }}
                </span>
                <h3 class="mt-2 truncate text-sm font-semibold text-t1">{{ plan.title }}</h3>
                <p v-if="plan.notes" class="mt-1 line-clamp-2 text-xs leading-relaxed text-t3">{{ plan.notes }}</p>
              </div>
              <CardActionMenu label="更多周计划操作">
                <button class="menu-item" @click="openWeeklyPlanEdit(plan)">
                  <Pencil class="h-3.5 w-3.5" />
                  编辑
                </button>
                <button class="menu-item is-danger" @click="requestPlanDelete('周计划', plan)">
                  <Trash2 class="h-3.5 w-3.5" />
                  删除
                </button>
              </CardActionMenu>
            </div>
            <div class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <p class="text-xs text-t3">
                {{ planProgress(plan).done }}/{{ planProgress(plan).total }} 次行动
                <span v-if="plan.longPlanId" class="text-t4">· 已关联长期方向</span>
              </p>
              <button class="ui-secondary-button gap-1.5 text-xs" @click="previewWeekSchedule(plan)">
                <Sparkles class="h-3.5 w-3.5" />
                {{ planProgress(plan).scheduled >= plan.sessions ? '查看安排' : '试着分配' }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <section class="week-day-detail mt-7" aria-labelledby="week-day-detail-heading">
        <div class="flex items-end justify-between gap-3">
          <div>
            <p class="text-xs font-medium text-primary">每日行动</p>
            <h2 id="week-day-detail-heading" class="mt-1 text-base font-semibold text-t1">{{ displayDate(selectedWeekDate) }}</h2>
          </div>
          <span class="text-xs tabular-nums text-t4">{{ weekSelectedTasks.length }} 项待办</span>
        </div>
        <div v-if="weekSelectedTasks.length === 0" class="week-day-detail-empty mt-4">
          <p>这一天还没有行动安排。</p>
          <button class="ui-secondary-button mt-3 text-xs" @click="openCreate">添加一件小事</button>
        </div>
        <div v-else class="mt-4 space-y-2">
          <TaskRow
            v-for="task in weekSelectedTasks"
            :key="task.id"
            :task="task"
            @toggle="handleToggle(task)"
            @edit="openEdit(task)"
            @dispatch="dispatchToAI(task)"
            @toggle-focus="toggleFocus(task)"
            @remove="handleDelete(task)"
            @add-sub="addSubTask(task.id, $event)"
            @toggle-sub="toggleSubTask(task.id, $event)"
            @remove-sub="removeSubTask(task.id, $event)"
          />
        </div>
      </section>
    </template>

    <template v-else-if="view === 'long'">
      <section class="long-plan-intro mt-6">
        <div class="flex min-w-0 items-start gap-3">
          <span class="long-plan-intro-icon"><Compass class="h-4 w-4" /></span>
          <div>
            <p class="text-xs font-medium text-primary">长期方向</p>
            <h2 class="mt-1 text-base font-semibold text-t1">方向不等于催促</h2>
            <p class="mt-1 text-xs leading-relaxed text-t3">把想靠近的生活、工作或成长留在这里；准备好时，再把它带进本周。</p>
          </div>
        </div>
      </section>

      <div v-if="longPlans.length === 0" class="empty-state mt-6">
        <Compass class="mx-auto h-10 w-10 text-t4" />
        <p class="mt-4 text-sm font-medium text-t2">还没有长期方向</p>
        <p class="mt-1 text-xs text-t4">先记下一个想慢慢靠近的地方，不需要现在就有完整答案。</p>
        <button class="ui-primary-button mt-4" @click="openLongPlanCreate">新建长期方向</button>
      </div>
      <div v-else class="long-plan-grid mt-6">
        <article v-for="plan in longPlans" :key="plan.id" class="long-plan-card" :class="{ 'is-paused': plan.status === 'paused' || plan.status === 'wish' }">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="long-plan-status" :class="`is-${plan.status}`">
                  {{ { active: '正在靠近', paused: '先暂停', completed: '已完成', wish: '愿望' }[plan.status] }}
                </span>
                <span v-if="plan.area" class="text-xs text-t4">{{ plan.area }}</span>
              </div>
              <h3 class="mt-3 text-base font-semibold text-t1">{{ plan.title }}</h3>
              <p v-if="plan.description" class="mt-2 line-clamp-3 text-xs leading-relaxed text-t3">{{ plan.description }}</p>
            </div>
            <CardActionMenu label="更多长期方向操作">
              <button class="menu-item" @click="openLongPlanEdit(plan)">
                <Pencil class="h-3.5 w-3.5" />
                编辑
              </button>
              <button v-if="plan.status !== 'completed'" class="menu-item" @click="toggleLongPlanPause(plan)">
                <Play v-if="plan.status === 'paused'" class="h-3.5 w-3.5" />
                <Pause v-else class="h-3.5 w-3.5" />
                {{ plan.status === 'paused' ? '继续' : '暂停' }}
              </button>
              <button v-if="plan.status !== 'completed'" class="menu-item is-primary" @click="completeLongPlan(plan)">
                <CheckCheck class="h-3.5 w-3.5" />
                标记完成
              </button>
              <button class="menu-item is-danger" @click="requestPlanDelete('长期方向', plan)">
                <Trash2 class="h-3.5 w-3.5" />
                删除
              </button>
            </CardActionMenu>
          </div>
          <div class="long-plan-meta mt-5">
            <span>{{ { month: '这个月', quarter: '这个季度', year: '这一年', custom: '慢慢来' }[plan.horizon] }}</span>
            <span v-if="plan.targetDate">目标日期 {{ plan.targetDate }}</span>
            <span>{{ longPlanProgress(plan).weeklyCount }} 个周计划 · {{ longPlanProgress(plan).done }}/{{ longPlanProgress(plan).total }} 个行动完成</span>
          </div>
          <div v-if="plan.nextStep" class="long-plan-next-step mt-4">
            <p class="text-xs text-t4">下一小步</p>
            <p class="mt-1 text-sm text-t2">{{ plan.nextStep }}</p>
          </div>
          <div class="mt-5 flex flex-wrap gap-2 border-t border-line pt-3">
            <button class="ui-secondary-button gap-1.5 text-xs" @click="openWeeklyPlanCreate(plan.id)">
              <CalendarDays class="h-3.5 w-3.5" />
              带入本周
            </button>
            <button v-if="plan.status !== 'completed'" class="ui-secondary-button gap-1.5 text-xs" @click="addLongPlanNextStep(plan)">
              <ListPlus class="h-3.5 w-3.5" />
              放入待安排
            </button>
          </div>
        </article>
      </div>
    </template>

    <template v-else-if="view === 'inbox'">
      <div v-if="pendingTaskCount === 0" class="empty-state mt-8">
        <Inbox class="mx-auto h-10 w-10 text-t4" />
        <p class="mt-4 text-sm font-medium text-t2">{{ hasFilters ? '没有匹配的待安排任务' : '待安排已经清空了' }}</p>
        <p class="mt-1 text-xs text-t4">{{ hasFilters ? '清除筛选后查看全部任务' : '先收下想到的事，准备好时再安排日期。' }}</p>
        <button v-if="hasFilters" class="ui-secondary-button mt-4 text-xs" @click="clearFilters">清除筛选</button>
      </div>
      <div v-else class="mt-6 space-y-7">
        <section v-if="overdueList.length" class="plan-pending-section">
          <div class="plan-task-section-heading">
            <div>
              <p>待重新安排</p>
              <span>日期已过去，选择今天、明天或先放回待安排。</span>
            </div>
            <span>{{ overdueList.length }} 项</span>
          </div>
          <div class="mt-2 space-y-2">
            <TaskRow
              v-for="task in overdueList"
              :key="task.id"
              :task="task"
              :show-date="displayDate(task.date)"
              show-overdue-quick-actions
              @toggle="handleToggle(task)"
              @edit="openEdit(task)"
              @dispatch="dispatchToAI(task)"
              @cancel="handleCancel(task)"
              @schedule-today="scheduleTaskToday(task)"
              @postpone="postponeOverdueTask(task)"
              @toggle-focus="toggleFocus(task)"
              @remove="handleDelete(task)"
              @add-sub="addSubTask(task.id, $event)"
              @toggle-sub="toggleSubTask(task.id, $event)"
              @remove-sub="removeSubTask(task.id, $event)"
            />
          </div>
        </section>
        <section v-if="inboxList.length" class="plan-pending-section">
          <div class="plan-task-section-heading">
          <div>
            <p>还未安排</p>
            <span>先收下，不必立刻决定什么时候做。</span>
          </div>
          <span>{{ inboxList.length }} 项</span>
        </div>
        <div class="mt-2 space-y-2">
          <TaskRow
            v-for="task in inboxList"
            :key="task.id"
            :task="task"
            @toggle="handleToggle(task)"
            @edit="openEdit(task)"
            @dispatch="dispatchToAI(task)"
            @toggle-focus="toggleFocus(task)"
            @remove="handleDelete(task)"
            @add-sub="addSubTask(task.id, $event)"
            @toggle-sub="toggleSubTask(task.id, $event)"
            @remove-sub="removeSubTask(task.id, $event)"
          />
        </div>
        </section>
      </div>
    </template>

    <template v-else-if="view === 'all'">
      <div v-if="allGroups.length === 0" class="empty-state mt-8">
        <ListTodo class="mx-auto h-10 w-10 text-t4" />
        <p class="mt-4 text-sm font-medium text-t2">{{ hasFilters ? '没有匹配的待办任务' : '没有待办任务' }}</p>
        <button v-if="hasFilters" class="ui-secondary-button mt-4 text-xs" @click="clearFilters">清除筛选</button>
      </div>
      <template v-else>
        <section v-for="g in allGroups" :key="g.key" class="mt-7">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-t4">
            {{ g.label }} · {{ g.items.length }}
          </h2>
          <div class="mt-3 space-y-2">
            <TaskRow
              v-for="t in g.items"
              :key="t.id"
              :task="t"
              :show-date="view === 'all' ? displayDate(t.date || '') : undefined"
              @toggle="handleToggle(t)"
              @edit="openEdit(t)"
              @dispatch="dispatchToAI(t)"
              @toggle-focus="toggleFocus(t)"
              @remove="handleDelete(t)"
              @add-sub="addSubTask(t.id, $event)"
              @toggle-sub="toggleSubTask(t.id, $event)"
              @remove-sub="removeSubTask(t.id, $event)"
            />
          </div>
        </section>
      </template>
    </template>

    <template v-else>
      <div v-if="doneList.length === 0" class="empty-state mt-8">
        <CheckCheck class="mx-auto h-10 w-10 text-t4" />
        <p class="mt-4 text-sm font-medium text-t2">{{ hasFilters ? '没有匹配的已完成任务' : '还没有已完成的任务' }}</p>
        <button v-if="hasFilters" class="ui-secondary-button mt-4 text-xs" @click="clearFilters">清除筛选</button>
      </div>
      <div v-else class="mt-6 space-y-2">
        <TaskRow
          v-for="t in doneList"
          :key="t.id"
          :task="t"
          :show-date="t.doneAt ? new Date(t.doneAt).toLocaleDateString('zh-CN') : undefined"
          @toggle="handleToggle(t)"
          @edit="openEdit(t)"
          @dispatch="dispatchToAI(t)"
          @toggle-focus="toggleFocus(t)"
          @remove="handleDelete(t)"
          @add-sub="addSubTask(t.id, $event)"
          @toggle-sub="toggleSubTask(t.id, $event)"
          @remove-sub="removeSubTask(t.id, $event)"
        />
      </div>
    </template>

    <TaskModal :open="showModal" :entry="editing" :default-date="view === 'week' ? selectedWeekDate : view === 'inbox' ? '' : selected" @close="showModal = false" />
    <TaskCompletionModal
      :open="Boolean(completing)"
      :task="completing"
      @close="completing = null"
      @confirm="confirmCompletion"
    />
    <TaskDeleteModal
      :open="Boolean(deleting)"
      :task="deleting"
      :mode="deleteMode"
      @close="deleting = null"
      @confirm="confirmDelete"
    />
    <WeeklyPlanModal
      :open="showWeeklyPlanModal"
      :entry="editingWeeklyPlan"
      :week-start="weekStart"
      :preset-long-plan-id="presetLongPlanId"
      @close="showWeeklyPlanModal = false"
    />
    <WeekSchedulePreviewModal
      :open="Boolean(scheduleDraft)"
      :plan="schedulePlan"
      :draft="scheduleDraft"
      @close="schedulePlan = null; scheduleDraft = null"
      @apply="applyWeekSchedule"
    />
    <LongPlanModal :open="showLongPlanModal" :entry="editingLongPlan" @close="showLongPlanModal = false" />
    <PlanDeleteModal
      :open="Boolean(deletingPlan)"
      :kind="deletingPlan?.kind ?? ''"
      :title="deletingPlan?.plan.title ?? ''"
      :linked-task-count="deletingPlanTaskStats.total"
      :linked-done-count="deletingPlanTaskStats.done"
      @close="deletingPlan = null"
      @confirm="confirmPlanDelete"
    />
    <GentlePauseModal :open="showGentlePause" @close="showGentlePause = false" @settle="openGentleResetFromPause" />
    <GentleResetModal
      :open="showGentleReset"
      :date="selected"
      :tasks="gentleResetTasks"
      @close="showGentleReset = false"
      @apply="applyGentleReset"
    />
    <OverdueTaskQueueModal
      :open="showOverdueQueue"
      :tasks="overdueList"
      @close="showOverdueQueue = false"
      @apply="applyOverdueQueue"
    />
  </div>
</template>
