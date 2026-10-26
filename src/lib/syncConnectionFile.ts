import { syncServerUrl } from './recordSyncHttp'

export const DEFAULT_SYNC_SERVER = 'https://111.91.19.235'

export function parseSyncConnectionFile(text: string): { url: string; token: string } {
  if (text.length > 4096) throw new Error('连接文件过大')
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('连接文件不是有效的 JSON') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('连接文件格式无效')
  const file = value as Record<string, unknown>
  if (file.format !== 'personal-hub-sync' || file.version !== 1 || typeof file.url !== 'string' || typeof file.token !== 'string') throw new Error('请选择 Personal Hub 同步连接文件')
  const url = syncServerUrl(file.url)
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(file.token)) throw new Error('连接文件中的访问令牌格式无效')
  return { url, token: file.token }
}
