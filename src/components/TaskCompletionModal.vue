<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarDays, Check, CheckCircle2, Clock3, Repeat2, Tag, X } from '@lucide/vue'
import ModalShell from '@/components/ModalShell.vue'
import type { Task, TaskPriority, TaskRepeat } from '@/types'

const props = defineProps<{
  open: boolean
  task: Task | null
}>()

const emit = defineEmits<{
  close: []
  confirm: [payload: { note: string; nextTitle: string; saveMemo: boolean }]
}>()

const priorityLabel: Record<TaskPriority, string> = {
  1: '低优先级',
  2: '中优先级',
  3: '高优先级',
}

const repeatLabel: Record<TaskRepeat, string> = {
  none: '不重复',
  daily: '每天重复',
  weekly: '每周重复',
  workdays: '工作日重复',
}

const incompleteSubtasks = computed(() => props.task?.subtasks.filter((item) => !item.done) ?? [])
const completionNote = ref('')
const createNextStep = ref(false)
const nextTitle = ref('')
const saveMemo = ref(true)

function confirm(): void {
  emit('confirm', {
    note: completionNote.value.trim(),
    saveMemo: saveMemo.value,
    nextTitle: createNextStep.value ? nextTitle.value.trim() : '',
  })
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    completionNote.value = ''
    saveMemo.value = true
    createNextStep.value = false
    nextTitle.value = props.task ? `继续推进：${props.task.title}` : ''
  },
)
</script>

<template>
  <ModalShell :open="open" max-width="max-w-md" @close="emit('close')">
    <div v-if="task">
      <div class="flex items-start justify-between gap-4">
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <CheckCircle2 class="h-5 w-5" />
          </span>
          <div class="min-w-0">
            <h3 class="text-lg font-semibold text-t1">确认完成任务</h3>
            <p class="mt-0.5 text-xs text-t3">完成后任务会归入已完成列表。</p>
          </div>
        </div>
        <button
          aria-label="关闭"
          class="ui-icon-button h-9 w-9 shrink-0"
          @click="emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <section class="mt-5 rounded-xl border border-line bg-surface p-4">
        <p class="text-[11px] font-semibold tracking-wide text-t4">任务内容</p>
        <h4 class="mt-2 break-words text-base font-semibold leading-6 text-t1">{{ task.title }}</h4>
        <p v-if="task.notes" class="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-t3">{{ task.notes }}</p>

        <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3 text-xs">
          <div class="flex min-w-0 items-center gap-2 text-t3">
            <CalendarDays class="h-3.5 w-3.5 shrink-0 text-t4" />
            <div class="min-w-0">
              <dt class="text-[10px] text-t4">日期</dt>
              <dd class="mt-0.5 truncate text-t2">{{ task.date || '未设置' }}</dd>
            </div>
          </div>
          <div class="flex min-w-0 items-center gap-2 text-t3">
            <Clock3 class="h-3.5 w-3.5 shrink-0 text-t4" />
            <div class="min-w-0">
              <dt class="text-[10px] text-t4">时间</dt>
              <dd class="mt-0.5 truncate text-t2">{{ task.time || '未设置' }}</dd>
            </div>
          </div>
          <div class="min-w-0">
            <dt class="text-[10px] text-t4">优先级</dt>
            <dd class="mt-0.5 truncate text-t2">{{ priorityLabel[task.priority] }}</dd>
          </div>
          <div class="flex min-w-0 items-center gap-2">
            <Repeat2 class="h-3.5 w-3.5 shrink-0 text-t4" />
            <div class="min-w-0">
              <dt class="text-[10px] text-t4">重复</dt>
              <dd class="mt-0.5 truncate text-t2">{{ repeatLabel[task.repeat] }}</dd>
            </div>
          </div>
        </dl>

        <div v-if="task.tags.length > 0" class="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          <Tag class="h-3.5 w-3.5 text-t4" />
          <span
            v-for="tag in task.tags"
            :key="tag"
            class="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
          >
            {{ tag }}
          </span>
        </div>
      </section>

      <section v-if="task.subtasks.length > 0" class="mt-3 rounded-xl border border-line bg-inset p-3.5">
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs font-semibold text-t2">子任务</p>
          <span class="text-[11px] tabular-nums" :class="incompleteSubtasks.length === 0 ? 'text-ok' : 'text-warn'">
            {{ task.subtasks.length - incompleteSubtasks.length }}/{{ task.subtasks.length }} 已完成
          </span>
        </div>
        <ul class="mt-2.5 space-y-1.5">
          <li v-for="item in task.subtasks" :key="item.id" class="flex min-w-0 items-center gap-2 text-xs">
            <span
              class="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
              :class="item.done ? 'border-ok bg-ok text-ink' : 'border-t4 text-transparent'"
            >
              <Check class="h-2.5 w-2.5" />
            </span>
            <span class="min-w-0 truncate" :class="item.done ? 'text-t4 line-through' : 'text-t2'">{{ item.title }}</span>
          </li>
        </ul>
      </section>

      <p v-if="incompleteSubtasks.length > 0" class="mt-3 text-xs leading-5 text-warn">
        仍有 {{ incompleteSubtasks.length }} 个子任务未完成；确认后主任务仍会被标记为完成。
      </p>

      <section class="mt-4 rounded-xl border border-line bg-inset p-3.5">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold text-t2">完成后的安放</p>
            <span class="mt-0.5 block text-[11px] text-t4">可选，不留也完全可以。</span>
          </div>
          <label class="flex cursor-pointer items-center gap-2 text-xs font-medium text-t2">
            <input v-model="createNextStep" type="checkbox" class="h-4 w-4 rounded border-line text-primary focus:ring-primary" />
            创建下一步
          </label>
        </div>
        <textarea
          v-model="completionNote"
          rows="2"
          placeholder="记录一句进展（可选）"
          aria-label="完成进展"
          class="control-input mt-3 min-h-18 resize-y px-3 py-2 text-sm"
        ></textarea>
        <label v-if="completionNote.trim()" class="mt-2 flex min-h-11 items-center gap-2 text-xs text-t2"><input v-model="saveMemo" type="checkbox" class="accent-primary" />同时存为进展便签，关联到这项任务</label>
        <input
          v-if="createNextStep"
          v-model="nextTitle"
          class="control-input mt-2 px-3 py-2 text-sm"
          placeholder="下一步任务"
        />
      </section>

      <div class="mt-5 flex justify-end gap-2">
        <button class="ui-secondary-button" @click="emit('close')">再检查一下</button>
        <button class="ui-primary-button gap-2" @click="confirm">
          <Check class="h-4 w-4" />
          确认完成
        </button>
      </div>
    </div>
  </ModalShell>
</template>
