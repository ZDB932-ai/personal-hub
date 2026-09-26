<script setup lang="ts">
import { ref, watch } from 'vue'
import PasswordInput from '@/components/PasswordInput.vue'
import { connectRecordSession, disconnectRecordSession, resumeRecordSession, syncRecordSession, recordConnection, recordConnecting, recordSessionError, recordSaved, recordSyncing, recordStatus, recordLastSuccess } from '@/lib/recordSyncSession'
import { isGated } from '@/stores/lock'
import { attachmentProgress } from '@/lib/attachmentSyncStore'
import { attachmentDownloadMode, setAttachmentDownloadMode } from '@/lib/attachmentAccess'
import { pauseRecordSession, recordPaused, recordPausing } from '@/lib/recordSyncSession'

const props = defineProps<{ open: boolean }>()
const url = ref('http://127.0.0.1:8787')
const token = ref('')
const error = ref('')
watch([() => props.open, isGated], () => { token.value = ''; error.value = '' })
async function connect() {
  error.value = ''
  try { await connectRecordSession(url.value, token.value.trim()); token.value = '' }
  catch (e) { error.value = e instanceof Error ? e.message : '连接失败' }
}
</script>

<template>
  <section class="mb-4 space-y-3 rounded-xl border border-line bg-surface p-4">
    <p class="text-sm font-medium text-t1">逐条加密同步</p>
    <p role="status" class="text-xs text-t2">{{ recordStatus }}</p>
    <p v-if="attachmentProgress" class="text-xs text-primary">{{ attachmentProgress }}</p>
    <p v-if="recordLastSuccess" class="text-xs text-t3">本次会话最近同步：{{ new Date(recordLastSuccess).toLocaleString('zh-CN') }}</p>
    <p class="text-xs leading-relaxed text-t2">连接运行中的 Personal Hub 同步服务。其他设备需先通过「安全」中的设备加入文件加入同一保险库，再使用相同服务账号连接。</p>
    <template v-if="recordPaused">
      <p class="text-xs leading-relaxed text-t2">连接配置已保留。本窗口内保持暂停，锁定再解锁也不会恢复；刷新或重新启动后恢复自动连接。</p>
      <button :disabled="recordPausing" class="rounded-lg border border-line px-3 py-2 text-xs text-primary disabled:opacity-40" @click="resumeRecordSession">恢复同步</button>
    </template>
    <template v-else-if="!recordConnection">
      <div v-if="recordSaved" class="flex gap-2">
        <button :disabled="recordConnecting" class="rounded-lg border border-line px-3 py-2 text-xs text-primary disabled:opacity-40" @click="resumeRecordSession">重试已保存的连接</button>
        <button class="rounded-lg border border-line px-3 py-2 text-xs text-t2" @click="disconnectRecordSession">移除连接配置</button>
      </div>
      <input v-model="url" aria-label="逐条同步服务地址" class="control-input px-3" placeholder="http://127.0.0.1:8787" />
      <PasswordInput v-model="token" placeholder="同步服务访问令牌" />
      <button :disabled="recordConnecting || !token" class="ui-primary-button w-full disabled:opacity-40" @click="connect">{{ recordConnecting ? '正在连接…' : '连接并同步记录' }}</button>
    </template>
    <template v-else>
      <p class="break-all text-xs text-ok">已连接：{{ recordConnection }}</p>
      <div class="flex flex-wrap gap-2">
        <button :disabled="recordConnecting || recordSyncing" class="rounded-lg border border-line px-3 py-2 text-xs text-primary disabled:opacity-40" @click="syncRecordSession">{{ recordConnecting || recordSyncing ? '正在同步…' : '立即同步记录' }}</button>
        <button class="rounded-lg border border-line px-3 py-2 text-xs text-t2" @click="pauseRecordSession">暂停同步</button>
        <button class="rounded-lg border border-line px-3 py-2 text-xs text-t2" @click="disconnectRecordSession">断开并移除配置</button>
      </div>
    </template>
    <p v-if="error || recordSessionError" role="alert" class="text-xs text-danger">{{ error || recordSessionError }}</p>
    <fieldset class="space-y-2 text-xs text-t2">
      <legend class="font-medium">本机附件下载</legend>
      <label class="flex min-h-11 items-center gap-2"><input type="radio" name="attachment-download" :checked="attachmentDownloadMode === 'always'" @change="setAttachmentDownloadMode('always')" />全部下载，便于离线查看</label>
      <label class="flex min-h-11 items-center gap-2"><input type="radio" name="attachment-download" :checked="attachmentDownloadMode === 'on-demand'" @change="setAttachmentDownloadMode('on-demand')" />打开时下载，保留已下载文件</label>
    </fieldset>
    <p class="text-xs leading-relaxed text-t3">连接配置加密保存在本机，解锁后自动重连，锁定时暂停。修改后、回到前台以及前台每 45–60 秒同步。单文件最多 50MB；打开时下载需要联网，可能使用移动流量。跨设备连接需 HTTPS。完整备份前请先选择全部下载并立即同步。</p>
  </section>
</template>
