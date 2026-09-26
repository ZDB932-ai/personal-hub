import { computed, ref, watch } from 'vue'
import { dataEnvelope, getActiveKey, databaseBusy } from '@/stores/database'
import { attachRecordSync, runRecordSync } from './recordSync'
import { connectRecordHttp, syncServerUrl } from './recordSyncHttp'
import type { RecordSyncTransport } from './recordSyncWire'
import { forgetRecordCredentials, loadRecordCredentials, saveRecordCredentials, type RecordCredentials } from './recordSyncCredentials'
import { offlineConflicts, offlinePendingCount, offlineSyncError } from '@/stores/offline'
import { syncAttachments } from './attachmentSyncStore'
import { attachmentDownloadMode, bindAttachmentDownload } from './attachmentAccess'

export const recordConnection = ref('')
export const recordConnecting = ref(false)
export const recordSessionError = ref('')
export const recordSaved = ref(false)
export const recordSyncing = ref(false)
export const recordLastSuccess = ref(0)
export const recordPaused = ref(false)
export const recordPausing = ref(false)
export const recordStatus = computed(() => {
  if (!getActiveKey()) return '已锁定'
  if (recordPausing.value) return '正在暂停同步'
  if (recordPaused.value) return '同步已暂停'
  if (recordConnecting.value) return '正在连接'
  if (recordSyncing.value) return '同步中'
  if (recordSessionError.value || offlineSyncError.value) return '同步失败'
  if (offlineConflicts.value.length) return `待处理冲突 ${offlineConflicts.value.length} 条`
  if (!recordConnection.value) return recordSaved.value ? '等待重新连接' : '未连接'
  if (offlinePendingCount.value) return `待上传 ${offlinePendingCount.value} 条`
  return recordLastSuccess.value ? (attachmentDownloadMode.value === 'on-demand' ? '记录已同步，附件按需下载' : '已同步（记录与附件）') : '已连接，等待同步'
})
let transport: RecordSyncTransport | undefined
let detach: (() => void) | undefined
let generation = 0
let retry: ReturnType<typeof setTimeout> | undefined
let failures = 0
let paused = false
let job: Promise<unknown> = Promise.resolve()

function stopSession() {
  bindAttachmentDownload()
  generation++
  if (retry) clearTimeout(retry)
  retry = undefined
  detach?.(); detach = undefined; transport = undefined
  recordConnection.value = ''; recordSessionError.value = ''
  recordConnecting.value = false; recordSyncing.value = false; recordLastSuccess.value = 0
}

function enqueue<T>(action: () => Promise<T>): Promise<T> {
  const next = job.then(action)
  job = next.catch(() => {})
  return next
}

async function perform(next: RecordSyncTransport, epoch: number, force = false) {
  if (epoch !== generation) throw new Error('同步会话已变化')
  recordSyncing.value = true
  try {
    const result = await runRecordSync(next, force, () => epoch === generation)
    if (result.status !== 'retry') {
      try {
        await syncAttachments(next, () => epoch === generation, force)
        const final = await runRecordSync(next, force, () => epoch === generation)
        Object.assign(result, final)
      } catch (error) {
        if (epoch === generation) recordSessionError.value = error instanceof Error ? error.message : '附件同步失败'
        return { ...result, status: 'retry' as const, retryAt: Date.now() + 30000 }
      }
    }
    if (epoch === generation) {
      recordSessionError.value = ''
      if (result.status === 'complete') recordLastSuccess.value = Date.now()
    }
    return result
  } catch (error) {
    if (epoch === generation) recordSessionError.value = error instanceof Error ? error.message : '同步失败'
    throw error
  } finally { if (epoch === generation) recordSyncing.value = false }
}

