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
    error.value = e instanceof Error ? e.message : '自检未通过'
  } finally { running.value = false }
}
</script>

<template>
  <section class="space-y-3">
    <h4 class="settings-section-title">同步功能自检</h4>
    <p class="settings-description">使用独立示例数据在本机检查同步与合并流程，不读取个人内容，也不访问网络。结果用于排查本机功能，不代表云服务连接正常。</p>
    <button :disabled="running" class="ui-secondary-button disabled:opacity-50" @click="run">{{ running ? '正在检查…' : '运行离线自检' }}</button>
    <p v-if="error" role="alert" class="text-xs text-danger">{{ error }}</p>
    <ul v-if="reports.length" role="status" class="space-y-1 text-xs text-ok"><li v-for="report in reports" :key="report">✓ {{ report }}</li></ul>
  </section>
</template>
