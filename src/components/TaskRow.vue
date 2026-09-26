<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat,
  SendHorizontal,
  Star,
  Tag as TagIcon,
  Trash2,
  X,
} from '@lucide/vue'
import type { Task, TaskPriority } from '@/types'

const props = defineProps<{
  task: Task
  showDate?: string
  showOverdueQuickActions?: boolean
  showFocusAction?: boolean
}>()

const emit = defineEmits<{
  toggle: []
  edit: []
  remove: []
  dispatch: []
  cancel: []
  'schedule-today': []
  postpone: []
  'toggle-focus': []
  'add-sub': [title: string]
  'toggle-sub': [id: string]
  'remove-sub': [id: string]
}>()

const expanded = ref(false)
const subInput = ref('')
const actionMenu = ref<HTMLDetailsElement | null>(null)

const subs = computed(() => props.task.subtasks ?? [])
const doneSubs = computed(() => subs.value.filter((s) => s.done).length)
const hasSubs = computed(() => subs.value.length > 0)

function addSub(): void {
  const v = subInput.value.trim()
  if (!v) return
  emit('add-sub', v)
  subInput.value = ''
}

function requestRemove(): void {
  actionMenu.value?.removeAttribute('open')
  emit('remove')
}

function requestFocus(): void {
  actionMenu.value?.removeAttribute('open')
  emit('toggle-focus')
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  1: '低优先级',
  2: '中优先级',
  3: '高优先级',
}

const PRIORITY_TONE: Record<TaskPriority, string> = {
  1: 'is-low',
  2: 'is-medium',
  3: 'is-high',
}
</script>