async function establish(url: string, token: string, epoch: number, saved?: RecordCredentials) {
  const key = getActiveKey(), env = dataEnvelope.value
  if (!key || env?.v !== 3 || databaseBusy.value || epoch !== generation) throw new Error('请先解锁设备独立密码保险库')
  const valid = () => epoch === generation && getActiveKey() === key && !databaseBusy.value && dataEnvelope.value?.v === 3 && dataEnvelope.value.vaultId === env.vaultId && dataEnvelope.value.keyId === env.keyId
  recordConnecting.value = true
  try {
    const next = await connectRecordHttp(url, token, { vaultId: env.vaultId, keyId: env.keyId })
    if (!valid()) throw new Error('保险库状态已变化')
    if (saved && next.serverId !== saved.serverId) throw new Error('服务器身份已变化，请检查服务器备份或重新配置')
    await perform(next, epoch, true)
    if (!valid()) throw new Error('同步已暂停')
    if (!saved) await saveRecordCredentials(key, { version: 1, url: syncServerUrl(url), token, vaultId: env.vaultId, keyId: env.keyId, serverId: next.serverId }, valid)
    if (!valid()) return
    recordSaved.value = true
    transport = next; recordConnection.value = syncServerUrl(url)
    bindAttachmentDownload(meta => enqueue(() => syncAttachments(next, () => epoch === generation, false, meta)))
    failures = 0
    detach = attachRecordSync(next, () => enqueue(() => perform(next, epoch)))
  } finally { if (epoch === generation) recordConnecting.value = false }
}

export function connectRecordSession(url: string, token: string): Promise<void> {
  recordPaused.value = false
  paused = false; stopSession()
  const epoch = generation
  return enqueue(() => establish(url, token, epoch))
}

export async function disconnectRecordSession(): Promise<void> {
  recordPaused.value = false
  paused = true; stopSession()
  const epoch = generation, key = getActiveKey()
  try {
    await enqueue(() => forgetRecordCredentials(() => epoch === generation && Boolean(key) && getActiveKey() === key && !databaseBusy.value))
    if (epoch === generation) recordSaved.value = false
  } catch (error) {
    if (epoch === generation) recordSessionError.value = `已暂停，但移除配置失败：${error instanceof Error ? error.message : '请重试'}`
  }
}

export function resumeRecordSession(): Promise<void> {
  recordPaused.value = false
  paused = false; stopSession()
  const epoch = generation
  return enqueue(async () => {
    const key = getActiveKey(), env = dataEnvelope.value
    if (!key || env?.v !== 3 || databaseBusy.value || epoch !== generation) return
    try {
      const saved = await loadRecordCredentials(key)
      if (epoch !== generation) return
      recordSaved.value = Boolean(saved)
      if (!saved) return
      if (saved.vaultId !== env.vaultId || saved.keyId !== env.keyId) throw new Error('保存的连接属于其他保险库，请移除配置')
      await establish(saved.url, saved.token, epoch, saved)
    } catch (error) {
      if (epoch !== generation) return
      recordSessionError.value = error instanceof Error ? error.message : '自动连接失败'
      if (error instanceof TypeError || (error instanceof DOMException && ['TimeoutError', 'AbortError'].includes(error.name))) {
        failures = Math.min(failures + 1, 6)
        retry = setTimeout(() => { void resumeRecordSession() }, Math.min(60000, 1000 * 2 ** failures))
      }
    }
  })
}

export async function syncRecordSession() {
  const next = transport, epoch = generation
  if (!next || recordConnecting.value) return
  await enqueue(async () => { if (epoch === generation) await perform(next, epoch, true) }).catch(() => {})
}

export async function pauseRecordSession(): Promise<void> {
  if (recordPausing.value) return
  paused = true
  recordPaused.value = true
  recordPausing.value = true
  stopSession()
  try { await job } finally { recordPausing.value = false }
}

watch([getActiveKey, databaseBusy], () => {
  stopSession(); recordSaved.value = false
  if (getActiveKey() && !databaseBusy.value && !paused) void resumeRecordSession()
}, { immediate: true, flush: 'sync' })

if (typeof window !== 'undefined') {
  const wake = () => { if (!paused && getActiveKey() && !databaseBusy.value && !recordConnecting.value && !recordConnection.value) void resumeRecordSession() }
  window.addEventListener('online', wake)
  window.addEventListener('focus', wake)
}
