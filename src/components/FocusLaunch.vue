<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { ArrowRight, Bookmark } from '@lucide/vue'
import { tasks } from '@/stores/tasks'
import { longPlans, weeklyPlans } from '@/stores/planning'
import { focusCandidates } from '@/lib/attention'
import { taskPlans } from '@/lib/calendarConnections'
import { memos } from '@/stores/memos'
import { shiftYMD, todayYMD } from '@/lib/utils'
const day = ref(todayYMD())
const timer = setInterval(() => { day.value = todayYMD() }, 60000)
onUnmounted(() => clearInterval(timer))
const opening = computed(() => memos.value.find(memo => memo.closingDate === shiftYMD(day.value, -1))?.openingNote)
const next = computed(() => focusCandidates(tasks.value, day.value).sort((a, b) => (b.sceneSavedAt ?? 0) - (a.sceneSavedAt ?? 0)).find(task => {
  const goal = taskPlans(task, weeklyPlans.value, longPlans.value).goal
  return !goal || (goal.status === 'active' && (!goal.deferredUntil || goal.deferredUntil <= day.value))
}))
</script>
<template>
  <section class="focus-launch" aria-label="从这里继续">
    <div class="min-w-0"><p v-if="opening" class="mb-3 text-sm text-primary">昨天留给今天：{{ opening }}</p><p class="flex items-center gap-2 text-xs font-medium text-primary"><Bookmark class="h-4 w-4" />{{ next?.resumeUpdatedAt ? '上次留下的线索，还在这里' : '给此刻一个清楚的开始' }}</p><h2 class="mt-3 break-words text-xl font-medium text-t1">{{ next?.title || '此刻，只选一件事' }}</h2><p class="mt-2 line-clamp-2 text-sm leading-6 text-t3">{{ next?.resumeNextStep || next?.resumeNote || '带上需要的资料开始，其他想法可以先记在收集箱。' }}</p></div>
    <div class="flex shrink-0 flex-col gap-2"><RouterLink :to="next ? { path: '/focus', query: { task: next.id } } : '/focus'" class="ui-primary-button gap-2">{{ next?.resumeUpdatedAt ? '从这里继续' : '开始一件事' }}<ArrowRight class="h-4 w-4" /></RouterLink><RouterLink v-if="next" to="/focus" class="flex min-h-11 items-center justify-center text-xs text-t3 hover:text-primary">自己挑选</RouterLink><RouterLink to="/focus?tab=closing" class="flex min-h-11 items-center justify-center text-xs text-primary">收好今天 →</RouterLink></div>
  </section>
</template>
<style scoped>
.focus-launch { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-top: 24px; padding: 24px; background: var(--tk-surface); border: 1px solid var(--tk-line); border-left: 3px solid var(--tk-primary); border-radius: 12px; }
@media (max-width: 639px) { .focus-launch { align-items: stretch; flex-direction: column; gap: 16px; padding: 20px; } }
</style>
