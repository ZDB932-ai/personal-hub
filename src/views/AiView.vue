<script setup lang="ts">
import { confirmAction } from '@/lib/confirmAction'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Bot,
  Cable,
  Check,
  FileText,
  Folder,
  ListTodo,
  Plus,
  RefreshCw,
  Send,
  Share2,
  ShieldAlert,
  Square,
  Trash2,
  X,
} from '@lucide/vue'
import {
  aiApi,
  aiConnected,
  activeProfile,
  activeProfileId,
  aiProfiles,
  hydrateAiSecrets,
  setActivePiProject,
  setActiveProfile,
  aiVersion,
  listAgents,
  listFiles,
  listModels,
  readFileContent,
  respondPermissionRemember,
  sessionStatus,
  sessionTodo,
  shareSession,
  streamEvents,
  type AiAgentInfo,
  type AiEvent,
  type AiFileNode,
  type AiMessage,
  type AiProviderModel,
  type AiSession,
  type AiStatusEntry,
  type PiProject,
} from '@/lib/aiopencode'
import AppSelect from '@/components/AppSelect.vue'
import AiConfigModal from '@/components/AiConfigModal.vue'
import PiProjectModal from '@/components/PiProjectModal.vue'
import PageHeader from '@/components/PageHeader.vue'
import { buildAgentResourcePrompt, getAgentResource, markAgentResourceUsed } from '@/stores/agentResources'
import { toast } from '@/lib/toast'

const route = useRoute()
const router = useRouter()
const showConfig = ref(false)
const showPiProjectModal = ref(false)
const sessions = ref<AiSession[]>([])
const statusMap = ref<Record<string, AiStatusEntry>>({})
const selectedId = ref<string | null>(null)
const messages = ref<AiMessage[]>([])
const msgLoading = ref(false)
const input = ref('')
const sending = ref(false)
const events = ref<{ type: string; sessionID?: string; at: number }[]>([])
const piEvtSeq = ref(0)
const diffFiles = ref<Record<string, unknown>[]>([])
const showDiff = ref(false)
const permDone = ref(new Set<string>())
const permCards = ref<
  { key: string; sessionID: string; permissionID: string; title: string; at: number }[]
>([])
const permHistory = ref<{ title: string; allow: boolean; at: number }[]>([])
const todos = ref<{ id: string; content: string; status: string }[]>([])
const todoOpen = ref(false)
const streamingText = ref('')
const streamingActive = ref(false)
const aiModels = ref<AiProviderModel[]>([])
const selectedModel = ref<{ providerID: string; modelID: string } | null>(null)
const aiAgentList = ref<AiAgentInfo[]>([])
const selectedAgent = ref('')
const filesPath = ref('')
const files = ref<AiFileNode[]>([])
const filesLoading = ref(false)
const showFiles = ref(false)
const fileView = ref<{ name: string; content: string } | null>(null)
const templates = ref<string[]>(JSON.parse(localStorage.getItem('xk.ai.templates.v1') ?? '[]'))
const shareBusy = ref(false)
const piProjects = ref<PiProject[]>([])
const piProjectsLoading = ref(false)
const piSyncing = ref(false)
const pendingResourcePrompt = ref<{ id: string; name: string; prompt: string } | null>(null)

let evtCtrl: AbortController | null = null
let pollTimer: ReturnType<typeof setInterval> | undefined

const selected = computed(() => sessions.value.find((s) => s.id === selectedId.value) ?? null)
const sessionTitle = (s: AiSession): string => (typeof s.title === 'string' && s.title ? s.title : s.id.slice(0, 8))
const isRunning = (id: string): boolean => statusMap.value[id]?.type === 'busy' || statusMap.value[id]?.type === 'running'
const isPiProfile = computed(() => activeProfile.value.agentKind === 'pi')
const activePiProject = computed(() => piProjects.value.find((project) => project.id === activeProfile.value.piProjectId) ?? null)
const hasSelectedPiProject = computed(() => Boolean(activePiProject.value))
const profileConfigured = computed(() => {
  const p = activeProfile.value
  return p.channel === 'relay' || (p.agentKind === 'opencode' ? Boolean(p.baseUrl) : Boolean(p.bridgeUrl))
})

async function connect(): Promise<void> {
  try {
    aiVersion.value = await aiApi().ping()
    aiConnected.value = true
    if (isPiProfile.value) {
      await refreshPiProjects()
      if (activeProfile.value.piProjectId && !activePiProject.value) {
        setActivePiProject('')
        return
      }
      if (activeProfile.value.piProjectId) await syncPiSession(true)
    }
    await refreshSessions()
    restartStream()
    if (activeProfile.value.channel === 'lan' && activeProfile.value.agentKind === 'opencode') {
      void listModels().then((m) => (aiModels.value = m)).catch(() => {})
      void listAgents().then((a) => (aiAgentList.value = a)).catch(() => {})
    }
  } catch (e) {
    aiConnected.value = false
    toast(e instanceof Error ? e.message : '连接失败', 'error')
  }
}

