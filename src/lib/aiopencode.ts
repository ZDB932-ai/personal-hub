import { computed, ref } from 'vue'
import { decryptJSON, encryptJSON } from './crypto'
import { getActiveKey } from './keyring'
import { ensureSyncAuth } from './sync'
import { writeJSON } from './utils'
import { commitRepository, readRepository } from './vaultRepository'

export type AiChannel = 'lan' | 'relay'

export type AiAgentKind = 'opencode' | 'pi' | 'codex' | 'dsh' | 'zcode'

export interface AiProfile {
  id: string
  name: string
  channel: AiChannel
  agentKind: AiAgentKind
  baseUrl: string
  username: string
  password: string
  bridgeUrl: string
  bridgeToken: string
  piProjectId: string
}

export interface PiProject {
  id: string
  name: string
  cwd: string
  running: boolean
  busy: boolean
  sessionName?: string | null
  model?: { id?: string; provider?: string; providerID?: string } | null
}

const PROFILES_KEY = 'xk.ai.profiles.v1'
const ACTIVE_KEY = 'xk.ai.active.v1'
const SECRETS_KEY = 'xk.ai.secrets.v1'

type AiProfileSecrets = Record<string, Pick<AiProfile, 'password' | 'bridgeToken'>>

let legacySecrets: AiProfileSecrets = {}

function normalizeUrl(value: string): string {
  return value.replace(/\s+/g, '').replace(/^(https?):\/*/i, '$1://').replace(/\/+$/, '')
}

function loadProfiles(): AiProfile[] {
  const normalize = (p: Partial<AiProfile>): AiProfile => {
    const id = p.id ?? crypto.randomUUID()
    const password = p.password ?? ''
    const bridgeToken = p.bridgeToken?.trim() ?? ''
    if (password || bridgeToken) legacySecrets[id] = { password, bridgeToken }
    return {
      id,
      name: p.name ?? '未命名',
      channel: p.channel === 'relay' ? 'relay' : 'lan',
      agentKind: ['pi', 'codex', 'dsh', 'zcode'].includes(p.agentKind ?? '') ? (p.agentKind as AiAgentKind) : 'opencode',
      baseUrl: normalizeUrl(p.baseUrl ?? ''),
      username: p.username ?? 'opencode',
      password,
      bridgeUrl: normalizeUrl(p.bridgeUrl ?? ''),
      bridgeToken,
      piProjectId: p.piProjectId?.trim() ?? '',
    }
  }
  try {
    const raw = localStorage.getItem(PROFILES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(normalize)
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem('xk.ai.cfg')
    if (raw) {
      const p = JSON.parse(raw) as Partial<AiProfile>
      if (p.baseUrl || p.channel === 'relay') {
        return [
          normalize({
            ...p,
            name: p.channel === 'relay' ? '云中继' : '局域网',
          }),
        ]
      }
    }
  } catch {
    /* ignore */
  }
  return [
    normalize({
      id: crypto.randomUUID(),
      name: '局域网',
      channel: 'lan',
    }),
  ]
}

function loadActiveId(profiles: AiProfile[]): string {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as { activeId?: string }
      if (p.activeId && profiles.some((x) => x.id === p.activeId)) return p.activeId
    }
  } catch {
    /* ignore */
  }
  return profiles[0]?.id ?? ''
}

export const aiProfiles = ref<AiProfile[]>(loadProfiles())
export const activeProfileId = ref(loadActiveId(aiProfiles.value))
export const aiSecretsReady = ref(false)

function persistProfiles(): void {
  writeJSON(
    PROFILES_KEY,
    aiProfiles.value.map(({ password: _password, bridgeToken: _bridgeToken, ...profile }) => profile),
  )
  writeJSON(ACTIVE_KEY, { activeId: activeProfileId.value })
}

async function persistSecrets(): Promise<void> {
  const key = getActiveKey()
  if (!key) throw new Error('数据已锁定，无法保存 AI 凭据')
  const secrets: AiProfileSecrets = {}
  for (const profile of aiProfiles.value) {
    if (profile.password || profile.bridgeToken) {
      secrets[profile.id] = {
        password: profile.password,
        bridgeToken: profile.bridgeToken,
      }
    }
  }
  await commitRepository({ [SECRETS_KEY]: await encryptJSON(key, secrets) }, () => getActiveKey() === key)
}

