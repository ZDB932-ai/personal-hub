<script setup lang="ts">
import { confirmAction } from '@/lib/confirmAction'
import { computed, reactive, ref, watch } from 'vue'
import { Cloud, CloudOff, RefreshCw } from '@lucide/vue'
import {
  connectSync,
  disconnectSync,
  isSyncConfigured,
  setAutoSync,
  syncConfig,
  syncMeta,
  syncing,
  syncNow,
} from '@/lib/sync'
import { toast } from '@/lib/toast'
import PasswordInput from '@/components/PasswordInput.vue'
import { offlinePendingCount, offlineDeletedCount, offlinePreparedAt, offlineInFlight, offlineRetryAt, offlineSyncError } from '@/stores/offline'
import { dataEnvelope } from '@/stores/database'
import SyncConflicts from './SyncConflicts.vue'
import SyncRehearsal from './SyncRehearsal.vue'
import RecordSyncSection from './RecordSyncSection.vue'

const props = defineProps<{
  open: boolean
}>()

const form = reactive({
  serverUrl: '',
  email: '',
  password: '',
  autoSync: true,
})
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (open) {
      Object.assign(form, { serverUrl: '', email: '', password: '', autoSync: true })
      error.value = ''
    }
  },
  { immediate: true },
)

async function submitConnect(): Promise<void> {
  error.value = ''
  if (!form.serverUrl.trim() || !form.email.trim()) {
    error.value = '请填写服务器地址和邮箱'
    return
  }
  try {
    await connectSync(form.serverUrl, form.email, form.password, form.autoSync)
    toast('云同步已开启')
    Object.assign(form, { serverUrl: '', email: '', password: '' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '连接失败，请稍后重试'
  }
}

async function handleDisconnect(): Promise<void> {
  if (!await confirmAction('断开后将停止云同步（云端已有备份会保留）。确定断开吗？')) return
  await disconnectSync()
  toast('已断开云同步')
}

const lastSyncText = computed(() =>
  syncMeta.value.lastSyncAt
    ? new Date(syncMeta.value.lastSyncAt).toLocaleString('zh-CN')
    : '从未同步',
)

</script>

<template>
  <div class="settings-stack">
    <SyncConflicts :open="props.open" />
    <RecordSyncSection v-if="dataEnvelope?.v === 3" :open="props.open" />
    <section v-else class="settings-card space-y-3">
      <div class="settings-row"><div class="settings-row-copy"><h3 class="settings-section-title">同步状态</h3><p class="settings-description">此账户使用兼容的整库同步方式。</p></div><span class="settings-status" :class="isSyncConfigured ? 'text-ok' : 'text-t3'">{{ isSyncConfigured ? '已连接' : '未连接' }}</span></div>
      <p v-if="isSyncConfigured" role="status" :class="syncing ? 'text-primary' : syncMeta.lastError ? 'text-danger' : 'text-t2'">{{ syncing ? '同步中…' : syncMeta.lastError || `最近同步：${lastSyncText}` }}</p>
      <p class="settings-description">前往「账户与恢复」设置恢复密钥并升级加密格式，即可使用逐条合并与附件同步。操作前请导出一份备份。</p>
      <div v-if="isSyncConfigured" class="settings-actions flex flex-wrap gap-2"><button :disabled="syncing" class="ui-primary-button disabled:opacity-40" @click="void syncNow()"><RefreshCw class="h-4 w-4" :class="{ 'animate-spin': syncing }" />立即同步</button><button class="ui-secondary-button" :aria-pressed="!!syncConfig?.autoSync" @click="void setAutoSync(!syncConfig?.autoSync)">{{ syncConfig?.autoSync ? '自动同步已开启' : '自动同步已关闭' }}</button></div>
    </section>
    <details class="settings-card settings-disclosure">
      <summary class="settings-section-title">本机离线记录<span v-if="offlineSyncError || offlineInFlight" class="settings-status text-warn">等待确认</span><span v-else class="settings-status text-t3">{{ offlinePendingCount }} 条待处理</span></summary>
      <div class="settings-disclosure-body space-y-2"><p class="settings-description">离线时仍可使用。内容和待同步记录会一起加密保存在本机，连接恢复后继续同步。</p><p class="text-sm text-t2">待处理 {{ offlinePendingCount }} 条，其中删除记录 {{ offlineDeletedCount }} 条。</p><p v-if="offlinePreparedAt" class="settings-description">最近保存：{{ new Date(offlinePreparedAt).toLocaleString('zh-CN') }}</p><p v-if="offlineInFlight" class="text-xs text-warn">有一项操作正在等待云端确认，重新连接后将继续处理。</p><p v-if="offlineSyncError" role="status" class="text-xs text-warn">{{ offlineSyncError }}<span v-if="offlineRetryAt"> · 下次可重试：{{ new Date(offlineRetryAt).toLocaleTimeString('zh-CN') }}</span></p><p class="settings-description">同步不能代替独立备份。请在「备份与迁移」中定期导出文件。</p></div>
    </details>
    <details class="settings-card settings-disclosure">
      <summary class="settings-section-title">高级与诊断</summary>
      <div class="settings-disclosure-body settings-stack">
        <section v-if="dataEnvelope?.v !== 3" class="settings-subsection space-y-3">
          <h4 class="settings-section-title">旧版同步连接</h4>
          <p class="text-xs leading-relaxed text-warn">PocketBase 整库同步不支持逐条合并或传输附件。两台设备分别修改后，内容可能互相覆盖。</p>
          <form v-if="!isSyncConfigured" class="space-y-3" @submit.prevent="submitConnect">
            <label class="settings-field">服务器地址<input v-model="form.serverUrl" :disabled="syncing" class="control-input px-3" placeholder="https://pb.example.com" /></label>
            <label class="settings-field">账户邮箱<input v-model="form.email" :disabled="syncing" class="control-input px-3" type="email" autocomplete="username" placeholder="用于此同步服务的邮箱" /></label>
            <div class="settings-field"><label for="settings-legacy-sync-password">同步密码</label><PasswordInput id="settings-legacy-sync-password" v-model="form.password" :disabled="syncing" placeholder="输入同步服务密码" autocomplete="current-password" /></div>
            <label class="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-t2"><input v-model="form.autoSync" :disabled="syncing" type="checkbox" class="accent-primary" />自动同步修改，并在进入应用时拉取内容</label>
            <p v-if="error" role="alert" class="text-xs text-danger">{{ error }}</p>
            <button :disabled="!form.serverUrl || !form.email || !form.password || syncing" class="ui-primary-button disabled:opacity-40"><Cloud class="h-4 w-4" />{{ syncing ? '正在连接…' : '连接旧版同步服务' }}</button>
          </form>
          <div v-else class="space-y-3"><dl class="space-y-2 text-xs"><div><dt class="text-t3">服务器</dt><dd class="break-all text-t1">{{ syncConfig?.serverUrl }}</dd></div><div><dt class="text-t3">账户</dt><dd class="break-all text-t1">{{ syncConfig?.email }}</dd></div></dl><p class="settings-description">断开后保留本机与云端已有内容，停止后续同步。</p><button :disabled="syncing" class="ui-danger-button" @click="handleDisconnect"><CloudOff class="h-4 w-4" />断开旧版同步</button></div>
          <details class="settings-disclosure"><summary class="text-sm text-t2">PocketBase 配置参考</summary><ol class="settings-disclosure-body list-decimal space-y-2 pl-5 text-xs leading-relaxed text-t3"><li>从 pocketbase.io 下载服务程序，运行 <code>./pocketbase serve</code>。</li><li>打开 <code>http://服务器IP:8090/_/</code> 创建管理员。</li><li>创建集合 <code>vaults</code>，字段为 user（关联 users）与 data（JSON）。</li><li class="break-all">API Rules 四项均设为：<code>@request.auth.id != "" &amp;&amp; user = @request.auth.id</code>。</li><li>users 集合开启注册，并为跨设备访问配置 HTTPS。</li></ol></details>
        </section>
        <SyncRehearsal />
      </div>
    </details>
  </div>
</template>
