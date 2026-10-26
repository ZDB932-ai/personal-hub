<script setup lang="ts">
import { Trash2, X } from '@lucide/vue'
import ModalShell from '@/components/ModalShell.vue'

defineProps<{
  open: boolean
  title: string
  kind: string
  linkedTaskCount?: number
  linkedDoneCount?: number
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()
</script>

<template>
  <ModalShell :open="open" max-width="max-w-md" @close="emit('close')">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-danger/10 text-danger">
          <Trash2 class="h-4 w-4" />
        </span>
        <div>
          <p class="text-xs font-medium text-danger">删除确认</p>
          <h3 class="mt-1 text-lg font-semibold text-t1">删除{{ kind }}</h3>
        </div>
      </div>
      <button aria-label="关闭" class="ui-icon-button" @click="emit('close')">
        <X class="h-5 w-5" />
      </button>
    </div>
    <div class="mt-5 rounded-lg border border-line bg-inset p-3.5">
      <p class="text-sm font-medium text-t1">{{ title }}</p>
      <p v-if="kind === '周计划'" class="mt-2 text-xs leading-relaxed text-t3">
        关联的 {{ linkedTaskCount ?? 0 }} 项任务会一并删除<span v-if="linkedDoneCount">，其中 {{ linkedDoneCount }} 项已完成</span>。其他任务不受影响，删除后可立即撤回。
      </p>
      <p v-else class="mt-2 text-xs leading-relaxed text-t3">已关联的周计划和每日任务会保留，只是不再关联这项{{ kind }}。这个操作不会删除任务。</p>
    </div>
    <div class="mt-6 flex justify-end gap-3">
      <button class="ui-secondary-button" @click="emit('close')">取消</button>
      <button class="ui-danger-button gap-2" @click="emit('confirm')">
        <Trash2 class="h-4 w-4" />
        {{ kind === '周计划' ? '撤销本周安排' : '确认删除' }}
      </button>
    </div>
  </ModalShell>
</template>
