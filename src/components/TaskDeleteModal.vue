<script setup lang="ts">
import { computed } from 'vue'
import { CalendarDays, Clock3, Trash2, X } from '@lucide/vue'
import ModalShell from '@/components/ModalShell.vue'
import type { Task } from '@/types'

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const props = defineProps<{
  open: boolean
  task: Task | null
  mode?: 'delete' | 'cancel'
}>()

const isCancel = computed(() => props.mode === 'cancel')
</script>

<template>
  <ModalShell :open="open" max-width="max-w-md" @close="emit('close')">
    <div v-if="task">
      <div class="flex items-start justify-between gap-4">
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
            <Trash2 class="h-5 w-5" />
          </span>
          <div class="min-w-0">
            <h3 class="text-lg font-semibold text-t1">{{ isCancel ? '取消任务' : '删除任务' }}</h3>
            <p class="mt-0.5 text-xs text-t3">{{ isCancel ? '取消后会从计划中移除，无法恢复。' : '删除后无法恢复，请确认任务不再需要。' }}</p>
          </div>
        </div>
        <button aria-label="关闭" class="ui-icon-button h-9 w-9 shrink-0" @click="emit('close')">
          <X class="h-4 w-4" />
        </button>
      </div>

      <section class="mt-5 rounded-xl border border-danger/25 bg-danger/10 p-4">
        <p class="text-[11px] font-semibold tracking-wide text-danger">{{ isCancel ? '将要取消' : '将要删除' }}</p>
        <h4 class="mt-2 break-words text-base font-semibold leading-6 text-t1">{{ task.title }}</h4>
        <p v-if="task.notes" class="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-6 text-t3">{{ task.notes }}</p>
        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-danger/20 pt-3 text-xs text-t3">
          <span class="flex items-center gap-1.5">
            <CalendarDays class="h-3.5 w-3.5 text-t4" />
            {{ task.date || '未设置日期' }}
          </span>
          <span v-if="task.time" class="flex items-center gap-1.5">
            <Clock3 class="h-3.5 w-3.5 text-t4" />
            {{ task.time }}
          </span>
          <span v-if="task.subtasks.length > 0">含 {{ task.subtasks.length }} 个子任务</span>
        </div>
      </section>

      <div class="mt-5 flex justify-end gap-2">
        <button class="ui-secondary-button" @click="emit('close')">取消</button>
        <button class="ui-danger-button gap-2" @click="emit('confirm')">
          <Trash2 class="h-4 w-4" />
          {{ isCancel ? '确认取消' : '删除任务' }}
        </button>
      </div>
    </div>
  </ModalShell>
</template>
