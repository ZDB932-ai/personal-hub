<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarDays, Check, Inbox, Trash2, X } from '@lucide/vue'
import ModalShell from '@/components/ModalShell.vue'
import type { Task } from '@/types'

type QueueDestination = 'today' | 'tomorrow' | 'inbox' | 'cancel'

const props = defineProps<{
  open: boolean
  tasks: Task[]
}>()

const emit = defineEmits<{
  close: []
  apply: [payload: { ids: string[]; destination: QueueDestination }]
}>()

const selectedIds = ref<string[]>([])
const destination = ref<QueueDestination>('today')
const selectedCount = computed(() => selectedIds.value.length)
const allSelected = computed(() => props.tasks.length > 0 && selectedIds.value.length === props.tasks.length)

function toggleTask(id: string): void {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((item) => item !== id)
    : [...selectedIds.value, id]
}

function toggleAll(): void {
  selectedIds.value = allSelected.value ? [] : props.tasks.map((task) => task.id)
}

function apply(): void {
  if (selectedIds.value.length === 0) return
  emit('apply', { ids: [...selectedIds.value], destination: destination.value })
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    selectedIds.value = []
    destination.value = 'today'
  },
)
</script>

<template>
  <ModalShell :open="open" max-width="max-w-lg" @close="emit('close')">
    <div class="flex items-start justify-between gap-4">
      <div class="flex min-w-0 items-center gap-3">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warn/10 text-warn">
          <CalendarDays class="h-4 w-4" />
        </span>
        <div class="min-w-0">
          <p class="text-xs font-medium text-warn">待重新安排</p>
          <h3 class="mt-1 text-lg font-semibold text-t1">把过去的计划安放好</h3>
        </div>
      </div>
      <button aria-label="关闭" class="ui-icon-button h-9 w-9 shrink-0" @click="emit('close')">
        <X class="h-4 w-4" />
      </button>
    </div>

    <p class="mt-4 text-sm leading-relaxed text-t2">不需要一次处理完。只选择现在愿意继续面对的任务，其他仍会留在这里。</p>

    <div v-if="tasks.length" class="mt-5">
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs font-medium text-t3">选择要处理的任务</p>
        <button type="button" class="text-xs font-medium text-primary hover:text-primary-strong" @click="toggleAll">
          {{ allSelected ? '取消全选' : '全选' }}
        </button>
      </div>
      <div class="gentle-reset-list mt-2">
        <button
          v-for="task in tasks"
          :key="task.id"
          type="button"
          class="gentle-reset-task"
          :class="{ 'is-selected': selectedIds.includes(task.id) }"
          :aria-pressed="selectedIds.includes(task.id)"
          @click="toggleTask(task.id)"
        >
          <span class="gentle-reset-check" aria-hidden="true">
            <Check v-if="selectedIds.includes(task.id)" class="h-3 w-3" />
          </span>
          <span class="min-w-0 flex-1 truncate text-left text-sm text-t2">{{ task.title }}</span>
          <span class="text-xs tabular-nums text-t4">{{ task.date }}</span>
        </button>
      </div>

      <div class="mt-5">
        <p class="text-xs font-medium text-t3">接下来放在哪里？</p>
        <div class="queue-destination-grid mt-2">
          <button type="button" class="queue-destination-choice" :class="{ 'is-active': destination === 'today' }" :aria-pressed="destination === 'today'" @click="destination = 'today'">
            <CalendarDays class="h-4 w-4" />
            今天
          </button>
          <button type="button" class="queue-destination-choice" :class="{ 'is-active': destination === 'tomorrow' }" :aria-pressed="destination === 'tomorrow'" @click="destination = 'tomorrow'">
            <CalendarDays class="h-4 w-4" />
            明天
          </button>
          <button type="button" class="queue-destination-choice" :class="{ 'is-active': destination === 'inbox' }" :aria-pressed="destination === 'inbox'" @click="destination = 'inbox'">
            <Inbox class="h-4 w-4" />
            待安排
          </button>
          <button type="button" class="queue-destination-choice is-danger" :class="{ 'is-active': destination === 'cancel' }" :aria-pressed="destination === 'cancel'" @click="destination = 'cancel'">
            <Trash2 class="h-4 w-4" />
            取消任务
          </button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state mt-5">
      <CalendarDays class="mx-auto h-8 w-8 text-t4" />
      <p class="mt-3 text-sm font-medium text-t2">没有需要重新安排的任务</p>
    </div>

    <div class="mt-6 flex justify-end gap-3">
      <button class="ui-secondary-button" @click="emit('close')">先不处理</button>
      <button v-if="tasks.length" :disabled="selectedCount === 0" class="ui-primary-button disabled:opacity-40" @click="apply">
        {{ destination === 'cancel' ? `取消 ${selectedCount} 项` : `安放 ${selectedCount} 项` }}
      </button>
    </div>
  </ModalShell>
</template>
