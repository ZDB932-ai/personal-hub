<script setup lang="ts">
import TaskResume from '@/components/TaskResume.vue'
import { confirmAction } from '@/lib/confirmAction'
import { computed, reactive, ref, watch } from 'vue'
import ModalShell from '@/components/ModalShell.vue'
import AppSelect from '@/components/AppSelect.vue'
import AppDatePicker from '@/components/AppDatePicker.vue'
import TaskLinks from '@/components/TaskLinks.vue'
import TaskScheduleHint from '@/components/TaskScheduleHint.vue'
import { longPlans, weeklyPlans } from '@/stores/planning'
import { taskPlans } from '@/lib/calendarConnections'
import { openHubItem } from '@/stores/hub'
import { Check, Plus, X } from '@lucide/vue'
import { addTask, updateTask } from '@/stores/tasks'
import { ensureNotificationPermission } from '@/lib/reminders'
import { toast } from '@/lib/toast'
import { uid } from '@/lib/utils'
import type { EntityLink, SubTask, Task, TaskPriority, TaskRepeat } from '@/types'

const props = defineProps<{
  open: boolean
  entry: Task | null
  defaultDate?: string
  defaultDraft?: Partial<Task>
  scheduleProposal?: { date: string; time: string }
}>()

const emit = defineEmits<{
  close: []
}>()

const form = reactive({
  longPlanId: '',
  estimatedMinutes: '' as number | '',
  links: [] as EntityLink[],
  title: '',
  notes: '',
  date: '',
  time: '',
  priority: 2 as TaskPriority,
  repeat: 'none' as TaskRepeat,
  tagsText: '',
  subtasks: [] as SubTask[],
})
const subInput = ref('')
const error = ref('')
const source = computed(() => props.entry ? taskPlans(props.entry, weeklyPlans.value, longPlans.value) : null)
const goalOptions = computed(() => [{ value: '', label: '不关联方向' }, ...(form.longPlanId && !longPlans.value.some(goal => goal.id === form.longPlanId) ? [{ value: form.longPlanId, label: '原方向已删除或尚未同步' }] : []), ...longPlans.value.filter(goal => goal.status === 'active' || goal.id === form.longPlanId).map(goal => ({ value: goal.id, label: goal.title }))])

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    subInput.value = ''
    if (props.entry) {
      Object.assign(form, {
        longPlanId: source.value?.goal?.id ?? props.entry.longPlanId ?? '',
        estimatedMinutes: props.entry.estimatedMinutes ?? '',
        links: (props.entry.links ?? []).map(link => ({ ...link })),
        title: props.entry.title,
        notes: props.entry.notes,
        date: props.scheduleProposal?.date ?? props.entry.date,
        time: props.scheduleProposal?.time ?? props.entry.time,
        priority: props.entry.priority,
        repeat: props.entry.repeat,
        tagsText: (props.entry.tags ?? []).join(', '),
        subtasks: (props.entry.subtasks ?? []).map((s) => ({ ...s })),
      })
    } else {
      Object.assign(form, {
        longPlanId: props.defaultDraft?.longPlanId ?? '',
        estimatedMinutes: props.defaultDraft?.estimatedMinutes ?? '',
        links: (props.defaultDraft?.links ?? []).map(link => ({ ...link })),
        title: props.defaultDraft?.title ?? '',
        notes: props.defaultDraft?.notes ?? '',
        date: props.defaultDate ?? '',
        time: props.defaultDraft?.time ?? '',
        priority: 2 as TaskPriority,
        repeat: 'none' as TaskRepeat,
        tagsText: (props.defaultDraft?.tags ?? []).join(', '),
        subtasks: [],
      })
    }
  },
  { immediate: true },
)

function addSub(): void {
  const v = subInput.value.trim()
  if (!v) return
  form.subtasks.push({ id: uid(), title: v, done: false })
  subInput.value = ''
}

