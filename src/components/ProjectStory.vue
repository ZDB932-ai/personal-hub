<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { longPlans, weeklyPlans } from '@/stores/planning'
import { tasks } from '@/stores/tasks'
import { memos } from '@/stores/memos'
import { projectStory } from '@/lib/attentionJourney'
import { openHubItem } from '@/stores/hub'
import AppSelect from './AppSelect.vue'
import CalendarTaskContext from './CalendarTaskContext.vue'
const props = defineProps<{ goalId?: string }>()
const selected = ref(props.goalId || longPlans.value[0]?.id || '')
watch(() => props.goalId, value => { if (value) selected.value = value })
const goal = computed(() => longPlans.value.find(goal => goal.id === selected.value))
const story = computed(() => goal.value ? projectStory(goal.value, tasks.value, weeklyPlans.value, memos.value) : [])
</script>
<template>
  <section aria-label="项目进展记录"><h2 class="text-xl font-medium text-t1">项目进展</h2><p class="my-3 text-sm leading-6 text-t3">按时间查看目标、任务和进展记录，打开任务可查看关联资料。</p><AppSelect v-model="selected" :options="longPlans.map(goal => ({ value: goal.id, label: goal.title }))" aria-label="选择长期目标" placeholder="选择长期目标" />
    <ol class="mt-6 space-y-4"><li v-for="node in story" :key="node.key" class="rounded-xl border border-line bg-surface p-4"><p class="text-xs text-primary">{{ node.label }} · {{ new Date(node.time).toLocaleDateString('zh-CN') }}</p><button v-if="node.task || node.memo" class="my-2 min-h-11 break-words text-left text-base text-t1" @click="node.task ? openHubItem('tasks', node.task.id) : node.memo && openHubItem('memos', node.memo.id)">{{ node.title }}</button><p v-else class="my-3 whitespace-pre-wrap text-sm leading-7 text-t2">{{ node.title }}</p><p v-if="node.memo" class="line-clamp-3 whitespace-pre-wrap text-sm text-t3">{{ node.memo.content }}</p><CalendarTaskContext v-if="node.task" :task="node.task" /></li></ol><p v-if="!goal" class="mt-5 text-sm text-t3">先创建长期目标并关联任务，这里就会显示项目的推进记录。</p>
  </section>
</template>
