<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import ModalShell from '@/components/ModalShell.vue'
import AppSelect from '@/components/AppSelect.vue'
import { X } from '@lucide/vue'
import { DOC_CATEGORIES, updateDocMeta } from '@/stores/docs'
import { toast } from '@/lib/toast'
import type { DocMeta } from '@/types'

const props = defineProps<{
  open: boolean
  meta: DocMeta | null
}>()

const emit = defineEmits<{
  close: []
}>()

const form = reactive({
  name: '',
  category: '其他',
  tagsText: '',
  note: '',
  pinned: false,
})
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open || !props.meta) return
    error.value = ''
    Object.assign(form, {
      name: props.meta.name,
      category: props.meta.category,
      tagsText: props.meta.tags.join(', '),
      note: props.meta.note,
      pinned: props.meta.pinned,
    })
  },
  { immediate: true },
)

function save() {
  if (!props.meta) return
  if (!form.name.trim()) {
    error.value = '文件名称不能为空'
    return
  }
  const tags = form.tagsText
    .split(/[,，、\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8)
  updateDocMeta(props.meta.id, {
    name: form.name.trim(),
    category: form.category,
    tags,
    note: form.note.trim(),
    pinned: form.pinned,
  })
  toast('资料信息已更新')
  emit('close')
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-t1 placeholder:text-t4 outline-none transition focus:border-primary/60 focus:bg-surface-2 focus:ring-2 focus:ring-primary/25'
</script>

<template>
  <ModalShell :open="open" @close="emit('close')">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold">编辑资料信息</h3>
      <button
        aria-label="关闭"
        class="rounded-lg p-1.5 text-t4 transition hover:bg-surface hover:text-t2"
        @click="emit('close')"
      >
        <X class="h-5 w-5" />
      </button>
    </div>

    <div class="mt-5 space-y-4">
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">名称</span>
        <input v-model="form.name" :class="inputCls" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">分类</span>
        <AppSelect
          v-model="form.category"
          :options="DOC_CATEGORIES.filter((x) => x !== '全部').map((c) => ({ value: c, label: c }))"
        />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">标签（逗号分隔，最多 8 个）</span>
        <input v-model="form.tagsText" :class="inputCls" placeholder="如：身份证, 正本, 2026" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">备注（可放证件号等关键信息，列表中可一键复制）</span>
        <textarea v-model="form.note" rows="3" :class="inputCls" placeholder="选填"></textarea>
      </label>
      <label class="flex cursor-pointer items-center gap-2 text-xs text-t3">
        <input v-model="form.pinned" type="checkbox" class="accent-primary" />
        收藏置顶
      </label>

      <p v-if="error" class="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
        {{ error }}
      </p>
    </div>

    <div class="mt-6 flex justify-end gap-3">
      <button
        class="rounded-lg px-4 py-2.5 text-sm font-medium text-t3 transition hover:bg-surface hover:text-t2"
        @click="emit('close')"
      >
        取消
      </button>
      <button
        class="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-primary-strong"
        @click="save"
      >
        保存
      </button>
    </div>
  </ModalShell>
</template>
