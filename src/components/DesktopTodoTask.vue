<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { Check, Circle, ChevronDown, ChevronRight, ArrowUp, ArrowDown, GripVertical } from '@lucide/vue'
import type { TodoItem } from '@/lib/desktopTodoProtocol'
const props = defineProps<{ task: TodoItem; readonly: boolean; disabled: boolean; manual: boolean }>()
const emit = defineEmits<{ done: [task: TodoItem]; subtask: [id: string, value: boolean]; open: []; move: [direction: number]; reorderStart: []; reorderEnd: []; reorderDrop: [targetId: string] }>()
const expanded = ref(false)
const sorting = ref(false)
let sortPointer: { id: number; x: number; y: number; target: HTMLElement } | undefined
function cancelSort() {
  const pointer = sortPointer; sortPointer = undefined; sorting.value = false
  document.removeEventListener('keydown', sortKey)
  if (pointer?.target.hasPointerCapture(pointer.id)) pointer.target.releasePointerCapture(pointer.id)
  emit('reorderEnd')
}
function sortKey(event: KeyboardEvent) { if (event.key === 'Escape') cancelSort() }
function beginSort(event: PointerEvent) {
  if (event.button !== 0 || props.readonly || props.disabled || !props.manual) return
  event.preventDefault()
  sortPointer = { id: event.pointerId, x: event.clientX, y: event.clientY, target: event.currentTarget as HTMLElement }
  sortPointer.target.setPointerCapture(event.pointerId)
  document.addEventListener('keydown', sortKey)
}
function moveSort(event: PointerEvent) {
  if (sortPointer?.id !== event.pointerId || sorting.value) return
  if (Math.hypot(event.clientX - sortPointer.x, event.clientY - sortPointer.y) >= 5) { sorting.value = true; emit('reorderStart') }
}
function endSort(event: PointerEvent) {
  if (sortPointer?.id !== event.pointerId) return
  moveSort(event)
  if (event.type === 'pointerup' && sorting.value && !props.readonly && !props.disabled && props.manual) {
    const targetId = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-todo-task-id]')?.dataset.todoTaskId
    if (targetId && targetId !== props.task.id) emit('reorderDrop', targetId)
  }
  cancelSort()
}
onUnmounted(cancelSort)
</script>
<template>
  <div class="desktop-todo-task border-b border-line py-2 last:border-0" :class="{ 'bg-surface-2': sorting }" :data-todo-task-id="task.id">
    <div class="flex items-start gap-1">
      <span v-if="readonly" class="flex h-11 w-9 shrink-0 items-center justify-center text-t3"><Check v-if="task.done" class="h-4 w-4" /><Circle v-else class="h-4 w-4" /></span>
      <button v-else class="desktop-todo-check flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-primary hover:bg-surface-2 disabled:opacity-50" :disabled="disabled" :aria-label="`${task.done ? '重新打开' : '完成'}：${task.title}`" @click="emit('done', task)"><Check v-if="task.done" class="h-5 w-5" /><Circle v-else class="h-5 w-5" /></button>
      <div class="min-w-0 flex-1 py-1">
        <p v-if="readonly" class="desktop-todo-task-title break-words text-sm text-t1" :class="{ 'line-through': task.done }">{{ task.title }}</p>
        <button v-else class="desktop-todo-task-title min-h-11 w-full break-words text-left text-sm text-t1 hover:text-primary" :class="{ 'line-through': task.done }" @click="emit('open')">{{ task.title }}</button>
        <p class="desktop-todo-task-meta mt-1 flex flex-wrap gap-x-2 text-xs text-t3"><span v-if="task.date">{{ task.date }} {{ task.time }}</span><span v-if="readonly">{{ task.done ? '已完成' : '未完成' }}</span><span v-else-if="task.priority && task.priority > 1" :class="task.priority === 3 ? 'text-danger' : 'text-warn'">{{ task.priority === 3 ? '高优先级' : '中优先级' }}</span><span v-if="task.focus && !readonly">今日重点</span></p>
        <button v-if="!readonly && task.subtasks?.length" class="desktop-todo-subtasks mt-1 flex min-h-11 items-center gap-1 text-xs text-t3" :aria-expanded="expanded" @click="expanded = !expanded"><ChevronDown v-if="expanded" class="h-3 w-3" /><ChevronRight v-else class="h-3 w-3" />子任务 {{ task.subtasks.filter(child => child.done).length }}/{{ task.subtasks.length }}</button>
      </div>
    </div>
    <div v-if="!readonly && manual" class="flex justify-end gap-1"><button class="ui-icon-button cursor-grab touch-none" :disabled="disabled" aria-label="拖动排序" @pointerdown="beginSort" @pointermove="moveSort" @pointerup="endSort" @pointercancel="endSort" @lostpointercapture="endSort"><GripVertical class="h-4 w-4" /></button><button class="ui-icon-button" :disabled="disabled" aria-label="上移任务" @click="emit('move', -1)"><ArrowUp class="h-4 w-4" /></button><button class="ui-icon-button" :disabled="disabled" aria-label="下移任务" @click="emit('move', 1)"><ArrowDown class="h-4 w-4" /></button></div>
    <div v-if="expanded && !readonly" class="ml-11">
      <label v-for="child in task.subtasks" :key="child.id" class="flex min-h-11 items-center gap-2 text-xs text-t2"><input type="checkbox" :checked="child.done" :disabled="disabled" @change="emit('subtask', child.id, ($event.target as HTMLInputElement).checked); ($event.target as HTMLInputElement).checked = child.done" /><span class="break-words">{{ child.title }}</span></label>
    </div>
  </div>
</template>
