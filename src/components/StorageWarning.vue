<script setup lang="ts">
import { ref } from 'vue'
import { storageError } from '@/stores/database'
import { exportBackup } from '@/lib/backup'
import { toast } from '@/lib/toast'

const exporting = ref(false)

async function saveCopy(): Promise<void> {
  exporting.value = true
  try {
    toast(await exportBackup(true))
  } catch (error) {
    toast(error instanceof Error ? error.message : '备份导出失败', 'error')
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div v-if="storageError" role="alert" class="fixed inset-x-4 bottom-20 z-[100] mx-auto max-w-xl rounded-xl border border-warn/40 bg-surface p-4 text-sm text-t1">
    <p class="font-medium text-warn">本窗口有未保存的数据</p>
    <p class="mt-2 text-xs leading-relaxed text-t2">{{ storageError }}</p>
    <button :disabled="exporting" class="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-t1 disabled:opacity-50" @click="saveCopy">
      {{ exporting ? '正在导出…' : '导出本窗口备份' }}
    </button>
  </div>
</template>