export async function hydrateAiSecrets(): Promise<void> {
  if (aiSecretsReady.value) return
  const key = getActiveKey()
  if (!key) return
  const stored = readRepository<{ ivB64: string; ctB64: string }>(SECRETS_KEY)
  let secrets: AiProfileSecrets = {}
  if (stored) {
    try {
      secrets = await decryptJSON<AiProfileSecrets>(key, stored.ivB64, stored.ctB64)
    } catch {
      throw new Error('AI 凭据无法解密，请重新填写连接密码和 Bridge Token')
    }
  }
  const needsMigration = Object.keys(legacySecrets).length > 0
  secrets = { ...secrets, ...legacySecrets }
  for (const profile of aiProfiles.value) {
    const secret = secrets[profile.id]
    profile.password = secret?.password ?? ''
    profile.bridgeToken = secret?.bridgeToken ?? ''
  }
  if (needsMigration) await persistSecrets()
  legacySecrets = {}
  persistProfiles()
  try {
    localStorage.removeItem('xk.ai.cfg')
  } catch {
    /* ignore */
  }
  aiSecretsReady.value = true
}

export function clearAiSecretsFromMemory(): void {
  for (const profile of aiProfiles.value) {
    profile.password = ''
    profile.bridgeToken = ''
  }
  aiSecretsReady.value = false
}

export const activeProfile = computed<AiProfile>(
  () =>
    aiProfiles.value.find((p) => p.id === activeProfileId.value) ?? {
      id: '',
      name: '未配置',
      channel: 'lan',
      agentKind: 'opencode',
      baseUrl: '',
      username: 'opencode',
      password: '',
      bridgeUrl: '',
      bridgeToken: '',
      piProjectId: '',
    },
)

export async function upsertProfile(p: AiProfile): Promise<void> {
  const clean: AiProfile = {
    ...p,
    name: p.name.trim() || '配置',
    baseUrl: normalizeUrl(p.baseUrl),
    bridgeUrl: normalizeUrl(p.bridgeUrl),
    bridgeToken: p.bridgeToken.trim(),
    piProjectId: p.piProjectId.trim(),
    username: p.username.trim() || 'opencode',
  }
  const i = aiProfiles.value.findIndex((x) => x.id === clean.id)
  if (i >= 0) aiProfiles.value[i] = clean
  else aiProfiles.value.push(clean)
  activeProfileId.value = clean.id
  await persistSecrets()
  persistProfiles()
}

export function setActiveProfile(id: string): void {
  if (aiProfiles.value.some((x) => x.id === id)) {
    activeProfileId.value = id
    persistProfiles()
  }
}

export function setActivePiProject(projectId: string): void {
  const p = activeProfile.value
  if (p.agentKind !== 'pi') return
  void upsertProfile({ ...p, piProjectId: projectId.trim() })
}

export async function deleteProfile(id: string): Promise<void> {
  if (aiProfiles.value.length <= 1) return
  const i = aiProfiles.value.findIndex((x) => x.id === id)
  if (i >= 0) aiProfiles.value.splice(i, 1)
  if (activeProfileId.value === id) activeProfileId.value = aiProfiles.value[0]?.id ?? ''
  await persistSecrets()
  persistProfiles()
}

export const aiConnected = ref(false)
export const aiVersion = ref('')

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' }
  if (activeProfile.value.password) {
    h.Authorization = `Basic ${btoa(`${activeProfile.value.username}:${activeProfile.value.password}`)}`
  }
  return h
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(activeProfile.value.baseUrl + path, { ...init, headers: { ...headers(), ...(init?.headers as Record<string, string>) } })
  } catch (e) {
    aiConnected.value = false
    const raw = e instanceof Error ? e.message : String(e)
    throw new Error(`无法连接 opencode 服务，请确认已运行 opencode serve 且地址正确（原始错误: ${raw}）`)
  }
  if (res.status === 401) throw new Error('认证失败：请检查用户名与密码（OPENCODE_SERVER_PASSWORD）')
  if (!res.ok) throw new Error(`opencode 请求失败（${res.status}）`)
  aiConnected.value = true
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export async function testConnection(): Promise<string> {
  const r = await req<{ healthy: boolean; version: string }>('/global/health')
  if (!r.healthy) throw new Error('服务返回不健康状态')
  aiConnected.value = true
  aiVersion.value = r.version
  return r.version
}

export interface AiSession {
  id: string
  title?: string
  [key: string]: unknown
}

export interface AiStatusEntry {
  type?: string
  [key: string]: unknown
}

export const listSessions = (): Promise<AiSession[]> => req<AiSession[]>('/session')

