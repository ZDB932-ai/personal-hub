import { watch } from 'vue'
import { dataEnvelope, databaseBusy, flushPendingSave, getActiveKey, onDataSaved, publishEnvelope, snapshotPayload, updateSyncPayload } from '@/stores/database'
import { RecordSyncEngine, type SyncStorage } from './recordSyncEngine'
import type { RecordSyncTransport } from './recordSyncWire'
import { resolveConflict } from './syncMerge'
import { RecordSyncScheduler } from './recordSyncScheduler'
import { offlineSyncError } from '@/stores/offline'
import type { SyncRunResult } from './recordSyncEngine'
import { startForegroundSync } from './foregroundSync'

const storage: SyncStorage = {
  async read() { await flushPendingSave(); return snapshotPayload() },
  update: updateSyncPayload,
}

export async function runRecordSync(transport: RecordSyncTransport, force = false, sessionActive = () => true) {
  const env = dataEnvelope.value
  const key = getActiveKey()
  if (!key || env?.v !== 3 || databaseBusy.value) throw new Error('请先解锁设备独立密码保险库')
  const engine = new RecordSyncEngine(storage, transport, { vaultId: env.vaultId, keyId: env.keyId }, key, Date.now,
    () => sessionActive() && getActiveKey() === key && !databaseBusy.value && dataEnvelope.value?.v === 3 && dataEnvelope.value.keyId === env.keyId)
  return engine.run(force)
}

export async function chooseSyncConflict(entity: string, revision: number, operationId: string, choice: 'local' | 'remote' | 'both'): Promise<void> {
  await storage.update(payload => resolveConflict(payload, entity, revision, operationId, choice))
  if (dataEnvelope.value) publishEnvelope(dataEnvelope.value, true)
}

export function attachRecordSync(transport: RecordSyncTransport, run?: () => Promise<SyncRunResult>): () => void {
  let attached = true
  const scheduler = new RecordSyncScheduler(run ?? (() => runRecordSync(transport, false, () => attached)),
    () => attached && Boolean(getActiveKey()) && !databaseBusy.value && dataEnvelope.value?.v === 3,
    error => { if (getActiveKey()) offlineSyncError.value = error instanceof Error ? error.message : '同步失败' })
  const request = () => scheduler.request()
  const unsubscribe = onDataSaved(request)
  const unwatch = watch([getActiveKey, databaseBusy], request, { immediate: true })
  window.addEventListener('online', request)
  window.addEventListener('focus', request)
  const visible = () => { if (document.visibilityState === 'visible') request() }
  document.addEventListener('visibilitychange', visible)
  const stopPolling = startForegroundSync(request, () => attached && Boolean(getActiveKey()) && !databaseBusy.value && navigator.onLine !== false && document.visibilityState === 'visible')
  return () => {
    attached = false
    stopPolling()
    document.removeEventListener('visibilitychange', visible)
    scheduler.stop()
    unsubscribe(); unwatch()
    window.removeEventListener('online', request)
    window.removeEventListener('focus', request)
  }
}
