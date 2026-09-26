import type { VaultPayload, WrappedEnvelope } from '@/types'
import { b64ToBytes, bytesToB64, decryptBytes, decryptJSON, encryptJSON, randomHex } from './crypto'
import { rewrapVaultKey, unlockEnvelope, type KeyHeader } from './vaultKeys'
import { deleteBlob, getBlob, putBlob } from './docdb'
import { commitRepository, readRepository, repositoryRevision } from './vaultRepository'
import { dataEnvelope, databaseBusy, flushPendingSave, getActiveKey, getDataRevision, prepareOfflinePayload } from '@/stores/database'
import type { BackupDoc } from './backup'
import { validatePayload } from './payloadSchema'
import { recoveryAttachmentMetas, validateRecovery } from './recovery'

export interface DeviceTransferFile {
  app: 'personal-hub-device'
  version: 1
  header: KeyHeader
  ivB64: string
  ctB64: string
}

interface TransferContent {
  purpose: 'device-transfer'
  vaultId: string
  keyId: string
  payload: VaultPayload
  docs: BackupDoc[]
}

export async function createDeviceTransfer(password: string): Promise<{ file: DeviceTransferFile; code: string }> {
  if (databaseBusy.value) throw new Error('数据正在更新，请稍后重试')
  const envelope = await flushPendingSave()
  if (envelope.v !== 3) throw new Error('请先启用设备独立密码')
  const activeKey = getActiveKey()
  if (!activeKey) throw new Error('请先解锁')
  const revision = getDataRevision()
  const storageRevision = repositoryRevision()
  const key = await unlockEnvelope(envelope, password)
  const payload = await decryptJSON<VaultPayload>(key, envelope.ivB64, envelope.ctB64)
  const docs: BackupDoc[] = []
  for (const meta of recoveryAttachmentMetas(payload)) {
    const id = meta.blobId ?? meta.id
    if (docs.some(doc => doc.id === id)) continue
    const blob = await getBlob(id)
    if (!blob) throw new Error(`附件「${meta.name}」不在本机，无法生成完整设备文件；请先恢复缺失附件`)
    docs.push({ id, ivB64: blob.ivB64, ctB64: bytesToB64(new Uint8Array(blob.ct)) })
  }
  const code = randomHex(16)
  const header = await rewrapVaultKey(envelope, password, code)
  const content: TransferContent = { purpose: 'device-transfer', vaultId: header.vaultId, keyId: header.keyId, payload, docs }
  const sealed = await encryptJSON(key, content)
  if (getActiveKey() !== activeKey || getDataRevision() !== revision || repositoryRevision() !== storageRevision || databaseBusy.value) {
    throw new Error('生成期间数据发生变化，请重试')
  }
  return { file: { app: 'personal-hub-device', version: 1, header, ...sealed }, code }
}

export function parseDeviceTransfer(text: string): DeviceTransferFile {
  const parsed = JSON.parse(text) as DeviceTransferFile
  if (parsed?.app !== 'personal-hub-device' || parsed.version !== 1 || parsed.header?.v !== 3 ||
    typeof parsed.ctB64 !== 'string' || typeof parsed.ivB64 !== 'string') throw new Error('不是有效的设备加入文件')
  return parsed
}

export async function joinDeviceTransfer(file: DeviceTransferFile, code: string, password: string): Promise<void> {
  if (password.length < 8) throw new Error('本机主密码至少需要 8 位')
  if (!/^[a-f0-9]{32}$/i.test(code.trim())) throw new Error('转移码应为 32 位十六进制字符')
  if (dataEnvelope.value || readRepository('xk.data.v2') || localStorage.getItem('xk.lock.v1') ||
    localStorage.getItem('xk.profile.v1') || localStorage.getItem('xk.vault.v1')) throw new Error('仅支持在尚未创建保险库的新设备上加入')
  const revision = repositoryRevision()
  const transportEnvelope: WrappedEnvelope = { ...file.header, ts: 0, ivB64: file.ivB64, ctB64: file.ctB64 }
  const key = await unlockEnvelope(transportEnvelope, code.trim().toLowerCase())
  const content = await decryptJSON<TransferContent>(key, file.ivB64, file.ctB64)
  if (content.purpose !== 'device-transfer' || content.vaultId !== file.header.vaultId || content.keyId !== file.header.keyId ||
    !content.payload?.profile || !Array.isArray(content.payload.entries) || !Array.isArray(content.docs)) throw new Error('设备文件内容校验失败')
  validatePayload(content.payload)
  validateRecovery(content.payload.recoveryItems)
  const header = await rewrapVaultKey(file.header, code.trim().toLowerCase(), password)
  const payload = prepareOfflinePayload({ ...content.payload, offlineJournal: undefined })
  const attachments = new Map(content.docs.map(doc => [doc.id, doc]))
  if (attachments.size !== content.docs.length) throw new Error('设备文件包含重复附件')
  const staged: string[] = []
  let committed = false
  try {
    for (const meta of recoveryAttachmentMetas(payload)) {
      const blob = attachments.get(meta.blobId ?? meta.id)
      if (!blob) throw new Error('设备文件缺少附件')
      const ct = b64ToBytes(blob.ctB64).buffer as ArrayBuffer
      const plain = await decryptBytes(key, blob.ivB64, ct)
      if (plain.byteLength !== meta.size) throw new Error('附件大小校验失败')
      const id = crypto.randomUUID()
      staged.push(id)
      await putBlob(id, { ivB64: blob.ivB64, ct })
      meta.blobId = id
    }
    const envelope: WrappedEnvelope = { ...header, ts: Date.now(), ...await encryptJSON(key, payload) }
    await commitRepository({ 'xk.data.v2': envelope, 'xk.lock.v2': { hint: '', autoLockMinutes: 5 } },
      () => !dataEnvelope.value && !readRepository('xk.data.v2') && repositoryRevision() === revision)
    committed = true
  } finally {
    if (!committed) await Promise.allSettled(staged.map(deleteBlob))
  }
}
