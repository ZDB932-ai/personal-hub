<script setup lang="ts">
import { computed } from 'vue'
import { CalendarDays, Sparkles, X } from '@lucide/vue'
import ModalShell from '@/components/ModalShell.vue'
import { weekDates, weekdayLabel } from '@/lib/utils'
import type { WeekScheduleDraft } from '@/stores/planning'
import type { WeeklyPlan } from '@/types'
import { tasks } from '@/stores/tasks'

const props = defineProps<{
  open: boolean
  plan: WeeklyPlan | null
  draft: WeekScheduleDraft | null
}>()

const emit = defineEmits<{
  close: []
  apply: []
}>()

interface PreviewEntry {
  title: string
  isNew: boolean
}

const groups = computed(() => {
  if (!props.plan || !props.draft) return []
  const existing = tasks.value.filter((task) => task.weeklyPlanId === props.plan?.id)
  return weekDates(props.plan.weekStart).map((date) => ({
    date,
    label: weekdayLabel(date),
    entries: [
      ...existing
        .filter((task) => task.date === date)
        .map<PreviewEntry>((task) => ({ title: task.title, isNew: false })),
      ...(props.draft?.entries
        .filter((entry) => entry.date === date)
        .map<PreviewEntry>((entry) => ({ title: entry.title, isNew: true })) ?? []),
    ],
  }))
})

const hasEntries = computed(() => groups.value.some((group) => group.entries.length > 0))
</script>

<template>
  <ModalShell :open="open" max-width="max-w-2xl" @close="emit('close')">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-start gap-3">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <Sparkles class="h-4 w-4" />
        </span>
        <div>
          <h3 class="text-lg font-semibold text-t1">试着分配到本周</h3>
          <p class="mt-1 text-xs text-t3">确认前不会改动任何已有任务。</p>
        </div>
      </div>
      <button aria-label="关闭" class="ui-icon-button" @click="emit('close')">
        <X class="h-5 w-5" />
      </button>
    </div>

    <div v-if="draft" class="mt-5 rounded-lg border border-line bg-inset p-3.5 text-xs leading-relaxed text-t3">
      <div class="flex items-center gap-2 text-t2">
        <CalendarDays class="h-4 w-4 text-primary" />
        <span>会新增 {{ draft.entries.length }} 个行动块；会参考当天节奏并尽量均衡分散。</span>
      </div>
      <p v-if="draft.skippedRestDays" class="mt-1">已尊重 {{ draft.skippedRestDays }} 个留白日，不会往这些日期安排。</p>
      <p v-if="draft.unscheduled" class="mt-1 text-warn">剩余时间不足，或可安排日期已过去、设为留白；另外 {{ draft.unscheduled }} 项保留在待安排。可以调整时长或每日可用时间。</p>
    </div>

    <div v-if="hasEntries" class="week-schedule-preview-grid mt-5">
      <section v-for="group in groups" :key="group.date" class="week-schedule-preview-day">
        <p class="text-xs font-medium text-t3">{{ group.label }} · {{ group.date.slice(5).replace('-', '/') }}</p>
        <div v-if="group.entries.length" class="mt-2 space-y-1.5">
          <p v-for="(entry, index) in group.entries" :key="`${entry.title}-${index}`" class="rounded-md border border-line bg-surface px-2.5 py-2 text-xs text-t2">
            {{ entry.title }}
            <span v-if="entry.isNew" class="mt-1 block text-[10px] text-primary">准备新增</span>
          </p>
        </div>
        <p v-else class="mt-2 text-xs text-t4">留一点空白</p>
      </section>
    </div>
    <div v-else class="empty-state mt-5">
      <CalendarDays class="mx-auto h-8 w-8 text-t4" />
      <p class="mt-3 text-sm font-medium text-t2">这一周没有可安排的日期</p>
      <p class="mt-1 text-xs text-t4">可以取消留白日、切换到其他周，或稍后再安排。</p>
    </div>

    <div class="mt-6 flex justify-end gap-3">
      <button class="ui-ghost-button" @click="emit('close')">{{ draft?.entries.length ? '再想想' : '知道了' }}</button>
      <button v-if="draft?.entries.length" class="ui-primary-button" @click="emit('apply')">应用这份安排</button>
    </div>
  </ModalShell>
</template>
