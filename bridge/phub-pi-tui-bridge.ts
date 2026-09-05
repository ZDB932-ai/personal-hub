import { createServer, type Server } from 'node:http'
import type { Socket } from 'node:net'
import { basename, resolve } from 'node:path'
import {
  sessionEntryToContextMessages,
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent'

const globalStore = globalThis as typeof globalThis & {
  __personalHubPiTuiEvents?: { seq: number; events: Record<string, unknown>[] }
}
const eventStore = globalStore.__personalHubPiTuiEvents ?? { seq: Date.now() * 1000, events: [] }
globalStore.__personalHubPiTuiEvents = eventStore

const argOf = (name: string, fallback: string) => {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

export default function phubPiTuiBridge(pi: ExtensionAPI) {
  pi.registerFlag('phub-tui-port', { description: 'Personal Hub TUI bridge 端口', type: 'string', default: '8811' })
  pi.registerFlag('phub-tui-token', { description: 'Personal Hub TUI bridge Token', type: 'string', default: '' })
  pi.registerFlag('phub-tui-origins', { description: '允许访问 bridge 的前端 Origin，逗号分隔', type: 'string', default: 'http://localhost,capacitor://localhost' })
  pi.registerFlag('phub-tui-project-id', { description: 'Personal Hub TUI 项目 ID', type: 'string', default: 'pi-tui' })
  pi.registerFlag('phub-tui-project-name', { description: 'Personal Hub TUI 项目名', type: 'string', default: '' })
  pi.registerFlag('phub-tui-device', { description: 'Personal Hub TUI 设备名', type: 'string', default: '我的电脑' })
  const port = Number(argOf('phub-tui-port', String(pi.getFlag('phub-tui-port') || '8811')))
  const token = argOf('phub-tui-token', String(pi.getFlag('phub-tui-token') || ''))
  const origins = new Set(
    String(argOf('phub-tui-origins', String(pi.getFlag('phub-tui-origins') || '')))
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  const projectId = argOf('phub-tui-project-id', String(pi.getFlag('phub-tui-project-id') || 'pi-tui'))
  const configuredName = argOf('phub-tui-project-name', String(pi.getFlag('phub-tui-project-name') || ''))
  const device = argOf('phub-tui-device', String(pi.getFlag('phub-tui-device') || '我的电脑'))
  let context: ExtensionContext | null = null
  let server: Server | null = null
  let stopping = false
  const sockets = new Set<Socket>()

  const currentContext = (): ExtensionContext => {
    if (!context || stopping) throw new Error('pi TUI bridge 正在切换会话，请稍后重试')
    return context
  }

  const pushEvent = (type: string, extra: Record<string, unknown> = {}) => {
    const ctx = context
    const item = {
      seq: ++eventStore.seq,
      at: Date.now(),
      projectId,
      type,
      sessionID: ctx?.sessionManager.getSessionId(),
      ...extra,
    }
    eventStore.events.push(item)
    if (eventStore.events.length > 200) eventStore.events.shift()
  }

  const sanitizeMessages = () =>
    currentContext()
      .sessionManager.buildContextEntries()
      .flatMap(sessionEntryToContextMessages)
      .flatMap((message) => {
        const record = message as {
          role?: string
          content?: unknown
          timestamp?: number
          toolCallId?: string
          toolName?: string
          isError?: boolean
        }
        const content: Record<string, unknown>[] = []
        if (typeof record.content === 'string') {
          content.push({ type: 'text', text: record.content.slice(0, 12000) })
        } else if (Array.isArray(record.content)) {
          for (const raw of record.content) {
            if (!raw || typeof raw !== 'object') continue
            const block = raw as {
              type?: string
              text?: string
              name?: string
              id?: string
              arguments?: { command?: string }
            }
            if (block.type === 'text' && block.text) content.push({ type: 'text', text: block.text.slice(0, 12000) })
            if (block.type === 'toolCall') {
              content.push({
                type: 'toolCall',
                id: block.id,
                name: block.name,
                arguments: block.arguments?.command ? { command: block.arguments.command.slice(0, 4000) } : {},
              })
            }
          }
        }
        if (content.length === 0) return []
        return [{
          role: record.role || 'assistant',
          content,
          timestamp: record.timestamp,
          toolCallId: record.toolCallId,
          toolName: record.toolName,
          isError: record.isError,
        }]
      })

  const state = () => {
    const ctx = currentContext()
    const messages = sanitizeMessages()
    return {
      model: ctx.model ? { id: ctx.model.id, name: ctx.model.name, provider: ctx.model.provider, providerID: ctx.model.provider } : null,
      thinkingLevel: ctx.thinkingLevel,
      isStreaming: !ctx.isIdle(),
      isCompacting: false,
      sessionFile: ctx.sessionManager.getSessionFile(),
      sessionId: ctx.sessionManager.getSessionId(),
      sessionName: ctx.sessionManager.getSessionName(),
      messageCount: messages.length,
      pendingMessageCount: ctx.hasPendingMessages() ? 1 : 0,
    }
  }

  const project = () => {
    const ctx = currentContext()
    return {
      id: projectId,
      name: configuredName || basename(ctx.cwd),
      cwd: ctx.cwd,
      running: true,
      busy: !ctx.isIdle(),
      sessionName: ctx.sessionManager.getSessionName() ?? null,
      model: ctx.model ? { id: ctx.model.id, provider: ctx.model.provider, providerID: ctx.model.provider } : null,
    }
  }

  const requireProject = (payload: Record<string, unknown>) => {
    if (String(payload.projectId || '') !== projectId) throw new Error('找不到当前 pi TUI 项目，请刷新项目列表')
  }

  const models = () => {
    const ctx = currentContext()
    const available = ctx.scopedModels.length > 0 ? ctx.scopedModels.map((item) => item.model) : ctx.modelRegistry.getAvailable()
    return available.map((model) => ({ id: model.id, name: model.name, provider: model.provider, providerID: model.provider }))
  }

  const handlers: Record<string, (payload: Record<string, unknown>) => unknown | Promise<unknown>> = {
    ping: () => ({ device, agent: 'pi', protocol: 3, capabilities: ['pi.projects', 'pi.tui'], projects: 1 }),
    'pi.projects.list': () => [project()],
    'pi.projects.add': (payload) => {
      const cwd = resolve(String(payload.cwd || ''))
      const current = resolve(currentContext().cwd)
      if ((process.platform === 'win32' ? cwd.toLowerCase() : cwd) !== (process.platform === 'win32' ? current.toLowerCase() : current)) {
        throw new Error('原生 TUI bridge 一次只管理当前 TUI 项目，请在目标目录启动另一个端口')
      }
      return project()
    },
    'pi.projects.select': (payload) => {
      requireProject(payload)
      return project()
    },
    'pi.projects.remove': () => {
      throw new Error('不能从 Hub 移除正在运行的原生 pi TUI')
    },
    'pi.sync': (payload) => {
      requireProject(payload)
      return project()
    },
    'pi.state': (payload) => {
      requireProject(payload)
      return state()
    },
    'pi.messages': (payload) => {
      requireProject(payload)
      return { messages: sanitizeMessages() }
    },
    'pi.prompt': (payload) => {
      requireProject(payload)
      const message = String(payload.message || '').trim()
      if (!message) throw new Error('消息不能为空')
      const ctx = currentContext()
      pi.sendUserMessage(message, ctx.isIdle() ? undefined : { deliverAs: 'followUp' })
      return { sent: true }
    },
    'pi.steer': (payload) => {
      requireProject(payload)
      const message = String(payload.message || '').trim()
      if (!message) throw new Error('消息不能为空')
      pi.sendUserMessage(message, { deliverAs: 'steer' })
      return { sent: true }
    },
    'pi.abort': (payload) => {
      requireProject(payload)
      currentContext().abort()
      return { aborted: true }
    },
    'pi.new_session': (payload) => {
      requireProject(payload)
      if (!currentContext().isIdle()) throw new Error('pi 正在工作，请完成或中止后再创建会话')
      const currentState = state()
      setTimeout(() => pi.sendUserMessage('/phub-new-session', { expandPromptTemplates: true }), 0)
      return currentState
    },
    'pi.models': (payload) => {
      requireProject(payload)
      return models()
    },
    'pi.set_model': async (payload) => {
      requireProject(payload)
      const ctx = currentContext()
      if (!ctx.isIdle()) throw new Error('pi 正在工作，请完成后再切换模型')
      const provider = String(payload.provider || '')
      const modelId = String(payload.model || '')
      const allowed = ctx.scopedModels.length > 0 ? ctx.scopedModels.map((item) => item.model) : ctx.modelRegistry.getAvailable()
      const model = allowed.find((item) => item.provider === provider && item.id === modelId)
      if (!model) throw new Error('找不到可用模型')
      if (!(await pi.setModel(model))) throw new Error('模型认证不可用')
      return { id: model.id, name: model.name, provider: model.provider, providerID: model.provider }
    },
  }

  const startServer = async () => {
    if (server) return
    if (!token) throw new Error('phub-tui-token 不能为空；请设置至少 32 位的随机 Token')
    server = createServer((request, response) => {
      const origin = request.headers.origin
      const localhost = typeof origin === 'string' && /^http:\/\/localhost(?::\d+)?$/i.test(origin)
      if (origin && !localhost && !origins.has(origin)) {
        response.writeHead(403)
        response.end()
        return
      }
      if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin)
        response.setHeader('Vary', 'Origin')
      }
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      response.setHeader('Cache-Control', 'no-store')
      if (request.method === 'OPTIONS') {
        response.writeHead(204)
        response.end()
        return
      }
      if (request.headers.authorization !== `Bearer ${token}`) {
        response.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ error: '未授权' }))
        return
      }
      const url = new URL(request.url || '/', 'http://localhost')
      if (request.method === 'GET' && url.pathname === '/events') {
        const after = Number(url.searchParams.get('after') || 0)
        const requestedProject = url.searchParams.get('projectId')
        const events = eventStore.events.filter((event) => Number(event.seq) > after && (!requestedProject || event.projectId === requestedProject))
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ events, seq: eventStore.seq }))
        return
      }
      if (request.method !== 'POST' || url.pathname !== '/cmd') {
        response.writeHead(404)
        response.end()
        return
      }
      let body = ''
      request.on('data', (chunk) => {
        body += chunk
        if (body.length > 65536) request.destroy()
      })
      request.on('end', () => {
        let type = ''
        let payload: Record<string, unknown> = {}
        try {
          const parsed = JSON.parse(body)
          type = String(parsed.type || '')
          payload = parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : {}
        } catch {
          response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
          response.end(JSON.stringify({ error: 'bad json' }))
          return
        }
        const handler = handlers[type]
        if (!handler) {
          response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
          response.end(JSON.stringify({ error: `未知指令: ${type}` }))
          return
        }
        Promise.resolve()
          .then(() => handler(payload))
          .then((data) => {
            response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
            response.end(JSON.stringify({ data: data ?? null }))
          })
          .catch((error) => {
            response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
            response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
          })
      })
    })
    server.on('connection', (socket) => {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
    })
    await new Promise<void>((resolveListen, rejectListen) => {
      server!.once('error', rejectListen)
      server!.listen(port, '0.0.0.0', () => {
        server!.off('error', rejectListen)
        resolveListen()
      })
    })
  }

  const stopServer = async () => {
    const active = server
    server = null
    if (!active) return
    await new Promise<void>((resolveClose) => {
      active.close(() => resolveClose())
      active.closeIdleConnections?.()
      setTimeout(() => {
        for (const socket of sockets) socket.destroy()
        resolveClose()
      }, 500).unref()
    })
    sockets.clear()
  }

  pi.registerCommand('phub-new-session', {
    description: '由 Personal Hub 创建新的 pi 会话',
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) return
      await ctx.newSession()
    },
  })

  pi.on('session_start', async (_event, ctx) => {
    context = ctx
    stopping = false
    await startServer()
    ctx.ui.setStatus('phub-bridge', `Hub :${port}`)
    pushEvent('session_start')
  })
  pi.on('session_shutdown', async (event, ctx) => {
    context = ctx
    pushEvent('session_shutdown', { reason: event.reason })
    stopping = true
    ctx.ui.setStatus('phub-bridge', undefined)
    await stopServer()
    context = null
  })
  pi.on('agent_start', (_event, ctx) => {
    context = ctx
    pushEvent('agent_start')
  })
  pi.on('message_update', (event, ctx) => {
    context = ctx
    const delta = event.assistantMessageEvent
    if (delta.type === 'text_delta') pushEvent('message_update', { delta: delta.delta.slice(0, 4000) })
  })
  pi.on('message_end', (_event, ctx) => {
    context = ctx
    pushEvent('message_end')
  })
  pi.on('agent_settled', (_event, ctx) => {
    context = ctx
    pushEvent('agent_settled')
  })
  pi.on('model_select', (event, ctx) => {
    context = ctx
    pushEvent('model_select', { model: { id: event.model.id, provider: event.model.provider } })
  })
  pi.on('tool_execution_start', (event, ctx) => {
    context = ctx
    pushEvent('tool_execution_start', { toolCallId: event.toolCallId, toolName: event.toolName })
  })
  pi.on('tool_execution_end', (event, ctx) => {
    context = ctx
    pushEvent('tool_execution_end', { toolCallId: event.toolCallId, toolName: event.toolName, isError: event.isError })
  })
}
