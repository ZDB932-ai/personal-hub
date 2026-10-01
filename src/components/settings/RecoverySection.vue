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
const labels: Record<string, string> = { tasks: '任务', memos: '备忘录', entries: '账号', docMetas: '资料', repos: '仓库', weeklyPlans: '周计划', longPlans: '长期方向', agentResources: '资源' }
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
  <section class="mt-5 space-y-3 border-t border-line pt-5">
    <h4 class="text-sm font-semibold text-t1">回收站与历史版本</h4>
    <p class="text-xs leading-relaxed text-t3">记录本机已保存条目的删除和修改，随保险库加密保存；保留最近 30 天；删除记录限 200 条、2 MiB；修改历史另限 100 条、1 MiB，互不挤占。每项最多保留 20 个修改版本。本机记录不参与逐条同步，备份与设备加入文件会包含记录。恢复副本会正常同步。</p>
    <p class="text-xs leading-relaxed text-t3">资料删除后保留附件以便恢复，暂不自动清理文件缓存。任务恢复后不重复排期；周计划恢复不自动还原其子任务，可分别恢复。未保存过的瞬时修改不形成历史；继续线索的 5 分钟内连续编辑合并为一个版本，灵感草稿不制造修改历史。</p>
    <div class="flex flex-wrap gap-2"><button class="filter-chip min-h-11" :class="{ 'is-active': filter === 'deleted' }" @click="filter = 'deleted'">已删除</button><button class="filter-chip min-h-11" :class="{ 'is-active': filter === 'changed' }" @click="filter = 'changed'">修改历史</button><button class="filter-chip min-h-11" :class="{ 'is-active': filter === 'all' }" @click="filter = 'all'">全部</button></div>
    <p v-if="!items.length" class="py-3 text-xs text-t4">暂无恢复记录。此功能启用前的历史不会补录。</p>
    <article v-for="item in items" :key="item.id" class="space-y-2 rounded-lg border border-line p-3">
      <p class="truncate text-sm text-t1">{{ title(item) }}</p><p class="text-xs text-t3">{{ labels[item.kind] }} · {{ new Date(item.savedAt).toLocaleString('zh-CN') }} · {{ item.reason === 'deleted' ? '删除前' : '修改前' }}</p>
      <button class="min-h-11 text-xs text-primary" @click="expanded = expanded === item.id ? '' : item.id">{{ expanded === item.id ? '隐藏内容' : '查看历史内容（可能包含敏感信息）' }}</button>
      <pre v-if="expanded === item.id" class="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-inset p-3 text-xs text-t2">{{ JSON.stringify(item.value, null, 2) }}</pre>
      <button :disabled="busy || databaseBusy" class="ui-secondary-button min-h-11 w-full disabled:opacity-40" @click="restore(item)">恢复为副本</button>
    </article>
    <button v-if="recoveryItems.length" :disabled="busy || databaseBusy" class="ui-danger-button min-h-11 disabled:opacity-40" @click="clear">清空本机恢复记录</button>
  </section>
</template>
