<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import ModalShell from '@/components/ModalShell.vue'
import { X } from '@lucide/vue'
import { addMemo, MEMO_COLORS, updateMemo } from '@/stores/memos'
import type { Memo } from '@/types'

const props = defineProps<{
  open: boolean
  entry: Memo | null
}>()

const emit = defineEmits<{
  close: []
}>()

const form = reactive({
  title: '',
  content: '',
  color: 'indigo',
  pinned: false,
})
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    if (props.entry) {
      Object.assign(form, {
        title: props.entry.title,
        content: props.entry.content,
        color: props.entry.color,
        pinned: props.entry.pinned,
      })
    } else {
      Object.assign(form, { title: '', content: '', color: 'indigo', pinned: false })
    }
  },
  { immediate: true },
)

function save() {
  if (!form.content.trim() && !form.title.trim()) {
    error.value = '内容和标题至少填一项'
    return
  }
  if (props.entry) {
    updateMemo(props.entry.id, { ...form })
  } else {
    addMemo({ ...form })
  }
  emit('close')
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-t1 placeholder:text-t4 outline-none transition focus:border-primary/60 focus:bg-surface-2 focus:ring-2 focus:ring-primary/25'
</script>

<template>
  <ModalShell :open="open" @close="emit('close')">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold">{{ entry ? '编辑便签' : '新建便签' }}</h3>
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
        <span class="mb-1.5 block text-xs font-medium text-t3">标题</span>
        <input v-model="form.title" :class="inputCls" placeholder="一句话主题（选填）" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">内容</span>
        <textarea v-model="form.content" rows="7" :class="inputCls" placeholder="随手记点什么…"></textarea>
      </label>
      <div class="flex items-center gap-3">
        <span class="text-xs font-medium text-t3">颜色</span>
        <button
          v-for="c in MEMO_COLORS"
          :key="c.key"
          type="button"
          class="h-6 w-6 rounded-lg border transition"
          :aria-label="`选择${c.label}便签色`"
          :aria-pressed="form.color === c.key"
          :class="[c.card, form.color === c.key ? 'ring-2 ring-primary/60' : 'opacity-60 hover:opacity-100']"
          @click="form.color = c.key"
        ></button>
        <label class="ml-auto flex cursor-pointer items-center gap-2 text-xs text-t3">
          <input v-model="form.pinned" type="checkbox" class="accent-primary" />
          置顶
        </label>
      </div>
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
        {{ entry ? '保存修改' : '创建便签' }}
      </button>
    </div>
  </ModalShell>
</template>
