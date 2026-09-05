<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import AppSelect from '@/components/AppSelect.vue'
import ModalShell from '@/components/ModalShell.vue'
import { addWeeklyPlan, longPlans, updateWeeklyPlan } from '@/stores/planning'
import { toast } from '@/lib/toast'
import type { TaskPriority, WeeklyPlan } from '@/types'

const props = defineProps<{
  open: boolean
  entry: WeeklyPlan | null
  weekStart: string
  presetLongPlanId?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const form = reactive({
  title: '',
  notes: '',
  priority: 2 as TaskPriority,
  sessions: 3,
  preferredWeekdays: [] as number[],
  longPlanId: '',
})
const error = ref('')
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const longPlanOptions = computed(() => [
  { value: '', label: '不关联长期方向' },
  ...longPlans.value
    .filter((plan) => plan.status !== 'completed')
    .map((plan) => ({ value: plan.id, label: plan.title })),
])

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    if (props.entry) {
      Object.assign(form, {
        title: props.entry.title,
        notes: props.entry.notes,
        priority: props.entry.priority,
        sessions: props.entry.sessions,
        preferredWeekdays: [...props.entry.preferredWeekdays],
        longPlanId: props.entry.longPlanId ?? '',
      })
      return
    }
    Object.assign(form, {
      title: '',
      notes: '',
      priority: 2 as TaskPriority,
      sessions: 3,
      preferredWeekdays: [],
      longPlanId: props.presetLongPlanId ?? '',
    })
  },
  { immediate: true },
)

function toggleWeekday(day: number): void {
  form.preferredWeekdays = form.preferredWeekdays.includes(day)
    ? form.preferredWeekdays.filter((item) => item !== day)
    : [...form.preferredWeekdays, day].sort()
}

function save(): void {
  const title = form.title.trim()
  if (!title) {
    error.value = '写下一件这周想照顾的事'
    return
  }
  const sessions = Math.floor(Number(form.sessions))
  if (!Number.isFinite(sessions) || sessions < 1) {
    error.value = '请输入至少 1 次行动'
    return
  }
  const draft = {
    title,
    notes: form.notes.trim(),
    weekStart: props.weekStart,
    priority: form.priority,
    sessions,
    preferredWeekdays: [...form.preferredWeekdays],
    longPlanId: form.longPlanId || undefined,
  }
  if (props.entry) {
    updateWeeklyPlan(props.entry.id, draft)
    toast('周计划已更新')
  } else {
    addWeeklyPlan(draft)
    toast('已加入本周，准备好时再分配到每天')
  }
  emit('close')
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-t1 placeholder:text-t4 outline-none transition focus:border-primary/60 focus:bg-surface-2 focus:ring-2 focus:ring-primary/25'
</script>

<template>
  <ModalShell :open="open" max-width="max-w-xl" @close="emit('close')">
    <div class="flex items-center justify-between gap-4">
      <div>
        <p class="text-xs font-medium text-primary">本周计划</p>
        <h3 class="mt-1 text-lg font-semibold text-t1">{{ entry ? '编辑这周的方向' : '给这周留一个方向' }}</h3>
      </div>
      <button aria-label="关闭" class="ui-icon-button" @click="emit('close')">
        <X class="h-5 w-5" />
      </button>
    </div>

    <p class="mt-3 text-xs leading-relaxed text-t3">不必把一周排满。先选一件想推进或想照顾的事，再决定投入几次。</p>

    <div class="mt-5 space-y-4">
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">这周想照顾的事 *</span>
        <input v-model="form.title" :class="inputCls" placeholder="例如：整理作品集、恢复跑步节奏" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">补充说明</span>
        <textarea v-model="form.notes" rows="2" :class="inputCls" placeholder="写一点背景、范围或提醒（选填）"></textarea>
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-t3">计划进行次数</span>
          <input
            v-model.number="form.sessions"
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            :class="inputCls"
            aria-describedby="weekly-session-hint"
          />
          <span id="weekly-session-hint" class="mt-1 block text-[11px] leading-relaxed text-t4">按你的需要填写，不设每周数量上限。</span>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-t3">优先级</span>
          <AppSelect
            v-model="form.priority"
            :options="[{ value: 1, label: '低优先级' }, { value: 2, label: '中优先级' }, { value: 3, label: '高优先级' }]"
          />
        </label>
      </div>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">关联长期方向</span>
        <AppSelect v-model="form.longPlanId" :options="longPlanOptions" />
      </label>
      <div>
        <p class="text-xs font-medium text-t3">倾向安排到哪几天 <span class="font-normal text-t4">（可选）</span></p>
        <div class="mt-2 grid grid-cols-7 gap-1.5">
          <button
            v-for="(day, index) in weekdays"
            :key="day"
            type="button"
            class="min-h-10 rounded-lg border text-xs transition-colors duration-150"
            :class="form.preferredWeekdays.includes(index) ? 'border-primary/50 bg-primary/12 text-primary' : 'border-line bg-surface text-t3 hover:bg-surface-2'"
            :aria-pressed="form.preferredWeekdays.includes(index)"
            @click="toggleWeekday(index)"
          >
            {{ day.slice(1) }}
          </button>
        </div>
      </div>
      <p v-if="error" class="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">{{ error }}</p>
    </div>

    <div class="mt-6 flex justify-end gap-3">
      <button class="ui-ghost-button" @click="emit('close')">取消</button>
      <button class="ui-primary-button" @click="save">{{ entry ? '保存修改' : '加入本周' }}</button>
    </div>
  </ModalShell>
</template>