<template>
  <div class="border-b border-line transition-colors duration-150 hover:bg-surface">
    <div class="flex flex-wrap items-center gap-3 px-4 py-3">
      <button
        class="group flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-surface-2"
        :aria-label="task.done ? '取消完成任务' : '完成任务'"
        :aria-pressed="task.done"
        @click="emit('toggle')"
      >
        <span
          class="flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors duration-150"
          :class="task.done ? 'border-primary bg-primary' : 'border-t4 group-hover:border-primary'"
        >
          <Check v-if="task.done" class="h-3 w-3 text-ink" />
        </span>
      </button>
      <span
        class="task-priority"
        :class="PRIORITY_TONE[task.priority]"
        :aria-label="`任务优先级：${PRIORITY_LABEL[task.priority]}`"
      >
        <span class="task-priority-dot"></span>
        {{ PRIORITY_LABEL[task.priority] }}
      </span>
      <span v-if="task.focusDate && !showFocusAction" class="task-focus-indicator" title="已设为日重点">
        <Star class="h-3.5 w-3.5" aria-hidden="true" />
        日重点
      </span>

      <button class="min-w-0 flex-1 text-left" @click="emit('edit')">
        <p
          class="truncate text-sm"
          :class="task.done ? 'text-t4 line-through' : 'text-t1'"
        >
          {{ task.title }}
        </p>
        <p v-if="task.notes" class="mt-0.5 truncate text-xs text-t4">{{ task.notes }}</p>
        <p v-if="task.weeklyPlanId" class="task-plan-indicator" title="来自周计划">来自周计划</p>
        <p v-if="task.estimatedMinutes || task.links?.length" class="mt-1 text-xs text-t3"><span v-if="task.estimatedMinutes">预计 {{ task.estimatedMinutes }} 分钟</span><span v-if="task.links?.length" class="ml-2">{{ task.links.length }} 项关联资料</span></p>
        <div v-if="(task.tags ?? []).length > 0" class="mt-1 flex flex-wrap gap-1">
          <span
            v-for="tag in task.tags"
            :key="tag"
            class="flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
          >
            <TagIcon class="h-2.5 w-2.5" />
            {{ tag }}
          </span>
        </div>
      </button>

      <button v-if="showFocusAction && !task.done" class="ui-icon-button shrink-0" :class="task.focusDate ? 'text-primary' : 'text-t4'" :aria-label="`${task.focusDate ? '取消重点' : '设为重点'}：${task.title}`" :aria-pressed="Boolean(task.focusDate)" @click="requestFocus">
        <Star class="h-4 w-4" :fill="task.focusDate ? 'currentColor' : 'none'" />
      </button>
      <span
        v-if="hasSubs"
        class="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] tabular-nums"
        :class="doneSubs === subs.length ? 'text-ok' : 'text-t4'"
      >
        {{ doneSubs }}/{{ subs.length }}
      </span>
      <Repeat
        v-if="task.repeat !== 'none'"
        class="h-3.5 w-3.5 shrink-0 text-t4"
        :title="{ daily: '每天', weekly: '每周', workdays: '工作日' }[task.repeat]"
      />
      <span
        v-if="task.time"
        class="flex shrink-0 items-center gap-1 rounded-md bg-inset px-2 py-1 text-xs tabular-nums text-t3"
      >
        <Clock class="h-3 w-3" />
        {{ task.time }}
      </span>
      <span
        v-if="showDate"
        class="hidden shrink-0 rounded-md bg-inset px-2 py-1 text-xs text-t4 md:inline"
      >
        {{ showDate }}
      </span>
      <div v-if="showOverdueQuickActions" class="task-overdue-actions">
        <button type="button" class="task-overdue-action is-today" @click="emit('schedule-today')">安排到今天</button>
        <button type="button" class="task-overdue-action is-postpone" @click="emit('postpone')">推迟一天</button>
        <button type="button" class="task-overdue-action is-cancel" @click="emit('cancel')">取消任务</button>
      </div>

      <button
        v-if="hasSubs || !task.done"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-t4 transition-colors duration-150 hover:bg-surface-2 hover:text-t2"
        :aria-label="expanded ? '收起子任务' : '展开子任务'"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <ChevronDown v-if="expanded" class="h-4 w-4" />
        <ChevronRight v-else class="h-4 w-4" />
      </button>
      <details ref="actionMenu" class="relative shrink-0">
        <summary
          aria-label="更多任务操作"
          class="flex h-9 w-9 list-none items-center justify-center rounded-lg text-t4 transition-colors duration-150 hover:bg-surface-2 hover:text-t2 [&::-webkit-details-marker]:hidden"
        >
          <MoreHorizontal class="h-4 w-4" />
        </summary>
        <div class="absolute right-0 top-10 z-20 w-32 rounded-lg border border-line bg-elevated p-1">
          <button class="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-t2 transition-colors duration-150 hover:bg-surface-2 hover:text-primary" @click="requestFocus">
            <Star class="h-3.5 w-3.5" :fill="task.focusDate ? 'currentColor' : 'none'" />
            {{ task.focusDate ? '取消重点' : '设为重点' }}
          </button>
          <button class="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-t2 transition-colors duration-150 hover:bg-surface-2 hover:text-primary" @click="emit('dispatch')">
            <SendHorizontal class="h-3.5 w-3.5" />
            派发给 AI
          </button>
          <button class="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-t2 transition-colors duration-150 hover:bg-surface-2" @click="emit('edit')">
            <Pencil class="h-3.5 w-3.5" />
            编辑
          </button>
          <button class="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-danger transition-colors duration-150 hover:bg-danger/10" @click="requestRemove">
            <Trash2 class="h-3.5 w-3.5" />
            删除
          </button>
        </div>
      </details>
    </div>

    <div v-if="expanded" class="border-t border-line px-4 py-3 pl-[52px]">
      <ul v-if="subs.length > 0" class="space-y-1.5">
        <li v-for="s in subs" :key="s.id" class="group/sub flex items-center gap-2.5">
          <button
            class="group flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors duration-150 hover:bg-surface-2"
            :aria-label="s.done ? '取消完成子任务' : '完成子任务'"
            :aria-pressed="s.done"
            @click="emit('toggle-sub', s.id)"
          >
            <span
              class="flex h-4 w-4 items-center justify-center rounded border-2 transition-colors duration-150"
              :class="s.done ? 'border-primary bg-primary' : 'border-t4 group-hover:border-primary'"
            >
              <Check v-if="s.done" class="h-2.5 w-2.5 text-ink" />
            </span>
          </button>
          <span class="min-w-0 flex-1 truncate text-xs" :class="s.done ? 'text-t4 line-through' : 'text-t2'">
            {{ s.title }}
          </span>
          <button
            class="flex h-8 w-8 items-center justify-center rounded text-t4 transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
            aria-label="删除子任务"
            @click="emit('remove-sub', s.id)"
          >
            <X class="h-3 w-3" />
          </button>
        </li>
      </ul>
      <div v-if="!task.done" class="mt-2 flex items-center gap-2">
        <Plus class="h-3.5 w-3.5 shrink-0 text-t4" />
        <input
          v-model="subInput"
          placeholder="添加子任务，回车确认"
          class="w-full border-0 border-b border-dashed border-line bg-transparent py-1 text-xs text-t1 placeholder:text-t4 outline-none transition focus:border-primary"
          @keydown.enter.prevent="addSub"
        />
      </div>
    </div>
  </div>
</template>
