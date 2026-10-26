<script setup lang="ts">
import { computed, ref } from 'vue'
import { Flag, Footprints, Plus } from '@lucide/vue'
import { planner, updateLongPlan, dayCapacity, dayLoad, longPlans, weeklyPlans, createWeekScheduleDraft, applyWeekScheduleDraft, undoWeekSchedule } from '@/stores/planning'
import type { WeekScheduleDraft } from '@/stores/planning'
import { toast } from '@/lib/toast'
import { tasks } from '@/stores/tasks'
import { memos } from '@/stores/memos'
import { openHubItem } from '@/stores/hub'
import { availableWindows, goalTasks, taskPlans } from '@/lib/calendarConnections'
import { minuteLabel } from '@/lib/calendar'
import { shiftYMD, toYMD, weekStartYMD } from '@/lib/utils'
import AppSelect from './AppSelect.vue'
import LongPlanModal from './LongPlanModal.vue'
import WeeklyPlanModal from './WeeklyPlanModal.vue'
import WeekSchedulePreviewModal from './WeekSchedulePreviewModal.vue'
import type { LongPlan, Task, WeeklyPlan } from '@/types'
const props = defineProps<{ date: string; now: Date }>()
const emit = defineEmits<{ step: [draft: Partial<Task>, time: string]; edit: [task: Task]; locate: [date: string] }>()
const tab = ref<'goals' | 'trail'>('goals')
const goalFilter = ref('')
const goalOpen = ref(false)
const editingGoal = ref<LongPlan | null>(null)
const weekOpen = ref(false)
const editingWeek = ref<WeeklyPlan | null>(null)
const presetGoal = ref('')
const previewWeek = ref<WeeklyPlan | null>(null)
const previewDraft = ref<WeekScheduleDraft | null>(null)
const undo = ref<{ planId: string; snapshots: Map<string, string> } | null>(null)
function preview(week: WeeklyPlan): void { previewWeek.value = week; previewDraft.value = createWeekScheduleDraft(week.id) }
function apply(): void {
  if (!previewWeek.value || !previewDraft.value) return
  try {
    const ids = applyWeekScheduleDraft(previewDraft.value)
    undo.value = { planId: previewWeek.value.id, snapshots: new Map(tasks.value.filter(task => ids.includes(task.id)).map(task => [task.id, JSON.stringify(task)])) }
    previewWeek.value = null
    toast(`已安排 ${ids.length} 项任务`)
  } catch (error) { toast(error instanceof Error ? error.message : '排期已变化，请重新预览', 'error'); previewWeek.value = null }
}
function undoSchedule(): void {
  if (!undo.value) return
  const unchanged = tasks.value.filter(task => undo.value!.snapshots.get(task.id) === JSON.stringify(task)).map(task => task.id)
  undoWeekSchedule(undo.value.planId, unchanged)
  undo.value = null
  toast(`已撤销 ${unchanged.length} 项安排，修改过的任务会保留`)
}
const activeGoals = computed(() => longPlans.value.filter(goal => goal.status === 'active' && (!goal.deferredUntil || goal.deferredUntil <= toYMD(props.now))).sort((a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999') || b.updatedAt - a.updatedAt))
const deferredGoals = computed(() => longPlans.value.filter(goal => goal.status === 'active' && goal.deferredUntil && goal.deferredUntil > toYMD(props.now)))
function deferGoal(goal: LongPlan): void { updateLongPlan(goal.id, { deferredUntil: shiftYMD(weekStartYMD(toYMD(props.now)), 7) }); toast('已暂放到下周，现有任务保留；到期不会自动排期') }
const slot = computed(() => availableWindows(tasks.value, props.date, Math.max(0, dayCapacity(props.date) - dayLoad(props.date)), props.now, 15, planner.value.protectedTimes)[0])
const weekStart = computed(() => weekStartYMD(props.date))
const trail = computed(() => tasks.value.filter(task => task.done && task.doneAt && toYMD(new Date(task.doneAt)) >= weekStart.value && toYMD(new Date(task.doneAt)) <= shiftYMD(weekStart.value, 6) && (!goalFilter.value || taskPlans(task, weeklyPlans.value, longPlans.value).goal?.id === goalFilter.value)).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)))
const touchedGoals = computed(() => new Set(trail.value.map(task => taskPlans(task, weeklyPlans.value, longPlans.value).goal?.id).filter(Boolean)).size)
function linked(goal: LongPlan) { return goalTasks(goal.id, tasks.value, weeklyPlans.value, longPlans.value) }
function existingStep(goal: LongPlan) { return linked(goal).filter(task => task.title.trim() === goal.nextStep.trim()).sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt)[0] }
function openGoal(goal: LongPlan | null): void { editingGoal.value = goal; goalOpen.value = true }
function openWeek(goal: LongPlan): void { editingWeek.value = null; presetGoal.value = goal.id; weekOpen.value = true }
function progressMemos(task: Task) { return memos.value.filter(memo => task.links?.some(link => link.kind === 'memos' && link.id === memo.id)) }
</script>
<template>
  <div>
    <div class="mb-5 flex border-b border-line" role="group" aria-label="目标与回顾视图"><button class="min-h-11 flex-1 text-xs" :class="tab === 'goals' ? 'border-b-2 border-primary text-primary' : 'text-t3'" :aria-pressed="tab === 'goals'" @click="tab = 'goals'">长期目标</button><button class="min-h-11 flex-1 text-xs" :class="tab === 'trail' ? 'border-b-2 border-primary text-primary' : 'text-t3'" :aria-pressed="tab === 'trail'" @click="tab = 'trail'">本周回顾</button></div>
    <template v-if="tab === 'goals'">
      <p class="mb-4 text-xs leading-6 text-t3">将任务关联到长期目标，方便查看进展。目标日期只作提醒，不占用日历时间。</p>
      <article v-for="goal in activeGoals" :key="goal.id" class="mb-4 rounded-xl border border-line p-3">
        <button class="flex min-h-11 w-full items-center gap-2 text-left text-sm font-medium text-t1 hover:text-primary" @click="openGoal(goal)"><Flag class="h-4 w-4 shrink-0 text-primary" />{{ goal.title }}</button>
        <button v-if="goal.targetDate" class="min-h-11 text-xs text-primary hover:underline" @click="emit('locate', goal.targetDate)">目标日 · {{ goal.targetDate }}</button>
        <p class="text-xs text-t3">{{ linked(goal).filter(task => task.done).length }} 步已完成 · {{ linked(goal).filter(task => !task.done && task.date).length }} 步已安排</p>
        <div v-if="goal.nextStep" class="mt-3 rounded-lg bg-inset p-3"><p class="text-xs text-t3">下一步</p><p class="mt-1 break-words text-sm text-t1">{{ goal.nextStep }}</p><button v-if="existingStep(goal)" class="mt-2 min-h-11 text-xs text-primary hover:underline" @click="existingStep(goal)!.done ? openGoal(goal) : emit('edit', existingStep(goal)!)">{{ existingStep(goal)!.done ? '这一步已完成，更新下一步' : '查看已有任务' }}</button><button v-else :disabled="!slot" class="mt-2 min-h-11 text-xs text-primary hover:underline disabled:text-t4 disabled:no-underline" @click="slot && emit('step', { title: goal.nextStep, longPlanId: goal.id, estimatedMinutes: 15 }, minuteLabel(slot.start))">{{ slot ? `留 15 分钟 · ${minuteLabel(slot.start)}` : '换个有余量的日期再安排' }}</button></div>
        <div v-for="week in weeklyPlans.filter(item => item.longPlanId === goal.id && item.weekStart === weekStart)" :key="week.id" class="mt-3 border-t border-line pt-2"><button class="min-h-11 w-full truncate text-left text-xs text-t2 hover:text-primary" @click="editingWeek = week; weekOpen = true">本周计划 · {{ week.title }}</button><button class="min-h-11 text-xs text-primary hover:underline" @click="preview(week)">预览本周排期</button></div>
        <button class="mt-2 min-h-11 text-xs text-primary hover:underline" @click="openWeek(goal)">拆成本周计划</button><RouterLink :to="{ path: '/focus', query: { tab: 'story', goal: goal.id } }" class="ml-3 inline-flex min-h-11 items-center text-xs text-primary">查看项目进展</RouterLink><button class="ml-4 min-h-11 text-xs text-t3 hover:text-primary" @click="deferGoal(goal)">下周再看</button>
      </article>
      <div v-if="!activeGoals.length" class="py-6 text-center"><Flag class="mx-auto h-6 w-6 text-primary" /><p class="mt-3 text-sm text-t2">还没有进行中的长期目标</p><p class="mt-2 text-xs leading-5 text-t3">一本想读的书、一个想完成的作品，都可以从 15 分钟开始。</p></div>
      <details v-if="deferredGoals.length" class="my-4"><summary class="min-h-11 cursor-pointer text-xs text-t3">暂不展开 · {{ deferredGoals.length }} 个目标</summary><div v-for="goal in deferredGoals" :key="goal.id" class="border-t border-line py-3"><p class="text-sm text-t2">{{ goal.title }}</p><p class="mt-1 text-xs text-t3">{{ goal.deferredUntil }} 再看，不会自动排期</p><button class="min-h-11 text-xs text-primary" @click="updateLongPlan(goal.id, { deferredUntil: undefined })">现在重新展开</button></div></details>
      <button class="ui-secondary-button w-full gap-2" @click="openGoal(null)"><Plus class="h-4 w-4" />新建长期目标</button>
      <RouterLink to="/today?view=long" class="mt-3 flex min-h-11 items-center justify-center text-xs text-primary hover:underline">管理全部目标</RouterLink>
    </template>
    <template v-else>
      <div class="mb-4 rounded-xl bg-primary/10 p-4"><Footprints class="h-5 w-5 text-primary" /><p class="mt-3 text-sm font-medium text-t1">本周完成 {{ trail.length }} 项任务</p><p class="mt-2 text-xs leading-5 text-t3">{{ weekStart }} 起的一周 · 涉及 {{ touchedGoals }} 个目标，按实际完成时间统计。</p></div>
      <AppSelect v-model="goalFilter" :options="[{ value: '', label: '全部目标与日常任务' }, ...longPlans.map(goal => ({ value: goal.id, label: goal.title }))]" aria-label="按目标筛选完成记录" />
      <article v-for="task in trail" :key="task.id" class="mt-4 rounded-xl border border-line p-3"><p class="text-xs text-t3">{{ new Date(task.doneAt!).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }) }}</p><button class="min-h-11 w-full text-left text-sm font-medium text-t1 hover:text-primary" @click="emit('edit', task)">{{ task.title }}</button><p v-if="taskPlans(task, weeklyPlans, longPlans).goal" class="text-xs text-primary">目标 · {{ taskPlans(task, weeklyPlans, longPlans).goal?.title }}</p><button v-for="memo in progressMemos(task)" :key="memo.id" class="mt-2 min-h-11 w-full truncate text-left text-xs text-info hover:underline" @click="openHubItem('memos', memo.id)">{{ memo.title || '关联便签' }}</button></article>
      <p v-if="!trail.length" class="py-6 text-sm leading-6 text-t3">这一周还没有完成记录。慢慢来，每一小步都可以留下来。</p>
    </template>
    <LongPlanModal :open="goalOpen" :entry="editingGoal" @close="goalOpen = false" />
    <WeeklyPlanModal :open="weekOpen" :entry="editingWeek" :week-start="weekStart" :preset-long-plan-id="presetGoal" @close="weekOpen = false" />
    <button v-if="undo" class="mt-3 min-h-11 text-xs text-primary hover:underline" @click="undoSchedule">撤销本次自动排期</button><WeekSchedulePreviewModal :open="Boolean(previewWeek)" :plan="previewWeek" :draft="previewDraft" @close="previewWeek = null" @apply="apply" />
  </div>
</template>
