import type { ChangePage, RecordReceipt, RecordSyncTransport, ScopedOperation, SyncSpace } from './recordSyncWire'

export function syncServerUrl(input: string): string {
  const url = new URL(input.trim())
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('请填写不带路径、账号或参数的服务地址')
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('非本机连接必须使用 HTTPS')
  return url.origin
}

export async function connectRecordHttp(input: string, token: string, space: SyncSpace): Promise<RecordSyncTransport> {
  const url = syncServerUrl(input)
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new Error('访问令牌格式无效')
  async function request<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${url}/v1/${path}`, { method: 'POST', credentials: 'omit', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000) })
    if (!response.ok) {
      const messages: Record<number, string> = { 401: '访问令牌已失效，请重新连接', 403: '无权访问此数据空间或当前来源未被允许', 409: '同步历史或操作标识不一致，请检查服务端备份', 413: '单条记录超过服务器限制' }
      throw new Error(messages[response.status] ?? `同步服务请求失败（${response.status}）`)
    }
    return response.json() as Promise<T>
  }
  const info = await request<{ protocolVersion: number; serverId: string; attachments?: boolean } & SyncSpace>('connect', { space })
  if (info.protocolVersion !== 2 || typeof info.serverId !== 'string' || !info.serverId || info.vaultId !== space.vaultId || info.keyId !== space.keyId) throw new Error('同步服务器协议不匹配')
  const check = (target: SyncSpace) => { if (target.vaultId !== space.vaultId || target.keyId !== space.keyId) throw new Error('连接的数据空间已变化') }
  return {
    serverId: info.serverId,
    attachments: info.attachments ? {
      async missing(hashes) { return (await request<{ missing: string[] }>('blobs/missing', { space, hashes })).missing },
      async put(hash, data) { await request('blobs/put', { space, hash, data }) },
      async get(hash) { return (await request<{ data: string }>('blobs/get', { space, hash })).data },
    } : undefined,
    push(target: SyncSpace, wire: ScopedOperation) { check(target); return request<RecordReceipt>('push', { space, wire }) },
    pull(target: SyncSpace, cursor: number) { check(target); return request<ChangePage>('pull', { space, cursor }) },
  }
}