async function refreshSessions(): Promise<void> {
  try {
    sessions.value = await aiApi().listSessions()
    statusMap.value = {}
    if (activeProfile.value.channel === 'lan' && activeProfile.value.agentKind === 'opencode') {
      try {
        statusMap.value = await sessionStatus()
      } catch {
        /* ignore */
      }
    } else if (isPiProfile.value) {
      statusMap.value = Object.fromEntries(
        sessions.value.map((session) => [session.id, { type: String(session.status ?? 'idle') }]),
      )
    }
  } catch (e) {
    toast(e instanceof Error ? e.message : '加载会话失败', 'error')
  }
}

async function refreshPiProjects(silent = false): Promise<void> {
  if (!isPiProfile.value) {
    piProjects.value = []
    return
  }
  const api = aiApi()
  if (!api.listPiProjects) return
  piProjectsLoading.value = true
  try {
    piProjects.value = await api.listPiProjects()
  } catch (e) {
    if (!silent) toast(e instanceof Error ? e.message : '加载 pi 项目失败', 'error')
  } finally {
    piProjectsLoading.value = false
  }
}

async function refreshWorkspace(): Promise<void> {
  if (isPiProfile.value) {
    await syncPiSession()
    await refreshPiProjects()
  }
  await refreshSessions()
  if (selectedId.value) await loadMessages(selectedId.value, true)
}

async function syncPiSession(silent = false): Promise<void> {
  const projectId = activeProfile.value.piProjectId
  if (!isPiProfile.value || !projectId || piSyncing.value) return
  const api = aiApi()
  if (!api.syncPiProject) return
  piSyncing.value = true
  try {
    await api.syncPiProject(projectId)
    if (!silent) toast('已从 session 文件同步最新分支')
  } catch (e) {
    if (!silent) toast(e instanceof Error ? e.message : '同步会话失败', 'error')
  } finally {
    piSyncing.value = false
  }
}

async function selectPiProject(projectId: string): Promise<void> {
  if (!projectId || projectId === activeProfile.value.piProjectId) return
  const api = aiApi()
  if (!api.selectPiProject) {
    toast('当前 Agent 不支持 pi 项目管理', 'error')
    return
  }
  try {
    await api.selectPiProject(projectId)
    setActivePiProject(projectId)
    toast('已切换 pi 项目')
  } catch (e) {
    toast(e instanceof Error ? e.message : '切换项目失败', 'error')
  }
}

async function handlePiProjectCreated(project: PiProject): Promise<void> {
  await refreshPiProjects(true)
  await selectPiProject(project.id)
}

async function removeActivePiProject(): Promise<void> {
  const project = activePiProject.value
  if (!project) return
  if (!await confirmAction(`确定移除项目「${project.name}」吗？这会停止该项目的 pi 进程，但不会删除任何文件或历史记录。`)) return
  const api = aiApi()
  if (!api.removePiProject) {
    toast('当前 Agent 不支持 pi 项目管理', 'error')
    return
  }
  try {
    await api.removePiProject(project.id)
    piProjects.value = piProjects.value.filter((item) => item.id !== project.id)
    if (activeProfile.value.piProjectId === project.id) setActivePiProject('')
    toast('已移除 pi 项目')
  } catch (e) {
    toast(e instanceof Error ? e.message : '移除项目失败', 'error')
  }
}

const evtConnected = ref(false)
let streamGen = 0

function pushEvent(evt: AiEvent): void {
  evtConnected.value = true
  const type = String(evt.type ?? 'unknown')
  const props = (evt.properties ?? {}) as {
    sessionID?: string
    permissionID?: string
    id?: string
    type?: string
    title?: string
    part?: { type?: string; text?: string }
    [key: string]: unknown
  }
  const sessionID = props.sessionID
  events.value.unshift({ type, sessionID, at: Date.now() })
  if (events.value.length > 40) events.value.pop()

  if (type.includes('permission')) {
    const pid = props.permissionID ?? props.id ?? ''
    const key = sessionID + '/' + pid
    if (pid && !permCards.value.some((c) => c.key === key) && !permDone.value.has(key)) {
      permCards.value.unshift({
        key,
        sessionID: sessionID ?? '',
        permissionID: pid,
        title: props.title ?? props.type ?? '权限请求',
        at: Date.now(),
      })
      if (permCards.value.length > 10) permCards.value.pop()
      toast('opencode 正在请求权限，请到工作台处理', 'error')
    }
  }

  if (type.includes('message.part.updated') && props.part) {
    if (props.part.type === 'text' && typeof props.part.text === 'string') {
      streamingText.value = props.part.text
      if (!streamingActive.value) streamingActive.value = true
      void nextTick(() => {
        if (msgScroll.value) msgScroll.value.scrollTop = msgScroll.value.scrollHeight
      })
    }
    if (sessionID === selectedId.value) {
      const t = String(props.type ?? '')
      if (t && !streamingActive.value) {
        streamingActive.value = true
        streamingText.value = ''
      }
    }
  }

  if (
    type.includes('message.updated') ||
    type.includes('message.part.updated') ||
    type.includes('session.status') ||
    type.includes('session.idle')
  ) {
    if (type.includes('idle') || type.includes('session.status')) {
      if (streamingActive.value) {
        streamingActive.value = false
        streamingText.value = ''
      }
    }
    if (sessionID && sessionID === selectedId.value && type.includes('message.')) {
      void loadMessages(sessionID, true)
    }
    if (sessionID && sessionID === selectedId.value && type.includes('session.idle')) {
      void loadTodos(sessionID)
    }
  }

  if (type.includes('session.') && !sessionID) {
    void refreshSessions()
  }
}