export const sessionStatus = (): Promise<Record<string, AiStatusEntry>> =>
  req<Record<string, AiStatusEntry>>('/session/status')

export const createSession = (title?: string): Promise<AiSession> =>
  req<AiSession>('/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })

export const deleteSession = (id: string): Promise<boolean> =>
  req<boolean>(`/session/${id}`, { method: 'DELETE' })

export const abortSession = (id: string): Promise<boolean> =>
  req<boolean>(`/session/${id}/abort`, { method: 'POST' })

export interface AiMessagePart {
  type: string
  text?: string
  [key: string]: unknown
}

export interface AiMessage {
  info: { role: string; id?: string; [key: string]: unknown }
  parts: AiMessagePart[]
}

export const listMessages = (id: string): Promise<AiMessage[]> =>
  req<AiMessage[]>(`/session/${id}/message?limit=50`)

export const sendPromptAsync = (
  id: string,
  text: string,
  opts?: { model?: { providerID: string; modelID: string }; agent?: string },
): Promise<unknown> =>
  req<unknown>(`/session/${id}/prompt_async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parts: [{ type: 'text', text }],
      ...(opts?.model ? { model: opts.model } : {}),
      ...(opts?.agent ? { agent: opts.agent } : {}),
    }),
  })

export const sessionDiff = (id: string): Promise<Record<string, unknown>[]> =>
  req<Record<string, unknown>[]>(`/session/${id}/diff`)

export interface AiProviderModel {
  providerID: string
  modelID: string
  name: string
}

export interface AiAgentInfo {
  name: string
  description?: string
  mode?: string
}

export const listAgents = (): Promise<AiAgentInfo[]> => req<AiAgentInfo[]>('/agent')

export async function listModels(): Promise<AiProviderModel[]> {
  const data = await req<{
    all: { id: string; models: Record<string, { id: string; name?: string }> }[]
  }>('/provider')
  const out: AiProviderModel[] = []
  for (const p of data.all ?? []) {
    for (const key of Object.keys(p.models ?? {})) {
      const m = p.models[key]
      out.push({ providerID: p.id, modelID: m.id ?? key, name: m.name ?? key })
    }
  }
  return out
}

export interface AiFileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  ignored?: boolean
}

export const listFiles = (path: string): Promise<AiFileNode[]> =>
  req<AiFileNode[]>(`/file?path=${encodeURIComponent(path)}`)

export const readFileContent = (path: string): Promise<{ content?: string }> =>
  req<{ content?: string }>(`/file/content?path=${encodeURIComponent(path)}`)

export const shareSession = (id: string): Promise<AiSession> =>
  req<AiSession>(`/session/${id}/share`, { method: 'POST' })

export interface AiTodo {
  id: string
  content: string
  status: string
  [key: string]: unknown
}

export const sessionTodo = (id: string): Promise<AiTodo[]> =>
  req<AiTodo[]>(`/session/${id}/todo`)

export const respondPermissionRemember = (
  sessionId: string,
  permissionId: string,
  response: 'allow' | 'deny' | 'allow_once',
  remember?: boolean,
): Promise<boolean> =>
  req<boolean>(`/session/${sessionId}/permissions/${permissionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(remember === undefined ? { response } : { response, remember }),
  })

export const respondPermission = (
  sessionId: string,
  permissionId: string,
  response: 'allow' | 'deny' | 'allow_once',
): Promise<boolean> =>
  req<boolean>(`/session/${sessionId}/permissions/${permissionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response }),
  })

export interface AiEvent {
  type?: string
  properties?: {
    sessionID?: string
    permissionID?: string
    id?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export async function streamEvents(
  onEvent: (e: AiEvent) => void,
  signal: AbortSignal,
  onOpen?: () => void,
): Promise<void> {
  const res = await fetch(`${activeProfile.value.baseUrl}/event`, {
    headers: { ...headers(), Accept: 'text/event-stream' },
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`事件流连接失败（${res.status}）`)
  onOpen?.()
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      const payload = t.slice(5).trim()
      if (!payload) continue
      try {
        onEvent(JSON.parse(payload) as AiEvent)
      } catch {
        /* 忽略无法解析的事件 */
      }
    }
  }
}


// ============================== 云中继（PocketBase）==============================

const PB_CMD = 'hub_ai_cmd'

async function pb(): Promise<{ base: string; headers: Record<string, string> }> {
  const auth = await ensureSyncAuth()
  if (!auth) throw new Error('云中继需要先在「设置 → 同步」配置 PocketBase 并连接')
  return {
    base: auth.base,
    headers: { Authorization: auth.token, 'Content-Type': 'application/json' },
  }
}

async function pbCreateCmd(type: string, payload: Record<string, unknown>): Promise<string> {
  const { base, headers } = await pb()
  const res = await fetch(`${base}/api/collections/${PB_CMD}/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type, payload, status: 'pending' }),
  })
  if (!res.ok) throw new Error(`中继指令创建失败（${res.status}），请检查 hub_ai_cmd 集合配置`)
  const rec = (await res.json()) as { id: string }
  return rec.id
}

