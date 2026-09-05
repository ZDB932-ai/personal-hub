<script setup lang="ts">
import { Trash2, X } from '@lucide/vue'
import ModalShell from '@/components/ModalShell.vue'

defineProps<{
  open: boolean
  title: string
  heading?: string
  description?: string
  confirmLabel?: string
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
          <h3 class="mt-1 text-lg font-semibold text-t1">{{ heading ?? '移除资源' }}</h3>
        </div>
      </div>
      <button aria-label="关闭" class="ui-icon-button" @click="emit('close')">
        <X class="h-5 w-5" />
      </button>
    </div>
    <div class="mt-5 rounded-lg border border-line bg-inset p-3.5">
      <p class="text-sm font-medium text-t1">{{ title }}</p>
      <p class="mt-2 text-xs leading-relaxed text-t3">{{ description ?? '这会从个人资源库移除这条记录，不会改动已经存在的 Agent 配置或会话内容。' }}</p>
    </div>
    <div class="mt-6 flex justify-end gap-3">
      <button class="ui-secondary-button" @click="emit('close')">取消</button>
      <button class="ui-danger-button gap-2" @click="emit('confirm')">
        <Trash2 class="h-4 w-4" />
        {{ confirmLabel ?? '确认移除' }}
      </button>
    </div>
  </ModalShell>
</template>
