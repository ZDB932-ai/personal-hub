<script setup lang="ts">
import { computed, ref } from 'vue'
import { tasks } from '@/stores/tasks'
import { memos, addMemo, updateMemo } from '@/stores/memos'
import { dayCapacity, dayLoad } from '@/stores/planning'
import { flushPendingSave } from '@/stores/database'
import { shiftYMD, todayYMD, toYMD } from '@/lib/utils'
import { taskMinutesOnDate } from '@/lib/attention'
import { closeDay } from '@/stores/attention'
import { toast } from '@/lib/toast'
import CalendarTaskContext from './CalendarTaskContext.vue'
const day = todayYMD(), tomorrow = shiftYMD(day, 1)
const record = computed(() => memos.value.find(memo => memo.closingDate === day))
const selected = ref<string[]>([]), busy = ref(false)
const note = computed({ get: () => record.value?.openingNote || '', set: value => {
  if (record.value) updateMemo(record.value.id, { openingNote: value })
  else addMemo({ title: `${day} · 一天收尾`, content: '', openingNote: value, closingDate: day, color: 'emerald', pinned: false })
} })
const done = computed(() => tasks.value.filter(task => task.done && task.doneAt && toYMD(new Date(task.doneAt)) === day))
const pending = computed(() => tasks.value.filter(task => !task.done && task.date === day))
const projected = computed(() => dayLoad(tomorrow) + pending.value.filter(task => selected.value.includes(task.id)).reduce((sum, task) => sum + (task.estimatedMinutes || 30) - taskMinutesOnDate(task, tomorrow), 0))
async function save(): Promise<void> {
  busy.value = true
  try {
    closeDay(day, note.value, selected.value)
    await flushPendingSave(); selected.value = []; toast('今天已收好，明天有一个清楚的开始')
  } catch { toast('收尾尚未保存，请重试', 'error') }
  finally { busy.value = false }
}
</script>
<template>
  <section aria-label="一天收尾"><h2 class="text-xl font-medium text-t1">把今天收好，把明天留轻一点</h2><p class="my-3 text-sm text-t3">{{ day }} · 留下 {{ done.length }} 项完成记录</p><article v-for="task in done" :key="task.id" class="my-3 rounded-xl border border-line p-4"><p class="text-sm text-t1">{{ task.title }}</p><CalendarTaskContext :task="task" /></article>
    <label class="my-5 block text-sm text-t2">给明天的一句话<textarea v-model="note" maxlength="2000" rows="3" class="control-input mt-2 px-3 py-2" placeholder="明天从哪一小步开始？"></textarea></label>
    <details class="mb-4"><summary class="min-h-11 cursor-pointer text-sm text-primary">今天未完成 · {{ pending.length }} 项，自选是否移到明天</summary><p class="my-2 text-xs leading-6 text-t3">只移动勾选项，并清除原开始时间，留待重新安排；不勾选则保留原日期。</p><label v-for="task in pending" :key="task.id" class="flex min-h-11 items-center gap-3 text-sm text-t2"><input v-model="selected" type="checkbox" :value="task.id" />{{ task.title }}</label><p class="my-3 text-xs" :class="projected > dayCapacity(tomorrow) ? 'text-warn' : 'text-t3'">明天预计 {{ projected }} / 可用 {{ dayCapacity(tomorrow) }} 分钟{{ projected > dayCapacity(tomorrow) ? '，已超出，可减少勾选。' : '' }}</p></details>
    <button class="ui-primary-button" :disabled="busy" @click="save">{{ busy ? '正在保存…' : '保存收尾与所选安排' }}</button><p class="mt-3 text-xs text-t3">收尾保存在备忘录，明天的一句话也会出现在首页。</p>
  </section>
</template>
