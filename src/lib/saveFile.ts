import { Capacitor, registerPlugin } from '@capacitor/core'
import { bytesToB64 } from './crypto'
import { isTauriDesktop, prepareDesktopDialog } from './desktop'

interface DocumentSaverPlugin {
  begin(options: { name: string; mime: string; size: number }): Promise<{ cancelled: boolean; id?: string }>
  append(options: { id: string; offset: number; data: string }): Promise<void>
  finish(options: { id: string }): Promise<void>
  abort(options: { id: string }): Promise<void>
}

const DocumentSaver = registerPlugin<DocumentSaverPlugin>('DocumentSaver')
const CHUNK_SIZE = 512 * 1024
let saving = false

export async function saveFile(blob: Blob, name: string, stillAllowed: () => boolean = () => true): Promise<boolean> {
  if (saving) throw new Error('另一个文件正在保存，请稍后重试')
  saving = true
  const check = () => { if (!stillAllowed()) throw new Error('数据已锁定或密钥已变更，已停止保存') }
  const safeName = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '') || 'personal-hub-export'
  try {
    check()
    if (Capacitor.getPlatform() === 'android') {
      const result = await DocumentSaver.begin({ name: safeName, mime: blob.type || 'application/octet-stream', size: blob.size })
      if (result.cancelled) return false
      if (!result.id) throw new Error('未能创建保存文件')
      const id = result.id
      try {
        check()
        for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE) {
          const bytes = new Uint8Array(await blob.slice(offset, offset + CHUNK_SIZE).arrayBuffer())
          check()
          await DocumentSaver.append({ id, offset, data: bytesToB64(bytes) })
        }
        check()
        await DocumentSaver.finish({ id })
        return true
      } catch (error) {
        try { await DocumentSaver.abort({ id }) } catch {
          throw new Error('保存未完成，且无法清理目标文件，请在所选位置删除不完整文件')
        }
        throw error
      }
    }
    if (isTauriDesktop()) {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeFile } = await import('@tauri-apps/plugin-fs')
      await prepareDesktopDialog()
      check()
      const path = await save({ title: '保存文件', defaultPath: safeName })
      if (!path) return false
      const bytes = new Uint8Array(await blob.arrayBuffer())
      check()
      await writeFile(path, bytes)
      return true
    }
    check()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    try {
      anchor.href = url
      anchor.download = safeName
      document.body.appendChild(anchor)
      anchor.click()
    } finally {
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    }
    return true
  } finally {
    saving = false
  }
}