async function pbGetCmd(id: string): Promise<{ status: string; result?: { data?: unknown; error?: string } }> {
  const { base, headers } = await pb()
  const res = await fetch(`${base}/api/collections/${PB_CMD}/records/${id}`, { headers })
  if (!res.ok) throw new Error(`中继指令读取失败（${res.status}）`)
  return (await res.json()) as { status: string; result?: { data?: unknown; error?: string } }
}

async function relayCmd<T>(
  type: string,
  payload: Record<string, unknown>,
  timeoutMs = 10000,
): Promise<T> {
  const id = await pbCreateCmd(type, payload)
  const deadline = Date.now() + timeoutMs
  for (;;) {
    await new Promise((r) => setTimeout(r, 600))
    const rec = await pbGetCmd(id)
    if (rec.status === 'done') {
      if (rec.result?.error) throw new Error(rec.result.error)
      return (rec.result?.data ?? null) as T
    }
    if (Date.now() > deadline) throw new Error('桥接器响应超时（设备离线或未运行 bridge）')
  }
}

export interface AiApi {
  ping(): Promise<string>
  listSessions(): Promise<AiSession[]>
  createSession(title?: string): Promise<AiSession>
  deleteSession(id: string): Promise<unknown>
  abortSession(id: string): Promise<unknown>
  listMessages(id: string): Promise<AiMessage[]>
  sendMessage(
    id: string,
    text: string,
    opts?: { model?: { providerID: string; modelID: string }; agent?: string },
  ): Promise<unknown>
  sessionDiff(id: string): Promise<Record<string, unknown>[]>
  listPiProjects?(): Promise<PiProject[]>
  addPiProject?(name: string, cwd: string): Promise<PiProject>
  selectPiProject?(projectId: string): Promise<PiProject>
  syncPiProject?(projectId: string): Promise<PiProject>
  removePiProject?(projectId: string): Promise<void>
  eventsSince?(since: number): Promise<{ events: Record<string, unknown>[]; seq: number } | null>
}

async function bridgeCmd<T>(type: string, payload: Record<string, unknown>): Promise<T> {
  const p = activeProfile.value
  if (!p.bridgeUrl) throw new Error('请填写桥接地址（bridge 的 HTTP 服务）')
  const bridgeUrl = normalizeUrl(p.bridgeUrl)
  let res: Response
  try {
    res = await fetch(bridgeUrl + '/cmd', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(p.bridgeToken ? { Authorization: `Bearer ${p.bridgeToken}` } : {}),
      },
      body: JSON.stringify({ type, payload }),
    })
  } catch (e) {
    aiConnected.value = false
    throw new Error(`无法连接 bridge（${e instanceof Error ? e.message : '网络错误'}）`)
  }
  if (res.status === 401) {
    aiConnected.value = false
    throw new Error('bridge 认证失败（401）：请确认 Bridge Token 与启动脚本中的 HTTP_TOKEN 完全一致')
  }
  if (!res.ok) {
    aiConnected.value = false
    const failure = (await res.json().catch(() => null)) as { error?: unknown } | null
    const detail = typeof failure?.error === 'string' ? failure.error : ''
    throw new Error(detail || `bridge 请求失败（${res.status}）`)
  }
  aiConnected.value = true
  const data = (await res.json()) as { data?: unknown; error?: string }
  if (data?.error) throw new Error(data.error)
  return (data?.data ?? null) as T
}

