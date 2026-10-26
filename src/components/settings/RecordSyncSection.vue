<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import PasswordInput from '@/components/PasswordInput.vue'
import { connectRecordSession, disconnectRecordSession, resumeRecordSession, syncRecordSession, recordConnection, recordConnecting, recordSessionError, recordSaved, recordSyncing, recordStatus, recordLastSuccess } from '@/lib/recordSyncSession'
import { isGated, localCloudAccount } from '@/stores/lock'
import { dataEnvelope } from '@/stores/database'
import { authenticateCloud } from '@/lib/cloudAccount'
import { adoptCloudSession } from '@/lib/cloudAccountSession'
import { attachmentProgress } from '@/lib/attachmentSyncStore'
import { attachmentDownloadMode, setAttachmentDownloadMode } from '@/lib/attachmentAccess'
import { pauseRecordSession, recordPaused, recordPausing, recordPauseError } from '@/lib/recordSyncSession'
import { DEFAULT_SYNC_SERVER, parseSyncConnectionFile } from '@/lib/syncConnectionFile'
import { androidBackgroundAvailable, androidBackgroundEnabled, androidBackgroundMessage, androidBackgroundBatteryExempt, openAndroidBackgroundSettings, setAndroidBackground, refreshAndroidBackground } from '@/lib/androidBackgroundSync'

const props = defineProps<{ open: boolean }>()
const url = ref(DEFAULT_SYNC_SERVER)
const token = ref('')
const error = ref('')
const fileInput = ref<HTMLInputElement>()
const importing = ref(false)
const cloudPassword = ref('')
const backgroundBusy = ref(false)
async function openBackgroundSettings() {
  try { await openAndroidBackgroundSettings() }
  catch (e) { error.value = e instanceof Error ? e.message : '无法打开系统设置' }
}
const connectionBusy = ref(false)
async function runConnection(action: () => Promise<void>) {
  if (connectionBusy.value || isGated.value) return
  connectionBusy.value = true
  error.value = ''
  try { await action() }
  catch (e) { error.value = e instanceof Error ? e.message : '连接设置未完成，请重试' }
  finally { connectionBusy.value = false }
}
async function toggleBackground() {
  if (backgroundBusy.value) return
  backgroundBusy.value = true; error.value = ''
  try {
    await setAndroidBackground(!androidBackgroundEnabled.value)
    await resumeRecordSession()
    await refreshAndroidBackground()
  } catch (e) { error.value = e instanceof Error ? e.message : '后台同步设置失败' }
  finally { backgroundBusy.value = false }
}
let statusTimer: ReturnType<typeof setInterval> | undefined
watch([() => props.open, isGated], () => {
  if (statusTimer) clearInterval(statusTimer)
  statusTimer = undefined
  if (androidBackgroundAvailable && props.open && !isGated.value) {
    void refreshAndroidBackground()
    statusTimer = setInterval(() => { void refreshAndroidBackground() }, 4000)
  }
}, { immediate: true })
onUnmounted(() => { if (statusTimer) clearInterval(statusTimer) })
let importEpoch = 0
watch([() => props.open, isGated], () => { importEpoch += 1; token.value = ''; cloudPassword.value = ''; error.value = '' }, { flush: 'sync' })
async function reconnectCloud() {
  if (importing.value || recordConnecting.value || connectionBusy.value || isGated.value) return
  const epoch = importEpoch
  importing.value = true; error.value = ''
  try {
    const result = await authenticateCloud(localCloudAccount.value, cloudPassword.value, false)
    if (epoch !== importEpoch || isGated.value || !props.open) return
    const env = dataEnvelope.value
    if (env?.v !== 3 || env.vaultId !== result.bootstrap.vaultId || env.keyId !== result.bootstrap.keyId) throw new Error('云账号与本机保险库不匹配')
    await adoptCloudSession(result)
    cloudPassword.value = ''
  } catch (e) { if (epoch === importEpoch) error.value = e instanceof Error ? e.message : '登录失败' }
  finally { importing.value = false }
}
async function connect() {
  if (importing.value || recordConnecting.value || connectionBusy.value || isGated.value) return
  error.value = ''
  try { await connectRecordSession(url.value, token.value.trim()); token.value = '' }
  catch (e) { error.value = e instanceof Error ? e.message : '连接失败' }
}
async function importConnection(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || importing.value || recordConnecting.value || connectionBusy.value || isGated.value) return
  importing.value = true
  const epoch = importEpoch
  error.value = ''
  try {
    if (file.size > 4096) throw new Error('连接文件过大')
    const credentials = parseSyncConnectionFile(await file.text())
    if (epoch !== importEpoch || isGated.value || !props.open) return
    url.value = credentials.url
    await connectRecordSession(credentials.url, credentials.token)
    token.value = ''
  } catch (e) { if (epoch === importEpoch) error.value = e instanceof Error ? e.message : '导入连接失败' }
  finally { importing.value = false }
}
</script>

