<script setup lang="ts">
import TaskResume from '@/components/TaskResume.vue'
import { computed, ref } from 'vue'
import { ChevronLeft, ChevronRight, Footprints } from '@lucide/vue'
import { tasks } from '@/stores/tasks'
import { openHubItem } from '@/stores/hub'
import { shiftYMD, toYMD, todayYMD, weekStartYMD } from '@/lib/utils'
import CalendarTaskContext from './CalendarTaskContext.vue'
const start = ref(weekStartYMD(todayYMD()))
const trail = computed(() => tasks.value.filter(task => task.done && task.doneAt && toYMD(new Date(task.doneAt)) >= start.value && toYMD(new Date(task.doneAt)) <= shiftYMD(start.value, 6)).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)))
</script>
<template>
  <section aria-label="成果回廊"><div class="flex flex-wrap items-center justify-between gap-3"><div><h2 class="text-xl font-medium text-t1">这一周，留下些什么</h2><p class="mt-2 text-sm text-t3">{{ start }} — {{ shiftYMD(start, 6) }} · {{ trail.length }} 项完成记录</p></div><div class="flex gap-2"><button class="ui-icon-button" aria-label="上一周成果" @click="start = shiftYMD(start, -7)"><ChevronLeft class="h-5 w-5" /></button><button class="ui-icon-button" aria-label="下一周成果" @click="start = shiftYMD(start, 7)"><ChevronRight class="h-5 w-5" /></button></div></div>
    <p class="mt-3 text-sm leading-6 text-t3">记录、资料和作品，连同当时的思考一起留下。没有附件的完成，也算一步。</p>
    <div class="attention-trail"><article v-for="task in trail" :key="task.id" class="attention-artifact"><p class="text-xs text-t3">{{ new Date(task.doneAt!).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }) }}</p><button class="my-2 min-h-11 break-words text-left text-lg font-medium text-t1 hover:text-primary" @click="openHubItem('tasks', task.id)">{{ task.title }}</button><p v-if="task.notes" class="line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6 text-t3">{{ task.notes }}</p><TaskResume :task="task" /><CalendarTaskContext :task="task" /><button class="min-h-11 text-xs text-primary" @click="openHubItem('tasks', task.id)">补充记录或关联成果</button></article></div>
    <div v-if="!trail.length" class="attention-empty"><Footprints class="h-7 w-7 text-primary" /><p class="mt-4 text-t2">这周还没有完成记录</p><p class="mt-2 text-sm text-t3">先开始一件事，成果会慢慢积累。</p></div>
  </section>
</template>
