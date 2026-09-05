import type { DataEnvelope } from '@/types'
import { b64ToBytes, bytesToB64, decryptJSON, deriveVaultKey, encryptBytes } from '@/lib/crypto'
import { getActiveKey } from '@/lib/keyring'
import { getBlob, putBlob } from '@/lib/docdb'
import { docMetas } from '@/stores/docs'
import { initFromEnvelope, persistNow } from '@/stores/database'
import { readJSON, toYMD } from '@/lib/utils'

const DATA_KEY = 'xk.data.v2'

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
  const envelope = readJSON<DataEnvelope>(DATA_KEY)
  if (!envelope) throw new Error('本地数据尚未初始化')
  const docs: BackupDoc[] = []
  if (includeDocs) {
    for (const meta of docMetas.value) {
      const rec = await getBlob(meta.id)
      if (rec) {
        docs.push({
          id: meta.id,
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
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `personal-hub-backup-${toYMD(new Date()).replaceAll('-', '')}.phub`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return includeDocs ? `已导出（含 ${docs.length} 个附件）` : '已导出（仅数据）'
}

export async function parseBackup(file: File): Promise<BackupFile> {
  const text = await file.text()
  let parsed: BackupFile
  try {
    parsed = JSON.parse(text) as BackupFile
  } catch {
    throw new Error('文件解析失败，请确认选择的是 .phub 备份文件')
  }
  if (parsed.app !== 'personal-hub' || !parsed.envelope?.kdf || !parsed.envelope.ivB64) {
    throw new Error('不是有效的 Personal Hub 备份文件')
  }
  return parsed
}

export const NEED_PASSWORD = 'NEED_PASSWORD'

export async function applyBackup(parsed: BackupFile, backupPassword?: string): Promise<void> {
  const activeKey = getActiveKey()
  if (!activeKey) throw new Error('数据已锁定')
  const activeKdf = readJSON<DataEnvelope>(DATA_KEY)?.kdf
  if (!activeKdf) throw new Error('本机数据尚未初始化')

  let samePassword = true
  try {
    await decryptJSON(activeKey, parsed.envelope.ivB64, parsed.envelope.ctB64)
  } catch {
    samePassword = false
  }

  if (samePassword) {
    for (const d of parsed.docs) {
      await putBlob(d.id, {
        ivB64: d.ivB64,
        ct: b64ToBytes(d.ctB64).buffer as ArrayBuffer,
      })
    }
    await initFromEnvelope(parsed.envelope, activeKey)
    return
  }

  if (!backupPassword) throw new Error(NEED_PASSWORD)

  const oldKey = await deriveVaultKey(backupPassword, parsed.envelope.kdf)
  try {
    await decryptJSON(oldKey, parsed.envelope.ivB64, parsed.envelope.ctB64)
  } catch {
    throw new Error('备份文件的主密码不正确')
  }

  for (const d of parsed.docs) {
    try {
      const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64ToBytes(d.ivB64) },
        oldKey,
        b64ToBytes(d.ctB64),
      )
      const re = await encryptBytes(activeKey, pt)
      await putBlob(d.id, { ivB64: re.ivB64, ct: re.ct })
    } catch {
      /* 跳过无法解密的附件 */
    }
  }
  await initFromEnvelope(parsed.envelope, oldKey)
  await persistNow(activeKdf)
}