function normalizePiMessages(raw: unknown): AiMessage[] {
  const records = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { messages?: unknown }).messages)
      ? ((raw as { messages: unknown[] }).messages)
      : []
  return records.flatMap((m, i) => {
    const rec = m as { role?: string; type?: string; text?: string; content?: unknown; toolName?: string; timestamp?: number }
    const role = String(rec.role ?? rec.type ?? 'assistant').replace(/^message_/i, '')
    const chunks: string[] = []
    if (typeof rec.text === 'string' && rec.text.trim()) chunks.push(rec.text)
    if (typeof rec.content === 'string' && rec.content.trim()) chunks.push(rec.content)
    if (Array.isArray(rec.content)) {
      for (const item of rec.content) {
        if (!item || typeof item !== 'object') continue
        const block = item as { type?: string; text?: string; name?: string; arguments?: { command?: string } }
        if (block.type === 'text' && block.text?.trim()) chunks.push(block.text)
        if (block.type === 'toolCall') {
          const command = block.arguments?.command?.trim()
          chunks.push(`调用工具：${block.name || '未知工具'}${command ? `\n${command}` : ''}`)
        }
      }
    }
    if (chunks.length === 0) return []
    const displayRole = role === 'toolResult' ? 'tool' : role
    const text = (role === 'toolResult' && rec.toolName ? `${rec.toolName}\n${chunks.join('\n')}` : chunks.join('\n')).slice(0, 12000)
    return [{ info: { role: displayRole, id: String(rec.timestamp ?? i) }, parts: [{ type: 'text', text }] }]
  })
}

async function bridgeEvents(since: number, projectId = ''): Promise<{ events: Record<string, unknown>[]; seq: number } | null> {
  const p = activeProfile.value
  if (!p.bridgeUrl) return null
  const bridgeUrl = normalizeUrl(p.bridgeUrl)
  const query = new URLSearchParams({ after: String(since) })
  if (projectId) query.set('projectId', projectId)
  const res = await fetch(
    `${bridgeUrl}/events?${query}`,
    { headers: p.bridgeToken ? { Authorization: `Bearer ${p.bridgeToken}` } : {} },
  )
  if (!res.ok) return null
  return (await res.json()) as { events: Record<string, unknown>[]; seq: number }
}

async function relayPiEvents(since: number): Promise<{ events: Record<string, unknown>[]; seq: number } | null> {
  const auth = await ensureSyncAuth()
  if (!auth) return null
  const filter = encodeURIComponent(`device='${activeProfile.value.name}'`)
  const res = await fetch(
    `${auth.base}/api/collections/hub_ai_evt/records?filter=${filter}&sort=-created&perPage=1`,
    { headers: { Authorization: auth.token } },
  )
  if (!res.ok) return null
  const list = (await res.json()) as { items?: { seq: number; events: unknown }[] }
  const rec = list.items?.[0]
  if (!rec) return { events: [], seq: since }
  if (rec.seq <= since) return { events: [], seq: since }
  const evts = Array.isArray(rec.events) ? (rec.events as Record<string, unknown>[]) : []
  const lastSeq = rec.seq
  return { events: evts.filter((e) => ((e as { seq?: number }).seq ?? 0) > since), seq: lastSeq }
}