async function loadTodos(id: string): Promise<void> {
  try {
    todos.value = await sessionTodo(id)
  } catch {
    todos.value = []
  }
}

function restartStream(): void {
  evtCtrl?.abort()
  if (
    activeProfile.value.channel !== 'lan' ||
    activeProfile.value.agentKind !== 'opencode' ||
    !activeProfile.value.baseUrl
  ) {
    return
  }
  const gen = ++streamGen
  evtCtrl = new AbortController()
  void (async () => {
    while (gen === streamGen && !evtCtrl.signal.aborted) {
      try {
        await streamEvents(pushEvent, evtCtrl.signal, () => {
          evtConnected.value = true
        })
        evtConnected.value = false
      } catch {
        evtConnected.value = false
      }
      if (gen !== streamGen || evtCtrl.signal.aborted) break
      await new Promise((r) => setTimeout(r, 3000))
    }
  })()
}

const msgScroll = ref<HTMLElement | null>(null)

async function loadMessages(id: string, silent = false): Promise<void> {
  if (!silent) msgLoading.value = true
  try {
    const before = messages.value.length
    messages.value = await aiApi().listMessages(id)
    const last = messages.value[messages.value.length - 1]
    const grew = messages.value.length !== before || (last && JSON.stringify(last).length > 0)
    if (!silent || grew) {
      await nextTick()
      if (msgScroll.value) msgScroll.value.scrollTop = msgScroll.value.scrollHeight
    }
  } catch (e) {
    if (!silent) toast(e instanceof Error ? e.message : '消息加载失败', 'error')
  } finally {
    if (!silent) msgLoading.value = false
  }
}

function selectSession(id: string): void {
  selectedId.value = id
  showDiff.value = false
  streamingActive.value = false
  streamingText.value = ''
  applyPendingResourcePrompt()
  void loadMessages(id)
  void loadTodos(id)
}

function clearResourceQuery(): void {
  const nextQuery = { ...route.query }
  delete nextQuery.resource
  void router.replace({ query: nextQuery })
}

function applyPendingResourcePrompt(): void {
  const pending = pendingResourcePrompt.value
  if (!pending || !selectedId.value) return
  input.value = input.value.trim() ? `${input.value.trim()}\n\n${pending.prompt}` : pending.prompt
  markAgentResourceUsed(pending.id)
  pendingResourcePrompt.value = null
  toast(`已将「${pending.name}」带入输入框，确认后再发送`)
}

function receiveResourceHandoff(): void {
  const resourceId = typeof route.query.resource === 'string' ? route.query.resource : ''
  if (!resourceId) return
  const resource = getAgentResource(resourceId)
  clearResourceQuery()
  if (!resource) {
    toast('这项资源已不存在', 'error')
    return
  }
  pendingResourcePrompt.value = {
    id: resource.id,
    name: resource.name,
    prompt: buildAgentResourcePrompt(resource),
  }
  if (selectedId.value) applyPendingResourcePrompt()
  else toast(`已准备「${resource.name}」，选择或新建会话后即可带入`)
}

function messageRoleLabel(role: string): string {
  if (role === 'user') return '用户'
  if (role === 'tool') return '工具'
  return isPiProfile.value ? 'PI' : '助手'
}

async function newSession(): Promise<void> {
  try {
    const s = await aiApi().createSession(`Hub ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`)
    await refreshSessions()
    selectSession(s.id)
    toast('会话已创建')
  } catch (e) {
    toast(e instanceof Error ? e.message : '创建失败', 'error')
  }
}

async function removeSession(id: string): Promise<void> {
  if (!await confirmAction('确定删除该会话及其全部消息吗？')) return
  try {
    await aiApi().deleteSession(id)
    if (selectedId.value === id) selectedId.value = null
    await refreshSessions()
    toast('会话已删除')
  } catch (e) {
    toast(e instanceof Error ? e.message : '删除失败', 'error')
  }
}

async function send(): Promise<void> {
  const id = selectedId.value
  const text = input.value.trim()
  if (!id || !text || sending.value) return
  sending.value = true
  try {
    await aiApi().sendMessage(id, text, {
      model: selectedModel.value ?? undefined,
      agent: selectedAgent.value || undefined,
    })
    input.value = ''
    toast('已发送')
    streamingActive.value = true
    streamingText.value = ''
    setTimeout(() => void loadMessages(id), 1200)
  } catch (e) {
    toast(e instanceof Error ? e.message : '发送失败', 'error')
  } finally {
    sending.value = false
  }
}

async function abort(): Promise<void> {
  const id = selectedId.value
  if (!id) return
  try {
    await aiApi().abortSession(id)
    streamingActive.value = false
    streamingText.value = ''
    toast('已中止')
  } catch (e) {
    toast(e instanceof Error ? e.message : '中止失败', 'error')
  }
}

