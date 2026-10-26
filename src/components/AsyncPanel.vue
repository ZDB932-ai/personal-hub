<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef, type Component } from 'vue'
import { confirmAction } from '@/lib/confirmAction'

const props = defineProps<{
  loader: () => Promise<{ default: Component }>
  label: string
  open: boolean
  initialCategory?: string
}>()
const content = shallowRef<Component>()
const failed = ref(false)
const loading = ref(false)
let disposed = false
let timer: ReturnType<typeof setTimeout> | undefined
const confirming = ref(false)

async function reload() {
  confirming.value = true
  try {
    if (await confirmAction('重新加载会丢弃尚未保存的编辑，并需要重新解锁。已保存的数据会保留。确认重新加载？')) location.reload()
  } finally {
    confirming.value = false
  }
}

async function load() {
  failed.value = false
  loading.value = false
  timer = setTimeout(() => { loading.value = true }, 200)
  try {
    const module = await props.loader()
    if (!disposed) content.value = module.default
  } catch {
    if (!disposed) failed.value = true
  } finally {
    clearTimeout(timer)
    if (!disposed) loading.value = false
  }
}

onMounted(load)
onUnmounted(() => { disposed = true; clearTimeout(timer) })
</script>

<template>
  <component :is="content" v-if="content" :open="open" v-bind="initialCategory ? { initialCategory } : {}" />
  <div v-else-if="failed" role="alert" class="rounded-xl border border-line bg-inset p-5">
    <p class="text-sm text-t1">{{ label }}暂时无法加载</p>
    <p class="mt-2 text-xs text-t3">请检查网络连接，保存其他编辑内容后重新加载应用。</p>
    <button class="ui-secondary-button mt-4 min-h-11" :disabled="confirming" @click="reload">重新加载应用</button>
  </div>
  <div v-else class="min-h-24" :aria-busy="true">
    <p v-if="loading" role="status" class="py-5 text-sm text-t3">正在加载{{ label }}…</p>
  </div>
</template>
