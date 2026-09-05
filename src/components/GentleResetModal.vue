<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarDays, Check, Inbox, X } from '@lucide/vue'
import ModalShell from '@/components/ModalShell.vue'
import type { Task } from '@/types'

const props = defineProps<{
  open: boolean
  date: string
  tasks: Task[]
}>()

const emit = defineEmits<{
  close: []
  apply: [payload: { ids: string[]; destination: 'tomorrow' | 'inbox' }]
}>()

const selectedIds = ref<string[]>([])
const destination = ref<'tomorrow' | 'inbox'>('tomorrow')

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
    destination.value = 'tomorrow'
  },
)
</script>

<template>
  <ModalShell :open="open" max-width="max-w-md" @close="emit('close')">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <CalendarDays class="h-4 w-4" />
        </span>
        <div>
          <p class="text-xs font-medium text-primary">温和整理</p>
          <h3 class="mt-1 text-lg font-semibold text-t1">把没做完的事安放好</h3>
        </div>
      </div>
      <button aria-label="关闭" class="ui-icon-button" @click="emit('close')">
        <X class="h-5 w-5" />
      </button>
    </div>

    <p class="mt-4 text-sm leading-relaxed text-t2">计划没有照做，不代表你没有在前进。只处理你愿意处理的部分，其他会留在原处。</p>

    <template v-if="tasks.length > 0">
      <div class="mt-5 flex items-center justify-between gap-3">
        <p class="text-xs font-medium text-t3">选择要重新安放的行动</p>
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
          <span class="task-priority" :class="task.priority === 3 ? 'is-high' : task.priority === 2 ? 'is-medium' : 'is-low'">
            <span class="task-priority-dot" aria-hidden="true"></span>
            {{ task.priority === 3 ? '高' : task.priority === 2 ? '中' : '低' }}
          </span>
        </button>
      </div>

      <div class="mt-5">
        <p class="text-xs font-medium text-t3">它们现在更适合放在哪里？</p>
        <div class="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="gentle-reset-choice"
            :class="{ 'is-active': destination === 'tomorrow' }"
            :aria-pressed="destination === 'tomorrow'"
            @click="destination = 'tomorrow'"
          >
            <CalendarDays class="h-4 w-4" />
            <span>明天再看</span>
          </button>
          <button
            type="button"
            class="gentle-reset-choice"
            :class="{ 'is-active': destination === 'inbox' }"
            :aria-pressed="destination === 'inbox'"
            @click="destination = 'inbox'"
          >
            <Inbox class="h-4 w-4" />
            <span>放回待安排</span>
          </button>
        </div>
      </div>
    </template>

    <div v-else class="empty-state mt-5">
      <CalendarDays class="mx-auto h-8 w-8 text-t4" />
      <p class="mt-3 text-sm font-medium text-t2">这一天已经没有待安放的任务</p>
      <p class="mt-1 text-xs text-t4">不用再为它做任何处理。</p>
    </div>

    <div class="mt-6 flex justify-end gap-3">
      <button class="ui-secondary-button" @click="emit('close')">{{ tasks.length ? '先不处理' : '知道了' }}</button>
      <button v-if="tasks.length" :disabled="selectedCount === 0" class="ui-primary-button disabled:opacity-40" @click="apply">
        安放 {{ selectedCount }} 项
      </button>
    </div>
  </ModalShell>
</template>