<template>
  <div class="settings-stack">
    <section class="settings-card space-y-3" aria-label="同步状态">
      <div class="settings-row"><div class="settings-row-copy"><h3 class="settings-section-title">{{ localCloudAccount ? '云同步' : '加密同步' }}</h3><p class="settings-description">{{ localCloudAccount ? `云账号：${localCloudAccount}` : '连接个人同步服务，在多个设备间保持内容一致。' }}</p></div><span class="settings-status" :class="recordPaused ? 'text-warn' : recordConnection ? 'text-ok' : 'text-t3'">{{ recordPausing ? '正在暂停' : recordPauseError ? '暂停未完成' : recordPaused ? '已暂停' : recordConnection ? '已连接' : '未连接' }}</span></div>
      <p role="status" class="text-sm text-t2">{{ recordStatus }}</p>
      <p v-if="attachmentProgress" role="status" class="text-xs text-primary">{{ attachmentProgress }}</p>
      <p v-if="recordLastSuccess" class="settings-description">本次打开后最近同步：{{ new Date(recordLastSuccess).toLocaleString('zh-CN') }}</p>
      <template v-if="recordPaused">
        <p class="settings-description">{{ recordPausing ? '正在等待后台服务停止和已发出的操作结束。' : recordPauseError ? '前台同步已停止，后台服务尚未确认停止。连接设置已保留，请重试暂停。' : '连接设置已保留。锁定和解锁不会结束暂停；重新启动应用后会恢复自动连接。' }}</p>
        <button :disabled="recordPausing || connectionBusy" class="ui-primary-button disabled:opacity-40" @click="runConnection(recordPauseError ? pauseRecordSession : resumeRecordSession)">{{ recordPausing ? '正在暂停…' : recordPauseError ? '重试暂停' : '恢复同步' }}</button>
      </template>
      <template v-else-if="!recordConnection">
        <div v-if="recordSaved" class="settings-actions flex flex-wrap gap-2">
          <button :disabled="recordConnecting || connectionBusy" class="ui-secondary-button disabled:opacity-40" @click="runConnection(resumeRecordSession)">重试连接</button>
          <button :disabled="recordConnecting || connectionBusy" class="ui-secondary-button" @click="runConnection(disconnectRecordSession)">移除连接设置</button>
        </div>
        <form v-if="localCloudAccount" class="space-y-3" @submit.prevent="reconnectCloud">
          <p class="settings-description">输入账户密码，恢复此设备与云端的连接。本机内容会保留。</p>
          <div class="settings-field"><label for="settings-sync-cloud-password">云账号密码</label><PasswordInput id="settings-sync-cloud-password" v-model="cloudPassword" :disabled="importing || recordConnecting" placeholder="输入账户密码" autocomplete="current-password" /></div>
          <button :disabled="recordConnecting || importing || !cloudPassword" class="ui-primary-button w-full">{{ importing ? '正在登录…' : '重新登录云账号' }}</button>
        </form>
        <div v-else class="space-y-3">
          <input ref="fileInput" type="file" accept=".json,application/json" class="hidden" aria-label="同步连接文件" @change="importConnection" />
          <p class="settings-description">使用服务提供的私有连接文件，连接现有保险库。连接文件含有访问凭据，请妥善保管。</p>
          <button :disabled="recordConnecting || importing" class="ui-primary-button disabled:opacity-40" @click="fileInput?.click()">{{ importing ? '正在导入并连接…' : '导入同步连接文件' }}</button>
          <details class="settings-disclosure settings-subsection"><summary class="text-sm font-medium text-t1">手动设置连接</summary><form class="settings-disclosure-body space-y-3" @submit.prevent="connect"><label class="settings-field">服务地址<input v-model="url" :disabled="recordConnecting || importing" class="control-input px-3" :placeholder="DEFAULT_SYNC_SERVER" type="url" /></label><div class="settings-field"><label for="settings-sync-token">访问令牌</label><PasswordInput id="settings-sync-token" v-model="token" :disabled="recordConnecting || importing" placeholder="输入同步服务访问令牌" /></div><p class="settings-description">跨设备连接需要 HTTPS。访问令牌加密保存在此设备中，解锁后自动重连。</p><button :disabled="recordConnecting || importing || !token || !url.trim()" class="ui-primary-button disabled:opacity-40">{{ recordConnecting ? '正在连接…' : '连接同步服务' }}</button></form></details>
        </div>
      </template>
      <div v-else class="settings-actions flex flex-wrap gap-2">
        <button :disabled="recordConnecting || recordSyncing || connectionBusy" class="ui-primary-button disabled:opacity-40" @click="runConnection(syncRecordSession)">{{ recordConnecting || recordSyncing ? '正在同步…' : '立即同步' }}</button>
        <button :disabled="recordPausing || connectionBusy" class="ui-secondary-button" @click="runConnection(pauseRecordSession)">{{ recordPausing ? '正在暂停…' : '暂停同步' }}</button>
      </div>
      <p v-if="recordPauseError || error || recordSessionError" role="alert" class="settings-note text-sm text-danger">{{ recordPauseError || error || recordSessionError }}</p>
      <details v-if="recordConnection" class="settings-disclosure settings-subsection"><summary class="text-sm font-medium text-t1">连接设置</summary><div class="settings-disclosure-body space-y-3"><p class="break-all text-xs text-t3">服务地址：{{ recordConnection }}</p><p class="settings-description">移除后停止此设备的同步，并删除保存的连接凭据。本机内容与云端已同步内容保留。</p><button :disabled="recordConnecting || recordPausing || connectionBusy" class="ui-danger-button" @click="runConnection(disconnectRecordSession)">断开并移除连接</button></div></details>
    </section>
    <section class="settings-card space-y-3">
      <h3 class="settings-section-title">附件下载</h3>
      <fieldset class="space-y-2 text-sm text-t2">
        <legend class="sr-only">此设备的附件下载方式</legend>
        <label class="flex min-h-11 cursor-pointer items-start gap-3 py-2"><input type="radio" class="mt-1 accent-primary" name="attachment-download" :checked="attachmentDownloadMode === 'always'" @change="setAttachmentDownloadMode('always')" /><span><span class="block font-medium">全部下载</span><span class="settings-description">便于离线查看，占用更多设备空间。</span></span></label>
        <label class="flex min-h-11 cursor-pointer items-start gap-3 py-2"><input type="radio" class="mt-1 accent-primary" name="attachment-download" :checked="attachmentDownloadMode === 'on-demand'" @change="setAttachmentDownloadMode('on-demand')" /><span><span class="block font-medium">打开时下载</span><span class="settings-description">保留已下载文件；打开未下载附件需要联网。</span></span></label>
      </fieldset>
      <p class="settings-description">单文件最大 50 MB，下载可能使用移动流量。导出含附件的完整备份前，请选择「全部下载」并完成一次同步。</p>
    </section>
    <section v-if="androidBackgroundAvailable" class="settings-card space-y-3" aria-label="锁屏与后台同步">
      <div class="settings-row"><div class="settings-row-copy"><h3 class="settings-section-title">锁屏与后台同步</h3><p class="settings-description">{{ androidBackgroundEnabled ? '及时同步已开启，使用常驻通知保持后台服务。' : '开启及时同步，在锁屏或切换应用后继续传输加密内容。' }}</p></div><button :disabled="backgroundBusy || recordConnecting || isGated" :aria-pressed="androidBackgroundEnabled" class="ui-secondary-button" @click="toggleBackground">{{ backgroundBusy ? '正在设置…' : androidBackgroundEnabled ? '关闭' : '开启' }}</button></div>
      <p v-if="androidBackgroundMessage" role="status" class="text-xs text-t2">{{ androidBackgroundMessage }}</p>
      <p v-if="androidBackgroundBatteryExempt === false" class="text-xs text-warn">系统电池优化仍开启，可能冻结锁屏同步。请到「耗电管理」选择「完全允许后台行为」或「不受限制」。</p>
      <p v-else-if="androidBackgroundBatteryExempt" class="settings-description">已获系统电池优化豁免；仍以实际检查时间判断同步状态。</p>
      <button class="ui-secondary-button" @click="openBackgroundSettings">设置系统后台运行</button>
      <p class="settings-description">常驻通知中的计时表示距上次成功检查的时间。系统冻结应用时文字也会停留，不能据此判断仍在线。</p>
      <details class="settings-disclosure"><summary class="text-sm text-t2">运行方式与耗电</summary><div class="settings-disclosure-body"><p class="settings-description">及时同步可能增加耗电。锁定时只传输已加密记录，解锁后合并；附件和新的提醒在解锁后处理。系统限制、强行停止或断网可能延迟同步，持续运行超时后转为定期同步。</p></div></details>
    </section>
  </div>
</template>
