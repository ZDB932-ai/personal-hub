<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Task } from '@/types'
import { updateTask } from '@/stores/tasks'
import { flushPendingSave } from '@/stores/database'
import { openHubItem } from '@/stores/hub'
import TaskLinks from './TaskLinks.vue'
import { toast } from '@/lib/toast'
const props = defineProps<{ task: Task }>()
const busy = ref(false)
const links = computed({ get: () => props.task.links ?? [], set: value => updateTask(props.task.id, { links: value }) })
async function save(): Promise<void> {
  busy.value = true
  try { updateTask(props.task.id, { sceneSavedAt: Date.now(), sceneExpanded: true }); await flushPendingSave(); toast('现场书签已保存，下次回来会展开手边资料') }
  catch { toast('现场尚未保存，请重试', 'error') }
  finally { busy.value = false }
}
</script>
<template>
  <section class="my-6 rounded-xl border border-line bg-surface p-4" aria-label="任务现场书签">
    <div class="flex flex-wrap items-center justify-between gap-3"><h2 class="text-sm font-medium text-t1">任务现场书签</h2><button class="ui-secondary-button" :disabled="busy" @click="save">{{ busy ? '正在保存…' : '保存现场书签' }}</button></div>
    <p class="my-3 text-xs leading-6 text-t3">继续线索和手边资料放在一起；保存后，下次打开这件事即可接着做。</p>
    <details :open="task.sceneExpanded" @toggle="updateTask(task.id, { sceneExpanded: ($event.target as HTMLDetailsElement).open })"><summary class="min-h-11 cursor-pointer text-sm text-primary">手边资料 · {{ links.length }} 项</summary><TaskLinks v-model="links" @open="link => openHubItem(link.kind, link.id)" /></details>
  </section>
</template>
