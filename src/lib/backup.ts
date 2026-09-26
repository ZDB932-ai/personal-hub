import type { DataEnvelope, VaultPayload } from '@/types'
import { b64ToBytes, bytesToB64, decryptJSON, decryptBytes, encryptBytes, encryptJSON } from '@/lib/crypto'
import { unlockEnvelope } from './vaultKeys'
import { getActiveKey } from '@/lib/keyring'
import { deleteBlob, getBlob, putBlob } from '@/lib/docdb'
import { beginDatabaseUpdate, dataEnvelope, databaseBusy, endDatabaseUpdate, flushPendingSave, getDataRevision, initFromEnvelope, prepareOfflinePayload, snapshotPayload } from '@/stores/database'
import { toYMD } from '@/lib/utils'
import { saveFile } from './saveFile'
import { validatePayload } from './payloadSchema'
import { recoveryAttachmentMetas, validateRecovery } from './recovery'

export interface BackupDoc {
  id: string
  ivB64: string
  ctB64: string
}

export interface BackupFile {
  app: 'personal-hub'
  version: 1
  exportedAt: number
  envelope: DataEnvelope
  docs: BackupDoc[]
}

export async function exportBackup(includeDocs: boolean): Promise<string> {
  if (databaseBusy.value) throw new Error('数据正在更新，请稍后导出')
  let envelope: DataEnvelope
  let recovery = false
  try {
    envelope = await flushPendingSave()
  } catch (error) {
    const key = getActiveKey()
    const previous = dataEnvelope.value
    if (!key || !previous) throw error
    envelope = { ...previous, ts: Date.now(), ...await encryptJSON(key, prepareOfflinePayload(snapshotPayload())) }
    recovery = true
  }
  if (!envelope) throw new Error('本地数据尚未初始化')
  const docs: BackupDoc[] = []
  if (includeDocs) {
    const key = getActiveKey()
    if (!key) throw new Error('数据已锁定，无法导出完整备份')
    const payload = await decryptJSON<VaultPayload>(key, envelope.ivB64, envelope.ctB64)
    for (const meta of recoveryAttachmentMetas(payload)) {
      const blobId = meta.blobId ?? meta.id
      if (docs.some(doc => doc.id === blobId)) continue
      const rec = await getBlob(blobId)
      if (!rec) throw new Error(`附件「${meta.name}」不在本机，请先同步附件，或取消包含附件后导出仅数据备份`)
      {
        docs.push({
          id: blobId,
          ivB64: rec.ivB64,
          ctB64: bytesToB64(new Uint8Array(rec.ct)),
        })
      }
    }
  }
  const backup: BackupFile = {
    app: 'personal-hub',
    version: 1,
    exportedAt: Date.now(),
    envelope,
    docs,
  }
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  if (!await saveFile(blob, `personal-hub-backup-${toYMD(new Date()).replaceAll('-', '')}.phub`)) return '已取消导出'
  const result = includeDocs ? `已导出（含 ${docs.length} 个附件）` : '已导出（仅数据）'
  return recovery ? `${result}，包含本窗口未保存的修改；尚未合并其他窗口的数据` : result
}

export async function parseBackup(file: File): Promise<BackupFile> {
  const text = await file.text()
  let parsed: BackupFile
  try {
    parsed = JSON.parse(text) as BackupFile
  } catch {
    throw new Error('文件解析失败，请确认选择的是 .phub 备份文件')
  }
  if (parsed.app !== 'personal-hub' || parsed.version !== 1 || !parsed.envelope?.kdf || !parsed.envelope.ivB64 || !Array.isArray(parsed.docs)) {
    throw new Error('不是有效的 Personal Hub 备份文件')
  }
  return parsed
}

export const NEED_PASSWORD = 'NEED_PASSWORD'

export async function applyBackup(parsed: BackupFile, backupPassword?: string): Promise<void> {
  if (databaseBusy.value) throw new Error('数据正在更新，请稍后重试')
  const activeKey = getActiveKey()
  const activeEnvelope = dataEnvelope.value
  if (!activeKey || !activeEnvelope) throw new Error('数据已锁定')
  let sourceKey = activeKey
  let payload: VaultPayload
  try {
    payload = await decryptJSON<VaultPayload>(sourceKey, parsed.envelope.ivB64, parsed.envelope.ctB64)
  } catch {
    if (!backupPassword) throw new Error(NEED_PASSWORD)
    try {
      sourceKey = await unlockEnvelope(parsed.envelope, backupPassword)
      payload = await decryptJSON<VaultPayload>(sourceKey, parsed.envelope.ivB64, parsed.envelope.ctB64)
    } catch {
      throw new Error('无法解密备份，请检查主密码或文件是否完整')
    }
  }
  validatePayload(payload)
  validateRecovery(payload.recoveryItems)
  await flushPendingSave()
  await beginDatabaseUpdate()
  payload.offlineJournal = snapshotPayload().offlineJournal
  const revision = getDataRevision()
  const canApply = () => getActiveKey() === activeKey && getDataRevision() === revision
  const staged: string[] = []
  let committed = false
  try {
    const attachments = new Map(parsed.docs.map(doc => [doc.id, doc]))
    if (attachments.size !== parsed.docs.length) throw new Error('备份包含重复的附件标识')
    for (const meta of recoveryAttachmentMetas(payload)) {
      const source = attachments.get(meta.blobId ?? meta.id)
      const newId = crypto.randomUUID()
      meta.blobId = newId
      if (!source) continue
      const plain = await decryptBytes(sourceKey, source.ivB64, b64ToBytes(source.ctB64).buffer as ArrayBuffer)
      const encrypted = await encryptBytes(activeKey, plain)
      staged.push(newId)
      await putBlob(newId, encrypted)
    }
    const envelope: DataEnvelope = {
      ...activeEnvelope,
      ts: Math.max(Date.now(), (dataEnvelope.value?.ts ?? 0) + 1),
      ...await encryptJSON(activeKey, prepareOfflinePayload(payload)),
    }
    if (!canApply()) throw new Error('恢复期间本地数据发生变化，请重试')
    const applied = await initFromEnvelope(envelope, activeKey, canApply, () => { committed = true })
    if (!applied) throw new Error('恢复期间本地数据发生变化，已保留本窗口内容，请先导出备份')
  } finally {
    if (!committed) await Promise.allSettled(staged.map(deleteBlob))
    endDatabaseUpdate()
  }
}