async function loadDiff(): Promise<void> {
  const id = selectedId.value
  if (!id) return
  try {
    diffFiles.value = await aiApi().sessionDiff(id)
    showDiff.value = !showDiff.value
  } catch (e) {
    toast(e instanceof Error ? e.message : 'diff 获取失败', 'error')
  }
}

async function approve(
  sessionID: string,
  key: string,
  permissionID: string,
  title: string,
  allow: boolean,
  remember: boolean,
): Promise<void> {
  try {
    await respondPermissionRemember(sessionID, permissionID, allow ? 'allow' : 'deny', remember)
    permDone.value = new Set([...permDone.value, key])
    permCards.value = permCards.value.filter((c) => c.key !== key)
    permHistory.value.unshift({ title, allow, at: Date.now() })
    if (permHistory.value.length > 20) permHistory.value.pop()
    toast(remember ? `已${allow ? '批准' : '拒绝'}并记住` : allow ? '已批准' : '已拒绝')
    if (selectedId.value) void loadMessages(selectedId.value, true)
  } catch (e) {
    toast(e instanceof Error ? e.message : '操作失败', 'error')
  }
}

async function doShare(): Promise<void> {
  const id = selectedId.value
  if (!id || shareBusy.value) return
  shareBusy.value = true
  try {
    const shared = await shareSession(id)
    const raw = JSON.stringify(shared)
    const m = raw.match(/https:\/\/[^"]+/)
    if (m) {
      await navigator.clipboard.writeText(m[0]).catch(() => {})
      toast('分享链接已复制')
    } else {
      toast('已开启分享')
    }
  } catch (e) {
    toast(e instanceof Error ? e.message : '分享失败', 'error')
  } finally {
    shareBusy.value = false
  }
}

async function openFiles(): Promise<void> {
  showFiles.value = !showFiles.value
  if (showFiles.value && files.value.length === 0) await browseFiles('')
}

async function browseFiles(path: string): Promise<void> {
  filesLoading.value = true
  filesPath.value = path
  try {
    files.value = await listFiles(path || '.')
  } catch (e) {
    toast(e instanceof Error ? e.message : '文件列表获取失败', 'error')
  } finally {
    filesLoading.value = false
  }
}

async function viewFile(node: AiFileNode): Promise<void> {
  try {
    const res = await readFileContent(node.path)
    fileView.value = { name: node.name, content: (res.content ?? '').slice(0, 20000) }
  } catch (e) {
    toast(e instanceof Error ? e.message : '读取失败', 'error')
  }
}

function saveTemplate(): void {
  const text = input.value.trim()
  if (!text) return
  if (templates.value.includes(text)) return
  templates.value = [...templates.value, text].slice(-12)
  localStorage.setItem('xk.ai.templates.v1', JSON.stringify(templates.value))
  toast('已保存为常用指令')
}

function removeTemplate(i: number): void {
  templates.value = templates.value.filter((_, idx) => idx !== i)
  localStorage.setItem('xk.ai.templates.v1', JSON.stringify(templates.value))
}

onMounted(async () => {
  try {
    await hydrateAiSecrets()
  } catch (e) {
    toast(e instanceof Error ? e.message : 'AI 凭据读取失败', 'error')
  }
  if (profileConfigured.value) void connect()
  pollTimer = setInterval(() => {
    const p = activeProfile.value
    if (p.channel === 'lan' && p.agentKind === 'opencode') {
      void sessionStatus()
        .then((m) => {
          statusMap.value = m
          aiConnected.value = true
          if (!evtConnected.value) restartStream()
        })
        .catch(() => {
          aiConnected.value = false
        })
    }
    if (p.agentKind === 'pi' && p.piProjectId) {
      void refreshSessions()
      void aiApi()
        .eventsSince?.(piEvtSeq.value)
        .then((r) => {
          if (!r) return
          piEvtSeq.value = Math.max(piEvtSeq.value, r.seq)
          if (r.events.length === 0) return
          for (const e of r.events) {
            const rec = e as { type?: string; sessionID?: string; at?: number; delta?: string }
            if (rec.type === 'message_update' && rec.delta) {
              streamingActive.value = true
              streamingText.value += rec.delta
            }
            if (rec.type === 'agent_start') {
              streamingActive.value = true
              streamingText.value = ''
            }
            if (rec.type === 'agent_settled') {
              streamingActive.value = false
              streamingText.value = ''
            }
            events.value.unshift({ type: String(rec.type ?? 'pi.event'), sessionID: rec.sessionID, at: rec.at ?? Date.now() })
          }
          if (events.value.length > 40) events.value.length = 40
          if (selectedId.value) void loadMessages(selectedId.value, true)
        })
        .catch(() => {})
    }
    if (selectedId.value) void loadMessages(selectedId.value, true)
  }, 3000)
})

onUnmounted(() => {
  evtCtrl?.abort()
  if (pollTimer) clearInterval(pollTimer)
})

watch(
  () => route.query.resource,
  () => receiveResourceHandoff(),
  { immediate: true },
)

watch(
  () => [
    activeProfileId.value,
    activeProfile.value.channel,
    activeProfile.value.agentKind,
    activeProfile.value.baseUrl,
    activeProfile.value.username,
    activeProfile.value.password,
    activeProfile.value.bridgeUrl,
    activeProfile.value.bridgeToken,
    activeProfile.value.piProjectId,
  ],
  () => {
    evtCtrl?.abort()
    evtConnected.value = false
    aiConnected.value = false
    aiVersion.value = ''
    sessions.value = []
    statusMap.value = {}
    selectedId.value = null
    messages.value = []
    events.value = []
    piEvtSeq.value = 0
    todos.value = []
    diffFiles.value = []
    showDiff.value = false
    if (!isPiProfile.value) piProjects.value = []
    if (profileConfigured.value) void connect()
  },
)
</script>

<template>
  <div>
    <PageHeader title="AI 工作台" eyebrow="AI 与扩展" description="连接自己的 Agent，处理任务、查看进度与管理权限请求。">
      <template #actions>
        <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div class="min-w-32 flex-1 sm:w-36">
            <AppSelect
              :model-value="activeProfileId"
              :options="aiProfiles.map((p) => ({ value: p.id, label: p.name }))"
              size="sm"
              @update:model-value="setActiveProfile($event as string)"
            />
          </div>
          <span
            class="flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs"
            :class="aiConnected ? 'border-ok/30 bg-ok/10 text-ok' : 'border-line bg-surface text-t4'"
          >
            <span class="h-2 w-2 rounded-full" :class="aiConnected ? 'bg-ok' : 'bg-t4'"></span>
            {{ aiConnected ? `已连接 ${aiVersion}` : '未连接' }}
          </span>
          <button class="ui-secondary-button gap-1.5" @click="showConfig = true">
            <Cable class="h-4 w-4" />
            连接设置
          </button>
        </div>
      </template>
    </PageHeader>

    <div v-if="!profileConfigured" class="empty-state mt-8">
      <Bot class="mx-auto h-10 w-10 text-t4" />
      <p class="mt-4 text-sm font-medium text-t2">尚未配置当前 Agent</p>
      <p class="mt-1 text-xs text-t4">
        点击「连接设置」填入{{ activeProfile.agentKind === 'opencode' ? ' opencode serve' : ' bridge' }}地址开始使用
      </p>
      <button class="ui-primary-button mt-4" @click="showConfig = true">连接设置</button>
    </div>


    <div v-else class="mt-6">
      <section v-if="isPiProfile" class="control-bar mt-4 border-t">
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-1.5 text-sm font-semibold text-t2">
            <Folder class="h-4 w-4 text-primary" />
            Pi 项目
          </p>
          <p class="mt-0.5 text-[11px] text-t4">这里与电脑终端使用同一场 pi 会话，两边操作会实时同步。</p>
        </div>
        <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div class="min-w-0 flex-1 sm:w-64">
            <AppSelect
              :model-value="activeProfile.piProjectId"
              :options="piProjects.map((project) => ({ value: project.id, label: project.running ? `${project.name} · 运行中` : project.name }))"
              placeholder="选择项目"
              size="sm"
              :disabled="piProjectsLoading || piProjects.length === 0"
              @update:model-value="selectPiProject(String($event))"
            />
          </div>
          <button
            type="button"
            class="ui-secondary-button gap-1 text-xs"
            @click="showPiProjectModal = true"
          >
            <Plus class="h-3.5 w-3.5" />
            添加项目
          </button>
          <button
            v-if="activePiProject"
            type="button"
            :disabled="piSyncing"
            class="ui-secondary-button gap-1 text-xs disabled:opacity-50"
            @click="refreshWorkspace"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="piSyncing ? 'animate-spin' : ''" />
            刷新状态
          </button>
          <button
            v-if="activePiProject"
            type="button"
            aria-label="移除当前 pi 项目"
            class="ui-icon-button border-danger/30 text-danger hover:bg-danger/10 hover:text-danger"
            @click="removeActivePiProject"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>
        <p v-if="activePiProject" class="w-full font-mono text-[10px] text-t4 break-all">
          {{ activePiProject.cwd }}
        </p>
      </section>

      <div v-if="isPiProfile && !hasSelectedPiProject" class="empty-state mt-6">
        <Folder class="mx-auto h-10 w-10 text-t4" />
        <p class="mt-4 text-sm font-medium text-t2">尚未选择 pi 项目</p>
        <p class="mt-1 text-xs text-t4">选择一个项目目录，即可在该目录中开始独立的 pi 会话。</p>
        <button
          type="button"
          class="ui-primary-button mt-4"
          @click="showPiProjectModal = true"
        >
          添加项目
        </button>
      </div>

      <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-[260px,minmax(0,1fr)]">
      <div class="border-t border-line pt-3 lg:border-r lg:border-t-0 lg:pr-4 lg:pt-0" :class="selectedId ? 'hidden lg:block' : 'block'">
        <div class="flex items-center gap-2">
          <button
            class="ui-primary-button flex-1 gap-1.5"
            @click="newSession"
          >
            <Plus class="h-4 w-4" />
            新会话
          </button>
          <button
            class="ui-icon-button"
            aria-label="刷新会话"
            @click="refreshWorkspace"
          >
            <RefreshCw class="h-4 w-4" />
          </button>
        </div>
        <div v-if="pendingResourcePrompt" class="ai-resource-handoff mt-3">
          <div class="min-w-0">
            <p class="text-xs font-semibold text-t2">准备使用「{{ pendingResourcePrompt.name }}」</p>
            <p class="mt-1 text-[11px] leading-relaxed text-t3">会把调用说明放进输入框，不会自动安装、启动或发送。</p>
          </div>
          <button type="button" class="ui-secondary-button shrink-0 text-xs" @click="newSession">新建会话并带入</button>
        </div>
        <div class="mt-3 border-y border-line">
          <button
            v-for="s in sessions"
            :key="s.id"
            class="min-h-16 w-full border-b border-line p-3 text-left transition-colors duration-150 last:border-b-0"
            :class="selectedId === s.id ? 'border-l-2 border-l-primary bg-surface-2' : 'hover:bg-surface'"
            @click="selectSession(s.id)"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-sm font-medium text-t1">{{ sessionTitle(s) }}</span>
              <span
                class="h-2 w-2 shrink-0 rounded-full"
                :class="isRunning(s.id) ? 'bg-warn' : 'bg-t4'"
                :title="isRunning(s.id) ? '运行中' : '空闲'"
              ></span>
            </div>
            <p class="mt-0.5 font-mono text-[10px] text-t4">{{ s.id.slice(0, 12) }}…</p>
          </button>
        </div>
        <p v-if="sessions.length === 0" class="mt-4 text-center text-xs text-t4">暂无会话，点击上方新建</p>
      </div>

      <div v-if="selected" :class="selectedId ? 'block' : 'hidden lg:block'">
        <div class="rounded-xl border border-line bg-surface">
          <div class="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <button
              class="ui-icon-button lg:hidden"
              aria-label="返回会话列表"
              @click="selectedId = null"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="m15 18-6-6 6-6" stroke-linecap="round" /></svg>
            </button>
            <p class="min-w-0 flex-1 truncate text-sm font-semibold text-t1">{{ sessionTitle(selected) }}</p>
            <button
              v-if="isRunning(selected.id)"
              class="ui-danger-button min-h-9 gap-1 px-2.5 text-xs"
              @click="abort"
            >
              <Square class="h-3 w-3" />
              中止
            </button>
            <button
              v-if="activeProfile.agentKind !== 'pi'"
              class="ui-icon-button border-danger/30 text-danger hover:bg-danger/10 hover:text-danger"
              aria-label="删除会话"
              @click="removeSession(selected.id)"
            >
              <Trash2 class="h-4 w-4" />
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
            <AppSelect
              v-if="aiModels.length > 0"
              :model-value="selectedModel ? selectedModel.providerID + '/' + selectedModel.modelID : ''"
              :options="[{ value: '', label: '默认模型' }, ...aiModels.map((m) => ({ value: m.providerID + '/' + m.modelID, label: m.name }))]"
              size="sm"
              class="max-w-52"
              @update:model-value="(v: string | number) => {
                const value = String(v)
                const [pid, ...rest] = value.split('/')
                selectedModel = value ? { providerID: pid, modelID: rest.join('/') } : null
              }"
            />
            <AppSelect
              v-if="aiAgentList.length > 0"
              :model-value="selectedAgent"
              :options="[{ value: '', label: '默认 Agent' }, ...aiAgentList.map((a) => ({ value: a.name, label: a.description || a.name }))]"
              size="sm"
              class="max-w-44"
              @update:model-value="(v: string | number) => (selectedAgent = String(v))"
            />
            <span class="flex-1"></span>
            <button
              v-if="activeProfile.agentKind === 'opencode'"
              class="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-t4 transition-colors duration-150 hover:text-primary"
              @click="openFiles"
            >
              <Folder class="h-3.5 w-3.5" />
              文件
            </button>
            <button
              v-if="activeProfile.agentKind === 'opencode'"
              class="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-t4 transition-colors duration-150 hover:text-primary"
              :disabled="shareBusy"
              @click="doShare"
            >
              <Share2 class="h-3.5 w-3.5" />
              分享
            </button>
          </div>

          <div ref="msgScroll" class="max-h-[46vh] min-h-[240px] space-y-3 overflow-y-auto p-4">
            <p v-if="msgLoading" class="text-center text-xs text-t4">加载消息中…</p>
            <p v-else-if="messages.length === 0 && !streamingActive" class="py-8 text-center text-xs text-t4">
              会话为空，在下方输入框派发第一个任务
            </p>
            <div
              v-for="(m, i) in messages"
              :key="m.info.id ?? i"
              class="flex"
              :class="m.info.role === 'user' ? 'justify-end' : 'justify-start'"
            >
              <div
                class="max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words"
                :class="m.info.role === 'user' ? 'bg-primary/15 text-t1' : 'bg-inset text-t2'"
              >
                <p class="mb-1 text-[10px] font-semibold uppercase tracking-wide" :class="m.info.role === 'user' ? 'text-primary' : 'text-t4'">
                  {{ messageRoleLabel(m.info.role) }}
                </p>
                <template v-for="(p, pi) in m.parts" :key="pi">
                  <span v-if="p.type === 'text' && p.text">{{ p.text }}</span>
                  <span v-else-if="p.type !== 'text'" class="mr-1 inline-block rounded bg-surface-2 px-1 text-[10px] text-t4">[{{ p.type }}]</span>
                </template>
              </div>
            </div>
            <div v-if="streamingActive" class="flex justify-start">
              <div class="max-w-[85%] rounded-xl bg-inset px-3.5 py-2.5 text-xs leading-relaxed text-t2">
                <p class="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  assistant
                  <span class="inline-flex gap-0.5">
                    <span class="h-1 w-1 animate-bounce rounded-full bg-primary" style="animation-delay: 0ms"></span>
                    <span class="h-1 w-1 animate-bounce rounded-full bg-primary" style="animation-delay: 150ms"></span>
                    <span class="h-1 w-1 animate-bounce rounded-full bg-primary" style="animation-delay: 300ms"></span>
                  </span>
                </p>
                <p class="whitespace-pre-wrap break-words">{{ streamingText }}<span class="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-primary align-middle"></span></p>
              </div>
            </div>
          </div>

          <div v-if="templates.length > 0" class="flex flex-wrap items-center gap-1.5 border-t border-line px-4 pt-2.5">
            <button
              v-for="(t, i) in templates"
              :key="i"
              class="group flex min-h-9 max-w-56 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-[11px] text-t3 transition-colors duration-150 hover:border-primary/40 hover:text-primary"
              :title="t"
              @click="input = t"
            >
              <span class="min-w-0 truncate">{{ t }}</span>
              <X class="h-3 w-3 shrink-0 hover:text-danger" @click.stop="removeTemplate(i)" />
            </button>
          </div>

          <div class="flex items-center gap-2 border-t border-line p-3">
            <input
              v-model="input"
              placeholder="派发任务给 agent…"
              class="control-input min-w-0 flex-1 bg-inset px-3"
              @keydown.enter="send"
            />
            <button
              :disabled="!input.trim()"
              class="ui-icon-button shrink-0 disabled:opacity-40"
              aria-label="保存为常用指令"
              @click="saveTemplate"
            >
              <Plus class="h-4 w-4" />
            </button>
            <button
              :disabled="!input.trim() || sending"
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-ink transition-colors duration-150 hover:bg-primary-strong disabled:opacity-40"
              aria-label="发送任务"
              @click="send"
            >
              <Send class="h-4 w-4" />
            </button>
          </div>
        </div>


        <div
          v-if="todos.length > 0 || todoOpen"
          class="mt-4 rounded-xl border border-line bg-surface"
        >
          <button
            class="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold text-t3"
            @click="todoOpen = !todoOpen"
          >
            <span class="flex items-center gap-1.5">
              <ListTodo class="h-3.5 w-3.5 text-primary" />
              Agent 任务清单
              <span v-if="todos.length > 0" class="tabular-nums text-t4">
                （{{ todos.filter((t) => t.status === 'completed').length }}/{{ todos.length }} 完成）
              </span>
            </span>
            <span>{{ todoOpen ? '收起' : '展开' }}</span>
          </button>
          <div v-if="todoOpen" class="space-y-1.5 border-t border-line p-3.5">
            <p v-if="todos.length === 0" class="text-center text-xs text-t4">agent 尚未创建任务清单</p>
            <div v-for="t in todos" :key="t.id" class="flex items-start gap-2.5">
              <span
                class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 text-[9px] font-bold"
                :class="t.status === 'completed' ? 'border-ok bg-ok text-ink' : t.status === 'in_progress' ? 'border-primary text-primary' : 'border-t4'"
              >
                <Check v-if="t.status === 'completed'" class="h-2.5 w-2.5" />
              </span>
              <span
                class="min-w-0 flex-1 text-xs"
                :class="t.status === 'completed' ? 'text-t4 line-through' : t.status === 'in_progress' ? 'text-t1' : 'text-t2'"
              >
                {{ t.content }}
                <span v-if="t.status === 'in_progress'" class="ml-1 text-[10px] text-primary">进行中</span>
              </span>
            </div>
          </div>
        </div>

        <div
          v-if="showFiles"
          class="mt-4 rounded-xl border border-line bg-surface"
        >
          <div class="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <p class="flex items-center gap-1.5 text-xs font-semibold text-t3">
              <Folder class="h-3.5 w-3.5 text-primary" />
              项目文件
              <span v-if="filesPath" class="truncate font-mono text-[10px] font-normal text-t4">{{ filesPath }}</span>
            </p>
            <div class="flex items-center gap-1.5">
              <button
                v-if="filesPath"
                class="rounded-md border border-line px-2 py-1 text-[11px] text-t3 transition-colors duration-150 hover:bg-surface-2"
                @click="browseFiles(filesPath.split('\\').slice(0, -1).join('\\'))"
              >
                上一级
              </button>
              <button
                class="rounded-md border border-line px-2 py-1 text-[11px] text-t3 transition-colors duration-150 hover:bg-surface-2"
                @click="browseFiles('')"
              >
                根目录
              </button>
            </div>
          </div>
          <div class="max-h-56 overflow-y-auto p-2">
            <p v-if="filesLoading" class="py-4 text-center text-xs text-t4">加载中…</p>
            <template v-else>
              <button
                v-for="node in [...files].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1))"
                :key="node.path"
                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-t2 transition-colors duration-150 hover:bg-surface-2"
                @click="node.type === 'directory' ? browseFiles(node.path.replace(/\\$/, '')) : viewFile(node)"
              >
                <Folder v-if="node.type === 'directory'" class="h-3.5 w-3.5 shrink-0 text-info" />
                <FileText v-else class="h-3.5 w-3.5 shrink-0 text-t4" />
                <span class="min-w-0 flex-1 truncate">{{ node.name }}</span>
                <span v-if="node.ignored" class="shrink-0 text-[9px] text-t4">ignored</span>
              </button>
            </template>
          </div>
          <div v-if="fileView" class="border-t border-line p-3">
            <div class="mb-2 flex items-center justify-between">
              <p class="truncate font-mono text-[11px] font-medium text-t2">{{ fileView.name }}</p>
              <button class="text-[11px] text-t4 hover:text-t2" @click="fileView = null">关闭</button>
            </div>
            <pre class="max-h-64 overflow-auto rounded-lg bg-inset p-3 font-mono text-[10px] leading-relaxed text-t2">{{ fileView.content }}</pre>
          </div>
        </div>

        <div v-if="activeProfile.agentKind === 'opencode'" class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div class="rounded-xl border border-line bg-surface">
            <button
              class="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold text-t3"
              @click="loadDiff"
            >
              <span class="flex items-center gap-1.5">
                <FileText class="h-3.5 w-3.5" />
                会话代码变更
              </span>
              <span>{{ showDiff ? '收起' : '展开' }}</span>
            </button>
            <div v-if="showDiff" class="border-t border-line p-3">
              <p v-if="diffFiles.length === 0" class="text-center text-xs text-t4">暂无变更记录</p>
              <ul v-else class="space-y-1">
                <li v-for="(f, i) in diffFiles" :key="i" class="rounded-md bg-inset px-2.5 py-1.5 font-mono text-[11px] text-t2">
                  {{ (f.file as string) ?? (f.path as string) ?? JSON.stringify(f).slice(0, 80) }}
                </li>
              </ul>
            </div>
          </div>

          <div class="rounded-xl border border-line bg-surface">
            <p class="flex items-center gap-1.5 border-b border-line px-4 py-3 text-xs font-semibold text-t3">
              <ShieldAlert class="h-3.5 w-3.5" />
              实时事件流
            </p>
            <div class="max-h-48 space-y-1 overflow-y-auto p-3">
              <p v-if="events.length === 0" class="py-4 text-center text-xs text-t4">等待事件…</p>
              <p v-for="(e, i) in events" :key="i" class="truncate font-mono text-[10px] text-t4">
                <span class="text-primary">{{ e.type }}</span>
                <span v-if="e.sessionID"> · {{ e.sessionID.slice(0, 8) }}</span>
              </p>
            </div>
          </div>
        </div>

        <div
          v-if="permCards.length > 0"
          class="mt-4 rounded-xl border border-warn/30 bg-warn/10 p-4"
        >
          <p class="flex items-center gap-2 text-sm font-semibold text-warn">
            <ShieldAlert class="h-4 w-4" />
            opencode 正在请求权限（{{ permCards.length }}）
          </p>
          <div class="mt-2.5 space-y-2.5">
            <div
              v-for="c in permCards"
              :key="c.key"
              class="rounded-lg bg-inset p-3"
            >
              <p class="truncate text-xs font-medium text-t1">{{ c.title }}</p>
              <p class="mt-0.5 font-mono text-[10px] text-t4">会话 {{ c.sessionID.slice(0, 8) }} · {{ c.permissionID.slice(0, 12) }}</p>
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                  class="min-h-9 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-ink"
                  @click="approve(c.sessionID, c.key, c.permissionID, c.title, true, false)"
                >
                  允许一次
                </button>
                <button
                  class="min-h-9 rounded-md border border-primary/40 bg-primary/10 px-2.5 text-[11px] font-medium text-primary"
                  @click="approve(c.sessionID, c.key, c.permissionID, c.title, true, true)"
                >
                  永久允许
                </button>
                <button
                  class="min-h-9 rounded-md border border-danger/30 px-2.5 text-[11px] font-medium text-danger"
                  @click="approve(c.sessionID, c.key, c.permissionID, c.title, false, false)"
                >
                  拒绝
                </button>
              </div>
            </div>
          </div>
          <div v-if="permHistory.length > 0" class="mt-3 border-t border-line pt-2.5">
            <p class="text-[10px] font-semibold uppercase tracking-wide text-t4">审批记录</p>
            <p v-for="(h, i) in permHistory" :key="i" class="mt-1 truncate text-[10px] text-t4">
              <span :class="h.allow ? 'text-ok' : 'text-danger'">{{ h.allow ? '✓ 允许' : '✗ 拒绝' }}</span>
              {{ h.title }} · {{ new Date(h.at).toLocaleTimeString('zh-CN') }}
            </p>
          </div>
        </div>
      </div>
    </div>
    </div>

    <PiProjectModal :open="showPiProjectModal" @close="showPiProjectModal = false" @created="handlePiProjectCreated" />
    <AiConfigModal :open="showConfig" @close="showConfig = false" />
  </div>
</template>
