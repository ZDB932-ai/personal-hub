<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { confirmAction } from '@/lib/confirmAction'
import { tasks } from '@/stores/tasks'
import type { Memo } from '@/types'
const props = defineProps<{ memo: Memo; confirmLeave?: boolean }>()
const emit = defineEmits<{ navigate: [] }>()
const router = useRouter()
const source = computed(() => tasks.value.find(task => task.id === props.memo.capturedFromTaskId))
async function go(): Promise<void> {
  if (!source.value) return
  if (props.confirmLeave && !await confirmAction('打开来源任务会关闭便签编辑，未保存的修改将丢弃。继续吗？')) return
  const failure = await router.push({ path: '/focus', query: { task: source.value.id } })
  if (!failure) emit('navigate')
}
</script>
<template>
  <div v-if="memo.capturedFromTaskId" class="my-3 text-xs text-t3">
    <a v-if="source" :href="router.resolve({ path: '/focus', query: { task: source.id } }).href" class="flex min-h-11 items-center text-primary hover:underline" @click.prevent="go">产生于 · {{ source.title }} →</a>
    <p v-else>来源任务已删除或尚未同步，灵感仍保留。</p>
  </div>
</template>
