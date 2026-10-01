<script setup lang="ts">
import { Check, Play, Star } from '@lucide/vue'
import type { Task } from '@/types'
import { todayYMD } from '@/lib/utils'
defineProps<{ items: Task[]; busy?: boolean; day?: string }>()
defineEmits<{ toggle: [task: Task]; edit: [task: Task] }>()
</script>
<template>
  <ul class="today-task-list">
    <li v-for="task in items" :key="task.id" class="today-task-row">
      <button class="today-task-check" :disabled="busy" :aria-label="`${task.done ? '取消完成' : '完成'}：${task.title}`" :aria-pressed="task.done" @click="$emit('toggle', task)"><span :class="{ 'is-done': task.done }"><Check v-if="task.done" class="h-3 w-3" /></span></button>
      <button class="today-task-content" @click="$emit('edit', task)"><span class="today-task-title" :class="{ 'line-through text-t3': task.done }">{{ task.title }}</span><span class="today-task-meta"><span v-if="task.focusDate === (day || todayYMD())" class="inline-flex items-center gap-1 text-primary"><Star class="h-3 w-3" />重点</span><span v-if="task.priority === 3" class="text-danger">高优先级</span><span v-if="task.time">{{ task.time }}</span><span v-if="task.estimatedMinutes">预计 {{ task.estimatedMinutes }} 分钟</span><span v-if="task.subtasks.length">子任务 {{ task.subtasks.filter(item => item.done).length }}/{{ task.subtasks.length }}</span></span></button>
      <RouterLink v-if="!task.done" :to="{ path: '/focus', query: { task: task.id, from: '/' } }" class="today-task-start" :aria-label="`开始：${task.title}`"><Play class="h-4 w-4" /><span>开始</span></RouterLink>
    </li>
  </ul>
</template>