function parsedTags(): string[] {
  return form.tagsText
    .split(/[,，#\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5)
}

async function save() {
  const estimatedMinutes = form.estimatedMinutes === '' ? undefined : Number(form.estimatedMinutes)
  if (estimatedMinutes !== undefined && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 1440)) { error.value = '预计时长应为 1–1440 分钟，或留空'; return }
  if (!form.title.trim()) {
    error.value = '请填写任务内容'
    return
  }
  if (form.time && !form.date) {
    error.value = '设置时间前，请先安排一个日期'
    return
  }
  if (form.time && form.date) {
    const granted = await ensureNotificationPermission()
    if (!granted && !await confirmAction('未授予通知权限，到点将不会提醒。仍要保存吗？')) return
  }
  const tags = parsedTags()
  if (props.entry) {
    updateTask(props.entry.id, { ...form, longPlanId: form.longPlanId || undefined, estimatedMinutes, tags, subtasks: form.subtasks.map(s => ({ ...s })), links: form.links.map(link => ({ ...link })) })
    toast('已更新')
  } else {
    addTask({ ...form, longPlanId: form.longPlanId || undefined, estimatedMinutes, tags, subtasks: form.subtasks.map(s => ({ ...s })), links: form.links.map(link => ({ ...link })) })
    toast(form.time ? '已添加，到点会提醒你' : '已添加')
  }
  emit('close')
}

async function openLink(link: EntityLink): Promise<void> {
  if (!await confirmAction('打开关联条目会关闭任务编辑，尚未保存的修改将丢弃。继续吗？')) return
  emit('close')
  openHubItem(link.kind, link.id)
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-t1 placeholder:text-t4 outline-none transition focus:border-primary/60 focus:bg-surface-2 focus:ring-2 focus:ring-primary/25'
</script>

<template>
  <ModalShell :open="open" @close="emit('close')">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold">{{ entry ? '编辑任务' : '新建任务' }}</h3>
      <button
        aria-label="关闭"
        class="rounded-lg p-1.5 text-t4 transition hover:bg-surface hover:text-t2"
        @click="emit('close')"
      >
        <X class="h-5 w-5" />
      </button>
    </div>

    <TaskResume v-if="entry" :task="entry" />
    <div class="mt-5 space-y-4">
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">任务内容 *</span>
        <input v-model="form.title" :class="inputCls" placeholder="要做什么？" />
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-t3">
            日期（可稍后安排）
            <button v-if="form.date" type="button" class="font-normal text-primary hover:text-primary-strong" @click.prevent="form.date = ''">暂不安排</button>
          </span>
          <AppDatePicker v-model="form.date" class="w-full" aria-label="选择任务日期" />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-t3">时间（设了才会提醒）</span>
          <input v-model="form.time" type="time" :class="inputCls" />
        </label>
      </div>
      <label class="block"><span class="mb-1.5 block text-xs font-medium text-t3">预计时长（分钟，可选）</span><input v-model.number="form.estimatedMinutes" type="number" min="1" max="1440" step="1" :class="inputCls" placeholder="未填写时，排期按 30 分钟估算" /></label>
      <TaskScheduleHint :date="form.date" :time="form.time" :minutes="form.estimatedMinutes" :task-id="entry?.id" />
      <p v-if="source?.weekly" class="rounded-lg bg-primary/10 p-3 text-xs leading-5 text-primary">来自周计划「{{ source.weekly.title }}」{{ source.goal ? `，朝向「${source.goal.title}」` : '' }}。方向关联跟随周计划。</p>
      <label v-else class="block"><span class="mb-1.5 block text-xs font-medium text-t3">这一步，想靠近哪个方向？</span><AppSelect v-model="form.longPlanId" :options="goalOptions" aria-label="关联长期方向" /></label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-t3">优先级</span>
          <AppSelect
            v-model="form.priority"
            :options="[{ value: 1, label: '低' }, { value: 2, label: '中' }, { value: 3, label: '高' }]"
          />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-t3">重复</span>
          <AppSelect
            v-model="form.repeat"
            :options="[
              { value: 'none', label: '不重复' },
              { value: 'daily', label: '每天' },
              { value: 'weekly', label: '每周' },
              { value: 'workdays', label: '工作日' },
            ]"
          />
        </label>
      </div>
      <div class="rounded-xl border border-line bg-inset p-3.5">
        <p class="text-xs font-medium text-t3">子任务（{{ form.subtasks.filter((s) => s.done).length }}/{{ form.subtasks.length }}）</p>
        <ul v-if="form.subtasks.length > 0" class="mt-2 space-y-1.5">
          <li v-for="s in form.subtasks" :key="s.id" class="flex items-center gap-2.5">
            <button
              type="button"
              class="flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors duration-150"
              :class="s.done ? 'border-primary bg-primary' : 'border-t4'"
              @click="s.done = !s.done"
            >
              <Check v-if="s.done" class="h-2.5 w-2.5 text-ink" />
            </button>
            <span class="min-w-0 flex-1 truncate text-xs" :class="s.done ? 'text-t4 line-through' : 'text-t2'">
              {{ s.title }}
            </span>
            <button type="button" class="rounded p-0.5 text-t4 hover:text-danger" @click="form.subtasks = form.subtasks.filter((x) => x.id !== s.id)">
              <X class="h-3 w-3" />
            </button>
          </li>
        </ul>
        <div class="mt-2 flex items-center gap-2">
          <Plus class="h-3.5 w-3.5 shrink-0 text-t4" />
          <input
            v-model="subInput"
            class="w-full border-0 border-b border-dashed border-line bg-transparent py-1 text-xs text-t1 placeholder:text-t4 outline-none transition focus:border-primary"
            placeholder="添加子任务，回车确认"
            @keydown.enter.prevent="addSub"
          />
        </div>
      </div>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">标签（逗号分隔，也可在快速输入里用 #）</span>
        <input v-model="form.tagsText" :class="inputCls" placeholder="如：工作, 重要" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">备注</span>
        <textarea v-model="form.notes" rows="2" :class="inputCls" placeholder="选填"></textarea>
      </label>

      <p v-if="error" class="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
        {{ error }}
      </p>
      <TaskLinks v-model="form.links" @open="openLink" />
    </div>

    <div class="mt-6 flex justify-end gap-3">
      <button
        class="rounded-lg px-4 py-2.5 text-sm font-medium text-t3 transition hover:bg-surface hover:text-t2"
        @click="emit('close')"
      >
        取消
      </button>
      <button
        class="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-primary-strong"
        @click="save"
      >
        {{ entry ? '保存修改' : '添加任务' }}
      </button>
    </div>
  </ModalShell>
</template>
