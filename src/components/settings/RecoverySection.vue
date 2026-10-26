<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { recoveryItems } from '@/stores/recovery'
import { clearRecovery, restoreRecovery, databaseBusy } from '@/stores/database'
import { confirmAction } from '@/lib/confirmAction'
import { toast } from '@/lib/toast'
import type { RecoveryItem } from '@/lib/recovery'

const props = defineProps<{ open: boolean }>()
const filter = ref('deleted')
const expanded = ref('')
const busy = ref(false)
const labels: Record<string, string> = { tasks: '任务', memos: '备忘录', entries: '账号', docMetas: '资料', repos: '项目', weeklyPlans: '周计划', longPlans: '长期目标', agentResources: 'Agent 资源' }
const items = computed(() => recoveryItems.value.filter(item => filter.value === 'all' || item.reason === filter.value).sort((a, b) => b.savedAt - a.savedAt))
watch(() => props.open, () => { expanded.value = '' })
function title(item: RecoveryItem): string { return String(item.value.title || item.value.name || item.value.fullName || '未命名条目') }
async function restore(item: RecoveryItem) {
  if (!await confirmAction(`将「${title(item)}」恢复为新副本，当前条目保持原样。继续吗？`)) return
  busy.value = true
  try { await restoreRecovery(item.id); toast('已恢复副本，可回到对应页面查看') }
  catch (error) { toast(error instanceof Error ? error.message : '恢复失败', 'error') }
  finally { busy.value = false }
}
async function clear() {
  if (!await confirmAction('清空本机全部回收与历史记录？此操作无法撤销，当前条目和已导出的备份保留。')) return
  busy.value = true
  try { await clearRecovery(); toast('本机恢复记录已清空') }
  catch (error) { toast(error instanceof Error ? error.message : '清空失败', 'error') }
  finally { busy.value = false }
}
</script>

<template>
  <section class="settings-card space-y-3">
    <h3 class="settings-section-title">回收站与历史版本</h3>
    <p class="settings-description">查找此设备最近 30 天内保存的删除记录和修改历史。恢复时生成一个副本，当前内容保持原样。</p>
    <details class="settings-disclosure"><summary class="text-sm text-t2">保留范围与恢复规则</summary><div class="settings-disclosure-body space-y-2"><p class="settings-description">删除记录最多 200 条、2 MiB；修改历史最多 100 条、1 MiB，每项最多 20 个版本。达到上限时较早记录会被清理。历史记录随保险库加密保存，不参与逐条同步；备份和设备迁移文件会包含这些记录。</p><p class="settings-description">恢复的副本会正常同步。资料删除后保留附件以便恢复，不自动清理文件缓存。任务恢复后不会重复排期；周计划的子任务需要分别恢复。未保存的修改、灵感草稿不产生历史；继续线索在 5 分钟内的连续修改合并为一个版本。</p></div></details>
    <div class="settings-actions flex flex-wrap gap-2" role="group" aria-label="恢复记录类型"><button class="filter-chip min-h-11" :aria-pressed="filter === 'deleted'" :class="{ 'is-active': filter === 'deleted' }" @click="filter = 'deleted'">已删除</button><button class="filter-chip min-h-11" :aria-pressed="filter === 'changed'" :class="{ 'is-active': filter === 'changed' }" @click="filter = 'changed'">修改历史</button><button class="filter-chip min-h-11" :aria-pressed="filter === 'all'" :class="{ 'is-active': filter === 'all' }" @click="filter = 'all'">全部</button></div>
    <p v-if="!items.length" class="settings-note py-3 text-sm text-t3">{{ filter === 'deleted' ? '暂无可恢复的删除记录。' : filter === 'changed' ? '暂无可恢复的修改历史。' : '暂无恢复记录。' }}</p>
    <article v-for="item in items" :key="item.id" class="space-y-2 rounded-lg border border-line p-3">
      <p class="truncate text-sm text-t1">{{ title(item) }}</p><p class="text-xs text-t3">{{ labels[item.kind] }} · {{ new Date(item.savedAt).toLocaleString('zh-CN') }} · {{ item.reason === 'deleted' ? '删除前' : '修改前' }}</p>
      <button class="ui-secondary-button text-xs" :aria-expanded="expanded === item.id" @click="expanded = expanded === item.id ? '' : item.id">{{ expanded === item.id ? '隐藏内容' : '查看历史内容（含敏感信息）' }}</button>
      <pre v-if="expanded === item.id" class="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-inset p-3 text-xs text-t2">{{ JSON.stringify(item.value, null, 2) }}</pre>
      <button :disabled="busy || databaseBusy" class="ui-secondary-button min-h-11 w-full disabled:opacity-40" @click="restore(item)">恢复为副本</button>
    </article>
    <div v-if="recoveryItems.length" class="settings-subsection space-y-3"><p class="settings-description">清空后无法再从此处恢复。当前条目和已导出的备份保留。</p><button :disabled="busy || databaseBusy" class="ui-danger-button min-h-11 disabled:opacity-40" @click="clear">清空本机恢复记录</button></div>
  </section>
</template>
