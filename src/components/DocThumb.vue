<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { DocMeta } from '@/types'
import { openDocObjectUrl } from '@/stores/docs'

const props = defineProps<{
  meta: DocMeta
}>()

const url = ref('')
const failed = ref(false)
let disposed = false

onMounted(async () => {
  try {
    const value = await openDocObjectUrl(props.meta, false)
    if (disposed) URL.revokeObjectURL(value)
    else url.value = value
  } catch {
    failed.value = true
  }
})

onBeforeUnmount(() => {
  disposed = true
  if (url.value) URL.revokeObjectURL(url.value)
})
</script>

<template>
  <img
    v-if="url"
    :src="url"
    :alt="meta.name"
    class="h-full w-full object-cover"
    loading="lazy"
  />
  <div
    v-else-if="failed"
    class="flex h-full w-full items-center justify-center bg-surface-2 p-1 text-center text-[10px] leading-tight text-t4"
  >
    无法预览
  </div>
  <div v-else class="skeleton h-full w-full"></div>
</template>
