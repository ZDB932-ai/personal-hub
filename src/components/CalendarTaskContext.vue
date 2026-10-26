<script setup lang="ts">
import { computed, ref } from 'vue'
import { Flag, Link2 } from '@lucide/vue'
import { taskPlans } from '@/lib/calendarConnections'
import { longPlans, weeklyPlans } from '@/stores/planning'
import { memos } from '@/stores/memos'
import { docMetas } from '@/stores/docs'
import { repos } from '@/stores/repos'
import { openHubItem } from '@/stores/hub'
import LongPlanModal from './LongPlanModal.vue'
import WeeklyPlanModal from './WeeklyPlanModal.vue'
import type { Task } from '@/types'
const props = defineProps<{ task: Task }>()
const context = computed(() => taskPlans(props.task, weeklyPlans.value, longPlans.value))
const sparks = computed(() => memos.value.filter(memo => memo.capturedFromTaskId === props.task.id))
const goalOpen = ref(false)
const weekOpen = ref(false)
const links = computed(() => (props.task.links ?? []).map(link => {
  const title = link.kind === 'memos' ? memos.value.find(memo => memo.id === link.id)?.title || (memos.value.some(memo => memo.id === link.id) ? '无标题便签' : undefined) : link.kind === 'docMetas' ? docMetas.value.find(doc => doc.id === link.id)?.name : repos.value.find(repo => repo.id === link.id)?.fullName
  return { ...link, title, label: { memos: '便签', docMetas: '资料', repos: '项目' }[link.kind] }
}))
</script>
<template>
  <div v-if="context.goal || task.weeklyPlanId || links.length || sparks.length" class="my-2 border-l border-primary/30 pl-3">
    <button v-if="context.goal" class="flex min-h-11 w-full items-center gap-2 text-left text-xs text-primary hover:underline" @click="goalOpen = true"><Flag class="h-3.5 w-3.5 shrink-0" /><span>朝向 · {{ context.goal.title }}</span></button>
    <button v-if="context.weekly" class="min-h-11 w-full text-left text-xs text-t3 hover:text-primary" @click="weekOpen = true">本周一步 · {{ context.weekly.title }}</button>
    <p v-if="task.weeklyPlanId && !context.weekly" class="py-2 text-xs text-t4">来源周计划已删除或尚未同步</p>
    <button v-for="link in links" :key="`${link.kind}:${link.id}`" :disabled="!link.title" class="flex min-h-11 w-full items-center gap-2 text-left text-xs text-info hover:underline disabled:text-t4" @click="openHubItem(link.kind, link.id)"><Link2 class="h-3.5 w-3.5 shrink-0" /><span class="truncate">{{ link.label }} · {{ link.title ?? '已删除或尚未同步' }}</span></button>
    <button v-for="memo in sparks" :key="memo.id" class="flex min-h-11 w-full items-center text-left text-xs text-primary hover:underline" @click="openHubItem('memos', memo.id)">灵感{{ memo.captureStatus === 'draft' ? '草稿' : '' }} · {{ memo.title || '未命名' }}</button>
  </div>
  <LongPlanModal v-if="context.goal" :open="goalOpen" :entry="context.goal" @close="goalOpen = false" />
  <WeeklyPlanModal v-if="context.weekly" :open="weekOpen" :entry="context.weekly" :week-start="context.weekly.weekStart" @close="weekOpen = false" />
</template>
