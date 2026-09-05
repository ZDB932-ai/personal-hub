<script setup lang="ts">
import { reactive, watch } from 'vue'
import ModalShell from '@/components/ModalShell.vue'
import AppDatePicker from '@/components/AppDatePicker.vue'
import { profile } from '@/stores/profile'
import type { ProfileInfo } from '@/types'
import { emptyProfile } from '@/lib/utils'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const form = reactive<ProfileInfo>(emptyProfile())

watch(
  () => props.open,
  (open) => {
    if (open) Object.assign(form, emptyProfile(), profile)
  },
  { immediate: true },
)

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-t1 placeholder:text-t4 outline-none transition focus:border-primary/60 focus:bg-surface-2 focus:ring-2 focus:ring-primary/25'

function save() {
  Object.assign(profile, { ...form })
  emit('close')
}
</script>

<template>
  <ModalShell :open="open" @close="emit('close')">
    <h3 class="text-lg font-semibold">编辑个人资料</h3>
    <p class="mt-1 text-xs text-t4">修改后自动保存到本机浏览器</p>

    <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">昵称</span>
        <input v-model="form.nickname" :class="inputCls" placeholder="怎么称呼你" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">姓名</span>
        <input v-model="form.name" :class="inputCls" placeholder="真实姓名" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">生日</span>
        <AppDatePicker v-model="form.birthday" class="w-full" aria-label="选择生日" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">所在地</span>
        <input v-model="form.location" :class="inputCls" placeholder="如：上海" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">邮箱</span>
        <input v-model="form.email" :class="inputCls" placeholder="you@example.com" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">手机号</span>
        <input v-model="form.phone" :class="inputCls" placeholder="138xxxxxxxx" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">GitHub 主页</span>
        <input v-model="form.github" :class="inputCls" placeholder="https://github.com/xxx" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">个人网站</span>
        <input v-model="form.blog" :class="inputCls" placeholder="https://xxx.com" />
      </label>
      <label class="col-span-full block">
        <span class="mb-1.5 block text-xs font-medium text-t3">个人简介</span>
        <textarea
          v-model="form.bio"
          rows="3"
          :class="inputCls"
          placeholder="一句话介绍自己"
        ></textarea>
      </label>
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
