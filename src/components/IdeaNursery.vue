<script setup lang="ts">
import { computed, ref } from 'vue'
import { memos, updateMemo } from '@/stores/memos'
import { tasks } from '@/stores/tasks'
import { promoteSpark } from '@/stores/attention'
import { flushPendingSave } from '@/stores/database'
import { openHubItem } from '@/stores/hub'
import { toast } from '@/lib/toast'
import type { Memo } from '@/types'
import AppSelect from './AppSelect.vue'
import MemoOrigin from './MemoOrigin.vue'
const filter = ref('resting'), busy = ref(false)
const stages = [{ value: 'resting', label: '先放着' }, { value: 'try', label: '值得试试' }, { value: 'growing', label: '正在推进' }, { value: 'archived', label: '已归档' }]
const ideas = computed(() => memos.value.filter(memo => memo.ideaStage === filter.value).sort((a, b) => a.updatedAt - b.updatedAt))
async function stage(memo: Memo, value: string | number): Promise<void> {
  updateMemo(memo.id, { ideaStage: value as Memo['ideaStage'], captureStatus: 'kept' })
  try { await flushPendingSave() } catch { toast('状态尚未保存，请重试保存', 'error') }
}
async function start(memo: Memo): Promise<void> {
  busy.value = true
  try { const task = promoteSpark(memo.id); await flushPendingSave(); if (task) toast('已关联行动，可在正在推进中继续') }
  catch { toast('行动尚未保存，请重试', 'error') }
  finally { busy.value = false }
}
function actions(id: string) { return tasks.value.filter(task => task.links?.some(link => link.kind === 'memos' && link.id === id)) }
</script>
<template>
  <section class="mt-6" aria-label="灵感孵化架"><h2 class="text-lg font-medium text-t1">灵感孵化架</h2><p class="mt-2 text-sm leading-6 text-t3">让想法有一段生长的时间。每栏先看到最久没回看的灵感。</p>
    <div class="my-4 flex flex-wrap gap-2"><button v-for="item in stages" :key="item.value" class="filter-chip min-h-11" :class="{ 'is-active': filter === item.value }" :aria-pressed="filter === item.value" @click="filter = item.value">{{ item.label }}</button></div>
    <article v-for="memo in ideas" :key="memo.id" class="mb-4 rounded-xl border border-line bg-surface p-4"><button class="min-h-11 break-words text-left text-base text-t1" @click="openHubItem('memos', memo.id)">{{ memo.title || '未命名想法' }}</button><p class="my-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-t3">{{ memo.content }}</p><MemoOrigin :memo="memo" /><AppSelect :model-value="memo.ideaStage || 'resting'" :options="stages" aria-label="灵感阶段" @update:model-value="value => stage(memo, value)" /><RouterLink v-for="task in actions(memo.id)" :key="task.id" :to="{ path: '/focus', query: { task: task.id } }" class="mt-2 flex min-h-11 items-center text-xs text-primary">{{ task.done ? '回看成果' : '继续行动' }} · {{ task.title }} →</RouterLink><button v-if="!actions(memo.id).length && memo.ideaStage !== 'archived'" class="mt-2 min-h-11 text-sm text-primary" :disabled="busy" @click="start(memo)">试一个 15 分钟的小行动</button></article>
    <p v-if="!ideas.length" class="rounded-xl border border-dashed border-line p-5 text-sm text-t3">这一栏还没有想法。可以从口袋中选择「放入孵化架」。</p>
  </section>
</template>
