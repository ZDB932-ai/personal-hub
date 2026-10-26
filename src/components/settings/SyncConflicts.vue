<script setup lang="ts">
import { confirmAction } from '@/lib/confirmAction'
import { ref, watch } from 'vue'
import { offlineConflicts } from '@/stores/offline'
import { chooseSyncConflict } from '@/lib/recordSync'
import type { OfflineJournal } from '@/lib/offlineJournal'
import { isGated } from '@/stores/lock'

const props = defineProps<{ open: boolean }>()
const expanded = ref('')
const busy = ref(false)
const error = ref('')
watch([() => props.open, isGated], () => { expanded.value = ''; error.value = '' })

const labels: Record<string, string> = { profile: '个人资料', entries: '密码条目', tasks: '任务', weeklyPlans: '周计划', longPlans: '长期计划', planner: '规划设置', agentResources: 'Agent 资源', agentResourceTaxonomy: '资源分类', memos: '备忘录', docMetas: '附件信息', repos: '项目收藏' }

function differences(conflict: OfflineJournal['conflicts'][number]) {
  const a = (conflict.operation.value ?? {}) as Record<string, unknown>
  const b = (conflict.remote.value ?? {}) as Record<string, unknown>
  const fields: Record<string, string> = { title: '标题', notes: '备注', content: '正文', date: '日期', time: '时间', done: '完成状态', priority: '优先级', password: '密码', username: '用户名', totp: '验证码密钥', name: '名称', estimatedMinutes: '预计分钟', links: '关联条目', tags: '标签', subtasks: '子任务', updatedAt: '修改时间' }
  const format = (value: unknown) => value === undefined ? '未设置' : typeof value === 'string' ? value : JSON.stringify(value)
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key])).map(key => ({ key, label: fields[key] ?? key, local: format(a[key]), remote: format(b[key]) }))
}

async function choose(conflict: OfflineJournal['conflicts'][number], choice: 'local' | 'remote' | 'both'): Promise<void> {
  const message = choice === 'both' ? '保留远端原条目，并将本机内容另存为恢复副本。继续吗？' : choice === 'remote' ? '使用另一设备的版本将替换这条记录的本机修改，确定继续吗？' : '保留本机版本，下一次同步时尝试更新远端；若远端再次变化仍会提示冲突。确定继续吗？'
  if (!await confirmAction(message)) return
  busy.value = true
  error.value = ''
  try {
    await chooseSyncConflict(conflict.remote.entity, conflict.remote.revision, conflict.operation.operationId, choice)
    expanded.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : '冲突处理失败'
  } finally { busy.value = false }
}
</script>

<template>
  <section v-if="offlineConflicts.length" class="settings-card space-y-3 border-warn/30" aria-label="同步冲突">
    <h3 class="settings-section-title">需要确认的修改（{{ offlineConflicts.length }}）</h3>
    <p class="text-xs leading-relaxed text-t2">两边的修改都已保留。选择只影响这一条记录，其他记录可继续同步。</p>
    <p v-if="error" role="alert" class="text-xs text-danger">{{ error }}</p>
    <article v-for="conflict in offlineConflicts" :key="conflict.remote.entity" class="space-y-2 rounded-lg border border-line p-3">
      <p class="text-sm text-t1">{{ labels[conflict.operation.kind] ?? '记录' }} · {{ conflict.operation.id === 'singleton' ? '设置' : conflict.operation.id.slice(0, 8) }}</p>
      <p class="text-xs text-t3">本机：{{ conflict.operation.deleted ? '已删除' : '已修改' }} · 另一设备：{{ conflict.remote.deleted ? '已删除' : '已修改' }}（版本 {{ conflict.remote.revision }}）</p>
      <button class="ui-secondary-button text-xs" :aria-expanded="expanded === conflict.remote.entity" @click="expanded = expanded === conflict.remote.entity ? '' : conflict.remote.entity">{{ expanded === conflict.remote.entity ? '隐藏内容' : '比较两个版本（可能包含密码）' }}</button>
      <div v-if="expanded === conflict.remote.entity" class="max-h-72 space-y-2 overflow-auto text-xs text-t2">
        <div v-for="field in differences(conflict)" :key="field.key" class="rounded-lg border border-line bg-surface-2 p-2"><p class="font-medium">{{ field.label }}</p><p class="mt-1 whitespace-pre-wrap break-all">本机：{{ field.local }}</p><p class="mt-1 whitespace-pre-wrap break-all">另一设备：{{ field.remote }}</p></div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button :disabled="busy" class="ui-secondary-button disabled:opacity-50" @click="choose(conflict, 'local')">保留本机版本</button>
        <button :disabled="busy" class="ui-secondary-button disabled:opacity-50" @click="choose(conflict, 'remote')">使用另一设备版本</button>
        <button v-if="['tasks', 'memos'].includes(conflict.operation.kind) && !conflict.operation.deleted && !conflict.remote.deleted" :disabled="busy" class="ui-secondary-button disabled:opacity-50" @click="choose(conflict, 'both')">保留两个副本</button>
      </div>
    </article>
  </section>
</template>
