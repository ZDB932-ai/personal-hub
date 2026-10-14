<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { Plus } from '@lucide/vue'
import { addTask } from '@/stores/tasks'
import { flushPendingSave } from '@/stores/database'

const props = defineProps<{ date: string }>()
const title = ref('')
const field = ref<HTMLInputElement | null>(null)
const saving = ref(false)
const pendingId = ref('')
const error = ref(false)
const status = ref('')

async function submit(): Promise<void> {
  if (saving.value || (!pendingId.value && !title.value.trim())) return
  saving.value = true
  status.value = ''
  if (!pendingId.value) pendingId.value = addTask({ title: title.value.trim(), date: props.date, time: '', notes: '', priority: 2, repeat: 'none' }).id
  try {
    await flushPendingSave()
    pendingId.value = ''
    title.value = ''
    error.value = false
    status.value = '已添加到今天'
  } catch { error.value = true }
  finally { saving.value = false; await nextTick(); field.value?.focus() }
}
</script>

<template>
  <form class="today-quick-add" aria-label="快速添加今日任务" @submit.prevent="submit">
    <div class="today-quick-input">
      <Plus class="h-4 w-4 shrink-0 text-t3" aria-hidden="true" />
      <input ref="field" v-model="title" maxlength="200" aria-label="添加到今天" placeholder="添加到今天…" :disabled="saving || Boolean(pendingId)" @input="status = ''" @keydown.enter="$event.isComposing && $event.preventDefault()" />
      <button class="ui-ghost-button shrink-0 text-xs" :disabled="saving || (!pendingId && !title.trim())">{{ saving ? '保存中…' : pendingId ? '重试保存' : '添加' }}</button>
    </div>
    <p v-if="error" role="alert" class="mt-2 text-xs leading-6 text-danger">尚未保存，请重试。重试不会重复创建任务。</p>
    <p v-else class="today-quick-status" :class="{ 'is-hint': !status }" role="status">{{ status || '回车添加 · 日期、提醒等可在新建任务中设置' }}</p>
  </form>
</template>