export function aiApi(): AiApi {
  const p = activeProfile.value
  let lastPrompt = ''

  if (p.agentKind === 'codex' || p.agentKind === 'dsh' || p.agentKind === 'zcode') {
    const send = (type: string, payload: Record<string, unknown>): Promise<unknown> =>
      p.channel === 'relay' ? relayCmd(type, payload) : bridgeCmd(type, payload)
    const label = { codex: 'codex', dsh: 'DeepSeek Harness', zcode: 'zcode' }[p.agentKind]
    return {
      ping: async () => {
        const s = (await send('ping', {})) as { agent?: string } | null
        return `${label} · ${s?.agent ?? '就绪'}`
      },
      listSessions: async () => [{ id: 'oneshot', title: `${label} · 单发模式` }],
      createSession: async () => ({ id: 'oneshot', title: label }),
      deleteSession: async () => ({}),
      abortSession: async () => {
        await send('exec.abort', {})
      },
      listMessages: async () => {
        const s = (await send('exec.status', {})) as { running?: boolean; output?: string }
        const out: AiMessage[] = []
        if (lastPrompt) {
          out.push({ info: { role: 'user', id: 'p' }, parts: [{ type: 'text', text: lastPrompt }] })
        }
        if (s?.output) {
          out.push({
            info: { role: 'assistant', id: 'a' },
            parts: [{ type: 'text', text: s.output }],
          })
        }
        if (out.length === 0) {
          out.push({
            info: { role: 'assistant', id: 'empty' },
            parts: [{ type: 'text', text: s?.running ? '任务执行中，输出将实时显示…' : '尚无输出，发送任务开始' }],
          })
        }
        return out
      },
      sendMessage: async (_id, text) => {
        lastPrompt = text
        await send('exec.run', { prompt: text })
      },
      sessionDiff: async () => {
        throw new Error(`${label} 单发模式不支持 diff 查看`)
      },
      eventsSince: p.channel === 'relay' ? (since) => relayPiEvents(since) : (since) => bridgeEvents(since),
    }
  }

  if (p.agentKind === 'pi') {
    const send = (type: string, payload: Record<string, unknown>): Promise<unknown> =>
      p.channel === 'relay' ? relayCmd(type, payload) : bridgeCmd(type, payload)
    const projectPayload = (payload: Record<string, unknown> = {}): Record<string, unknown> => {
      if (!p.piProjectId) throw new Error('请先选择 pi 项目')
      return { ...payload, projectId: p.piProjectId }
    }
    const sendProject = (type: string, payload: Record<string, unknown> = {}): Promise<unknown> =>
      send(type, projectPayload(payload))
    const projectSessionId = `pi:${p.piProjectId}`
    return {
      ping: async () => {
        const info = (await send('ping', {})) as { projects?: number; capabilities?: string[] } | null
        const mode = info?.capabilities?.includes('pi.tui') ? '原生 TUI' : '多项目 bridge'
        return `pi · ${mode}${typeof info?.projects === 'number' ? ` · ${info.projects} 个项目` : ''}`
      },
      listPiProjects: () => send('pi.projects.list', {}) as Promise<PiProject[]>,
      addPiProject: (name, cwd) => send('pi.projects.add', { name, cwd }) as Promise<PiProject>,
      selectPiProject: (projectId) => send('pi.projects.select', { projectId }) as Promise<PiProject>,
      syncPiProject: (projectId) => send('pi.sync', { projectId }) as Promise<PiProject>,
      removePiProject: async (projectId) => {
        await send('pi.projects.remove', { projectId })
      },
      listSessions: async () => {
        if (!p.piProjectId) return []
        const s = (await sendProject('pi.state')) as {
          sessionName?: string
          model?: { providerID?: string; provider?: string; id?: string }
          messageCount?: number
          isStreaming?: boolean
          streaming?: boolean
        } | null
        return [
          {
            id: projectSessionId,
            title: 'pi · ' + (s?.sessionName || s?.model?.id || '会话'),
            status: s?.isStreaming || s?.streaming ? 'busy' : 'idle',
          },
        ]
      },
      createSession: async () => {
        await sendProject('pi.new_session')
        return { id: projectSessionId, title: '新会话' }
      },
      deleteSession: async () => ({}),
      abortSession: async () => {
        await sendProject('pi.abort')
      },
      listMessages: async () => {
        const raw = await sendProject('pi.messages')
        return normalizePiMessages(raw)
      },
      sendMessage: async (_id, text) => {
        await sendProject('pi.prompt', { message: text })
      },
      sessionDiff: async () => {
        throw new Error('pi 适配器暂不支持 diff 查看')
      },
      eventsSince: (since) =>
        p.piProjectId ? (p.channel === 'relay' ? relayPiEvents(since) : bridgeEvents(since, p.piProjectId)) : Promise.resolve(null),
    }
  }

  if (p.channel === 'relay') {
    return {
      ping: async () => {
        const t0 = Date.now()
        await relayCmd('ping', {}, 8000)
        return `中继往返 ${Date.now() - t0}ms`
      },
      listSessions: () => relayCmd<AiSession[]>('sessions.list', {}),
      createSession: (title) => relayCmd<AiSession>('session.create', { title }),
      deleteSession: (id) => relayCmd('session.delete', { id }),
      abortSession: (id) => relayCmd('session.abort', { id }),
      listMessages: (id) => relayCmd<AiMessage[]>('messages.list', { id }),
      sendMessage: (id, text, opts) => relayCmd('send.async', { id, text, ...opts }),
      sessionDiff: (id) => relayCmd<Record<string, unknown>[]>('diff', { id }),
    }
  }
  return {
    ping: async () => testConnection(),
    listSessions,
    createSession,
    deleteSession,
    abortSession,
    listMessages,
    sendMessage: sendPromptAsync,
    sessionDiff,
  }
}

export async function dispatchToAgent(title: string, notes: string): Promise<void> {
  if (!aiConnected.value) {
    await aiApi().ping()
  }
  const sessions = await aiApi().listSessions()
  let target = sessions[0]
  if (!target) {
    target = await aiApi().createSession('Hub 任务')
  }
  let prompt = '请完成以下任务：\n' + title
  if (notes.trim()) prompt += '\n\n' + notes
  prompt += '\n\n完成后请简要总结。'
  await aiApi().sendMessage(target.id, prompt)
}
