<script setup lang="ts">
import { ref } from 'vue'

const running = ref(false)
const reports = ref<string[]>([])
const error = ref('')

async function run(): Promise<void> {
  if (running.value) return
  running.value = true
  reports.value = []
  error.value = ''
  try {
    const { runSyncRehearsal } = await import('@/lib/syncRehearsal')
    reports.value = await runSyncRehearsal()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '演练未通过'
  } finally { running.value = false }
}
</script>

<template>
  <section class="mb-4 space-y-2 rounded-xl border border-line bg-surface p-4">
    <p class="text-sm font-medium text-t1">本机同步演练</p>
    <p class="text-xs leading-relaxed text-t3">使用三台虚拟设备和独立示例数据验证同步，不读取或修改你的保险库，也不连接网络。演练通过不代表已开启云同步。</p>
    <button :disabled="running" class="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-t1 disabled:opacity-50" @click="run">{{ running ? '正在演练…' : '运行同步演练' }}</button>
    <p v-if="error" role="alert" class="text-xs text-danger">{{ error }}</p>
    <ul v-if="reports.length" class="space-y-1 text-xs text-ok"><li v-for="report in reports" :key="report">✓ {{ report }}</li></ul>
  </section>
</template>
