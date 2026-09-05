#!/usr/bin/env node
/**
 * Personal Hub · AI 桥接守护进程 v2（多 agent）
 *
 * 支持两种 agent（--agent 选择）：
 *   opencode  连接本机 opencode serve（HTTP）
 *   pi        spawn `pi --mode rpc` 子进程（JSONL stdin/stdout）
 *
 * 上行：PocketBase 中继（hub_ai_cmd / hub_ai_dev / hub_ai_evt，出站连接，外网可用）
 * 下行（可选）：本机 HTTP 服务（--http 端口，Bearer Token），供同一局域网内 Hub 直连
 *
 * 安全提醒：能驱动此桥接 = 能操作你的 agent（间接具备项目写入能力）。
 *           Token 请妥善保管，不用时关闭窗口。
 *
 * 用法示例：
 *   opencode 模式：
 *   node phub-bridge.mjs --pb http://pb:8090 --email you@x.com --pass 密码 --device 我的电脑 --oc http://127.0.0.1:4096
 *   pi 模式：
 *   node phub-bridge.mjs --agent pi --pb http://pb:8090 --email you@x.com --pass 密码 --device 我的电脑 --pi-cwd E:\project --http 8811 --http-token 一串随机字符
 */

import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
function argOf(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : process.env[`PHUB_${name.toUpperCase().replace(/-/g, '_')}`] ?? fallback
}

const PB_URL = (argOf('pb', process.env.PHUB_PB_URL) ?? '').replace(/\/+$/, '')
const EMAIL = argOf('email', process.env.PHUB_EMAIL)
const PASS = argOf('pass', process.env.PHUB_PASS)
const DEVICE = argOf('device', process.env.PHUB_DEVICE) || '我的电脑'
const AGENT = argOf('agent', 'opencode')
const CWD = argOf('cwd', process.cwd())
const OC_BASE = (argOf('oc', 'http://127.0.0.1:4096')).replace(/\/+$/, '')
const OC_USER = argOf('oc-user', 'opencode')
const OC_PASS = argOf('oc-pass', '')
const PI_BIN = argOf('pi-bin', 'pi')
const PI_CWD = argOf('pi-cwd', '')
const PI_SESSION = argOf('pi-session', '')
const BRIDGE_DIR = dirname(fileURLToPath(import.meta.url))
const PI_PROJECTS_FILE = resolve(argOf('pi-projects', join(BRIDGE_DIR, 'pi-projects.local.json')))
const HTTP_PORT = Number(argOf('http', 0))
const HTTP_TOKEN = argOf('http-token', '')
const HTTP_ORIGINS = new Set(
  String(argOf('http-origins', 'http://localhost,capacitor://localhost'))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)
const POLL_MS = Number(argOf('poll', 1500))

const PB_ON = Boolean(PB_URL && EMAIL && PASS)

if (!PB_ON && !HTTP_PORT) {
  console.error('未配置任何入口：请提供 PB 参数（--pb --email --pass）或启用本机 HTTP（--http 端口 --http-token 随机值）')
  process.exit(1)
}

if (HTTP_PORT && !HTTP_TOKEN) {
  console.error('启用 HTTP 入口时必须提供 --http-token；请使用至少 32 位的随机值')
  process.exit(1)
}

let pbToken = ''
let ocAuth = OC_PASS ? `Basic ${Buffer.from(`${OC_USER}:${OC_PASS}`).toString('base64')}` : ''

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function pb(path, init = {}) {
  const res = await fetch(`${PB_URL}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: pbToken, ...(init.headers ?? {}) },
  })
  if (res.status === 401) throw new Error('PB 认证失效')
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`PB ${res.status}: ${t.slice(0, 160)}`)
  }
  return res.json()
}

async function pbLogin() {
  const res = await fetch(`${PB_URL}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: EMAIL, password: PASS }),
  })
  if (!res.ok) throw new Error(`PB 登录失败（${res.status}）`)
  const data = await res.json()
  pbToken = data.token
  console.log(`[pb] 已登录：${data.record.email}`)
}

async function heartbeat() {
  const filter = encodeURIComponent(`device='${DEVICE}'`)
  const list = await pb(`/api/collections/hub_ai_dev/records?filter=${filter}&perPage=1`)
  const body = { device: DEVICE, lastSeen: Date.now(), agent: AGENT }
  if (list.items?.length) {
    await pb(`/api/collections/hub_ai_dev/records/${list.items[0].id}`, { method: 'PATCH', body: JSON.stringify(body) })
  } else {
    await pb('/api/collections/hub_ai_dev/records', { method: 'POST', body: JSON.stringify(body) })
  }
}

// ============================== 事件转发 ==============================

const eventRing = []
let eventSeq = 0
let pendingFlush = []
let lastEvtPush = 0

function pushEvent(obj) {
  eventSeq++
  const item = { seq: eventSeq, at: Date.now(), ...obj }
  eventRing.push(item)
  if (eventRing.length > 200) eventRing.shift()
  pendingFlush.push(item)
  return eventSeq
}

async function flushEventsToPB() {
  if (pendingFlush.length === 0) return
  const batch = pendingFlush.splice(0, pendingFlush.length)
  try {
    await pb('/api/collections/hub_ai_evt/records', {
      method: 'POST',
      body: JSON.stringify({ device: DEVICE, seq: batch[batch.length - 1].seq, events: batch }),
    })
  } catch {
    /* 事件转发失败不影响指令 */
  }
}

// ============================== opencode 适配器 ==============================

async function oc(path, init = {}) {
  const res = await fetch(`${OC_BASE}${path}`, {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(ocAuth ? { Authorization: ocAuth } : {}) },
  })
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`opencode ${res.status}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// ============================== pi RPC 适配器 ==============================

class PiRpc {
  constructor(bin, cwd) {
    this.bin = bin
    this.cwd = cwd
    this.proc = null
    this.pending = new Map()
    this.listeners = []
    this.exitListeners = []
    this.stderr = ''
    this.idSeq = 0
  }

  start() {
    if (this.running) return
    let proc
    try {
      proc = spawn(this.bin, ['--mode', 'rpc'], {
        cwd: this.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: process.platform === 'win32',
      })
    } catch (e) {
      throw new Error(`pi 启动失败：${e.message}`)
    }
    this.proc = proc
    const close = (reason) => {
      if (this.proc !== proc) return
      this.proc = null
      for (const p of this.pending.values()) p({ type: 'response', success: false, error: reason })
      this.pending.clear()
      for (const l of this.exitListeners) l(reason)
    }
    let buf = ''
    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line) continue
        let obj
        try {
          obj = JSON.parse(line)
        } catch {
          continue
        }
        if (obj.type === 'response') {
          const p = this.pending.get(obj.id)
          if (p) {
            this.pending.delete(obj.id)
            p(obj)
          }
        } else {
          for (const l of this.listeners) l(obj)
        }
      }
    })
    proc.stderr.on('data', (d) => {
      this.stderr = (this.stderr + d.toString()).slice(-4000)
    })
    proc.on('error', (e) => {
      this.stderr = (this.stderr + e.message).slice(-4000)
      close(`pi 进程启动失败：${e.message}`)
    })
    proc.on('exit', () => close('pi 进程已退出'))
  }

  get running() {
    return this.proc !== null
  }

  send(cmd, timeoutMs = 60000) {
    if (!this.running) return Promise.reject(new Error('pi 未运行（启动中或已崩溃）'))
    const proc = this.proc
    const id = 'r' + ++this.idSeq
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error('pi 响应超时'))
        }
      }, timeoutMs)
      this.pending.set(id, (res) => {
        clearTimeout(timer)
        if (res.success) resolve(res.data ?? null)
        else reject(new Error(res.error ?? 'pi 命令失败'))
      })
      try {
        proc.stdin.write(JSON.stringify({ ...cmd, id }) + '\n')
      } catch (e) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(new Error(`pi 指令发送失败：${e.message}`))
      }
    })
  }

  onEvent(l) {
    this.listeners.push(l)
    return () => {
      const i = this.listeners.indexOf(l)
      if (i >= 0) this.listeners.splice(i, 1)
    }
  }

  onExit(l) {
    this.exitListeners.push(l)
    return () => {
      const i = this.exitListeners.indexOf(l)
      if (i >= 0) this.exitListeners.splice(i, 1)
    }
  }

  stop() {
    const proc = this.proc
    if (!proc) return
    try {
      proc.stdin.end()
    } catch {}
    if (process.platform === 'win32' && proc.pid) {
      execFile('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { windowsHide: true }, () => {})
      return
    }
    try {
      proc.kill()
    } catch {}
  }
}

function sameProjectPath(a, b) {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function projectCwd(value) {
  const raw = String(value ?? '').trim()
  if (!raw) throw new Error('请填写项目目录')
  const cwd = resolve(raw)
  let stat
  try {
    stat = statSync(cwd)
  } catch {
    throw new Error('项目目录不存在或无法访问')
  }
  if (!stat.isDirectory()) throw new Error('项目路径必须是文件夹')
  return cwd
}

function loadPiProjects(file) {
  if (!existsSync(file)) return []
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    const records = Array.isArray(raw) ? raw : raw.projects
    if (!Array.isArray(records)) throw new Error('配置格式无效')
    return records.flatMap((record) => {
      if (!record || typeof record !== 'object' || !record.cwd) return []
      const cwd = resolve(String(record.cwd))
      const name = String(record.name || basename(cwd)).trim() || basename(cwd)
      return [{ id: String(record.id || randomUUID()), name, cwd, sessionFile: typeof record.sessionFile === 'string' ? record.sessionFile : '' }]
    })
  } catch (e) {
    console.warn(`[pi] 项目配置读取失败：${e.message}`)
    return []
  }
}

class PiProjectManager {
  constructor(bin, file, seedCwd, seedSessionFile) {
    this.bin = bin
    this.file = file
    this.projects = loadPiProjects(file)
    this.runtimes = new Map()
    if (seedCwd) {
      try {
        const cwd = projectCwd(seedCwd)
        const existing = this.projects.find((project) => sameProjectPath(project.cwd, cwd))
        if (existing) {
          if (seedSessionFile && existing.sessionFile !== seedSessionFile) {
            existing.sessionFile = seedSessionFile
            this.persist()
          }
        } else {
          this.projects.push({ id: randomUUID(), name: basename(cwd), cwd, sessionFile: seedSessionFile })
          this.persist()
          console.log(`[pi] 已从 --pi-cwd 导入项目：${cwd}`)
        }
      } catch (e) {
        console.warn(`[pi] 未导入 --pi-cwd：${e.message}`)
      }
    }
  }

  persist() {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify({ v: 1, projects: this.projects }, null, 2) + '\n', 'utf8')
  }

  get(projectId) {
    const project = this.projects.find((item) => item.id === projectId)
    if (!project) throw new Error('找不到 pi 项目，请刷新项目列表')
    return project
  }

  summary(project, state) {
    const runtime = this.runtimes.get(project.id)
    const current = state ?? runtime?.state ?? null
    return {
      id: project.id,
      name: project.name,
      cwd: project.cwd,
      running: Boolean(runtime?.pi.running),
      busy: Boolean(current?.isStreaming ?? current?.streaming),
      sessionName: current?.sessionName ?? null,
      model: current?.model ?? null,
    }
  }

  list() {
    return this.projects.map((project) => this.summary(project))
  }

  add(input) {
    const cwd = projectCwd(input.cwd)
    const existing = this.projects.find((project) => sameProjectPath(project.cwd, cwd))
    if (existing) return this.summary(existing)
    const name = String(input.name ?? '').trim().slice(0, 80) || basename(cwd)
    const project = { id: randomUUID(), name, cwd, sessionFile: '' }
    this.projects.push(project)
    this.persist()
    return this.summary(project)
  }

  rememberSession(project, state) {
    const sessionFile = typeof state?.sessionFile === 'string' ? state.sessionFile : ''
    if (sessionFile && project.sessionFile !== sessionFile) {
      project.sessionFile = sessionFile
      this.persist()
    }
  }

  sessionStamp(sessionFile) {
    if (!sessionFile) return ''
    try {
      const stat = statSync(sessionFile)
      return `${stat.size}:${stat.mtimeMs}`
    } catch {
      return ''
    }
  }

  async ensure(projectId) {
    const project = this.get(projectId)
    let runtime = this.runtimes.get(project.id)
    if (!runtime?.pi.running) {
      const pi = new PiRpc(this.bin, project.cwd)
      runtime = { pi, state: runtime?.state ?? null, sessionStamp: '', ready: null }
      this.runtimes.set(project.id, runtime)
      pi.onEvent((evt) => {
        if (evt?.type === 'agent_settled') runtime.sessionStamp = this.sessionStamp(project.sessionFile)
        pushEvent({ projectId: project.id, type: evt.type ?? 'pi.event', ...sanitizePiEvent(evt) })
      })
      pi.onExit(() => {
        if (this.runtimes.get(project.id) === runtime) runtime.state = null
      })
      runtime.ready = (async () => {
        pi.start()
        if (!project.sessionFile) return
        const result = await pi.send({ type: 'switch_session', sessionPath: project.sessionFile })
        if (result?.cancelled) throw new Error('会话切换已取消')
        const state = await pi.send({ type: 'get_state' })
        runtime.state = state
        runtime.sessionStamp = this.sessionStamp(state?.sessionFile)
        this.rememberSession(project, state)
        console.log(`[pi] 已恢复会话：${project.name}`)
      })()
      console.log(`[pi] 项目已启动：${project.name} · ${project.cwd}`)
    }
    try {
      await runtime.ready
    } catch (e) {
      if (this.runtimes.get(project.id) === runtime) {
        runtime.pi.stop()
        this.runtimes.delete(project.id)
      }
      throw e
    }
    return { project, runtime }
  }

  async state(projectId) {
    const { project, runtime } = await this.ensure(projectId)
    const state = await runtime.pi.send({ type: 'get_state' })
    runtime.state = state
    this.rememberSession(project, state)
    return { project, state }
  }

  async select(projectId) {
    const { project, state } = await this.state(projectId)
    return this.summary(project, state)
  }

  async reload(projectId) {
    const { project, runtime } = await this.ensure(projectId)
    const current = await runtime.pi.send({ type: 'get_state' })
    if (current?.isStreaming || current?.isCompacting) throw new Error('pi 正在工作，完成后再同步终端分支')
    const sessionFile = current?.sessionFile || project.sessionFile
    if (!sessionFile) throw new Error('当前项目还没有可同步的 pi 会话')
    const diskStamp = this.sessionStamp(sessionFile)
    if (diskStamp && diskStamp === runtime.sessionStamp) {
      runtime.state = current
      return this.summary(project, current)
    }
    const result = await runtime.pi.send({ type: 'switch_session', sessionPath: sessionFile })
    if (result?.cancelled) throw new Error('会话同步已取消')
    const state = await runtime.pi.send({ type: 'get_state' })
    runtime.state = state
    runtime.sessionStamp = this.sessionStamp(state?.sessionFile)
    this.rememberSession(project, state)
    console.log(`[pi] 已从磁盘同步会话：${project.name}`)
    return this.summary(project, state)
  }

  async send(projectId, command) {
    const { project, runtime } = await this.ensure(projectId)
    const data = await runtime.pi.send(command)
    if (command.type === 'get_state') {
      runtime.state = data
      this.rememberSession(project, data)
    }
    return data
  }

  remove(projectId) {
    const index = this.projects.findIndex((project) => project.id === projectId)
    if (index < 0) throw new Error('找不到 pi 项目')
    this.runtimes.get(projectId)?.pi.stop()
    this.runtimes.delete(projectId)
    this.projects.splice(index, 1)
    this.persist()
    return { removed: true }
  }

  stopAll() {
    for (const runtime of this.runtimes.values()) runtime.pi.stop()
  }
}

// ============================== 一次性 exec 适配器（codex / dsh / zcode）==============================

function makeOneshotHandlers(conf) {
  let child = null
  let output = ''
  let running = false

  return {
    ping: async () => ({ device: DEVICE, agent: AGENT }),
    'exec.run': async (p) => {
      if (running) throw new Error('已有任务在执行中，请先中止或等待完成')
      const prompt = String(p.prompt ?? '').trim()
      if (!prompt) throw new Error('任务内容为空')
      running = true
      output = ''
      child = spawn(conf.bin, [...conf.args, prompt], {
        cwd: p.cwd ?? CWD,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      pushEvent({ type: `${AGENT}.started`, text: prompt.slice(0, 200) })
      child.stdout.on('data', (d) => {
        output += d.toString()
        pushEvent({ type: `${AGENT}.output`, text: d.toString().slice(0, 2000) })
      })
      child.stderr.on('data', (d) => {
        output += d.toString()
      })
      child.on('exit', (code) => {
        running = false
        pushEvent({ type: `${AGENT}.completed`, code })
      })
      return { started: true }
    },
    'exec.status': async () => ({ running, output: output.slice(-6000) }),
    'exec.abort': async () => {
      if (child) child.kill()
      running = false
      return { aborted: true }
    },
  }
}

// ============================== 指令处理器 ==============================

let handlers = {}

function makeOcHandlers() {
  return {
    ping: async () => {
      const h = await oc('/global/health')
      return { version: h.version, device: DEVICE }
    },
    'sessions.list': async () => oc('/session'),
    'session.create': async (p) => oc('/session', { method: 'POST', body: JSON.stringify({ title: p.title }) }),
    'session.delete': async (p) => oc(`/session/${p.id}`, { method: 'DELETE' }),
    'session.abort': async (p) => oc(`/session/${p.id}/abort`, { method: 'POST' }),
    'messages.list': async (p) => oc(`/session/${p.id}/message`),
    'send.async': async (p) => {
      const body = { parts: [{ type: 'text', text: p.text }] }
      if (p.model) body.model = p.model
      if (p.agent) body.agent = p.agent
      await oc(`/session/${p.id}/prompt_async`, { method: 'POST', body: JSON.stringify(body) })
      return { sent: true }
    },
    diff: async (p) => oc(`/session/${p.id}/diff`),
  }
}

function makePiHandlers(projects) {
  const projectId = (p) => {
    const id = String(p?.projectId ?? '').trim()
    if (!id) throw new Error('请先在 Hub 选择 pi 项目')
    return id
  }
  return {
    ping: async () => ({ device: DEVICE, agent: 'pi', protocol: 3, capabilities: ['pi.projects'], projects: projects.list().length }),
    'pi.projects.list': async () => projects.list(),
    'pi.projects.add': async (p) => projects.add(p),
    'pi.projects.select': async (p) => projects.select(projectId(p)),
    'pi.projects.remove': async (p) => projects.remove(projectId(p)),
    'pi.sync': async (p) => projects.reload(projectId(p)),
    'pi.state': async (p) => (await projects.state(projectId(p))).state,
    'pi.prompt': async (p) => {
      const message = String(p.message ?? '').trim()
      if (!message) throw new Error('消息不能为空')
      await projects.send(projectId(p), { type: 'prompt', message })
      return { sent: true }
    },
    'pi.steer': async (p) => {
      await projects.send(projectId(p), { type: 'steer', message: p.message })
      return { sent: true }
    },
    'pi.abort': async (p) => {
      await projects.send(projectId(p), { type: 'abort' })
      return { aborted: true }
    },
    'pi.new_session': async (p) => {
      const id = projectId(p)
      await projects.send(id, { type: 'new_session' })
      return (await projects.state(id)).state
    },
    'pi.models': async (p) => {
      const r = await projects.send(projectId(p), { type: 'get_available_models' })
      return r.models ?? []
    },
    'pi.set_model': async (p) => projects.send(projectId(p), { type: 'set_model', provider: p.provider, model: p.model }),
    'pi.messages': async (p) => projects.send(projectId(p), { type: 'get_messages' }),
  }
}

// ============================== 本机 HTTP（局域网直连 pi）==============================

let lastEventSeqSeen = 0

function allowHttpOrigin(req, res) {
  const origin = req.headers.origin
  if (!origin) return true
  const localhost = /^http:\/\/localhost(?::\d+)?$/i.test(origin)
  if (!localhost && !HTTP_ORIGINS.has(origin)) return false
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  return true
}

function startHttp() {
  if (!HTTP_PORT) return
  const server = http.createServer((req, res) => {
    if (!allowHttpOrigin(req, res)) {
      res.writeHead(403)
      res.end()
      return
    }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    const auth = req.headers.authorization ?? ''
    if (HTTP_TOKEN && auth !== `Bearer ${HTTP_TOKEN}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: '未授权' }))
      return
    }
    const url = new URL(req.url, 'http://localhost')
    if (req.method === 'POST' && url.pathname === '/cmd') {
      let body = ''
      req.on('data', (d) => {
        body += d
        if (body.length > 65536) req.destroy()
      })
      req.on('end', () => {
        let type = ''
        let payload = {}
        try {
          const parsed = JSON.parse(body)
          type = parsed.type
          payload = parsed.payload ?? {}
        } catch {
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'bad json' }))
          return
        }
        const handler = handlers[type]
        if (!handler) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: `未知指令: ${type}` }))
          return
        }
        handler(payload)
          .then((data) => {
            res.writeHead(200)
            res.end(JSON.stringify({ data: data ?? null }))
          })
          .catch((e) => {
            res.writeHead(500)
            res.end(JSON.stringify({ error: e.message }))
          })
      })
      return
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      const after = Number(url.searchParams.get('after') ?? 0)
      const projectId = url.searchParams.get('projectId')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ events: eventRing.filter((e) => e.seq > after && (!projectId || e.projectId === projectId)), seq: eventSeq }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  server.listen(HTTP_PORT, () => {
    console.log(`[http] 局域网指令入口: http://0.0.0.0:${HTTP_PORT}/cmd`)
  })
}

// ============================== 主流程 ==============================

console.log('========================================')
console.log(' Personal Hub · AI 桥接守护进程 v2')
console.log(` PB:       ${PB_URL}`)
console.log(` 设备:     ${DEVICE}`)
console.log(` Agent:    ${AGENT}`)
console.log(` opencode: ${AGENT === 'opencode' ? OC_BASE : '-'}`)
console.log(` pi:       ${AGENT === 'pi' ? `多项目 · ${PI_PROJECTS_FILE}` : '-'}`)
console.log(` HTTP:     ${HTTP_PORT ? `0.0.0.0:${HTTP_PORT}` : '关闭'}`)
console.log('========================================')

let piProjects = null

function setupAgent() {
  if (AGENT === 'pi') {
    piProjects = new PiProjectManager(PI_BIN, PI_PROJECTS_FILE, PI_CWD, PI_SESSION)
    console.log(`[pi] 多项目管理已就绪：${piProjects.projects.length} 个已登记项目`)
    return makePiHandlers(piProjects)
  }
  if (AGENT === 'codex' || AGENT === 'dsh' || AGENT === 'zcode') {
    const conf = {
      codex: { bin: argOf('codex-bin', 'codex'), args: ['exec'] },
      dsh: { bin: argOf('dsh-bin', 'dsh'), args: ['--profile', 'headless', '-p'] },
      zcode: { bin: argOf('zcode-bin', 'zcode'), args: ['-p'] },
    }[AGENT]
    console.log(`[${AGENT}] 一次性执行模式：${conf.bin} ${conf.args.join(' ')} <prompt>`)
    return makeOneshotHandlers(conf)
  }
  return makeOcHandlers()
}

function sanitizePiEvent(evt) {
  const out = { sessionID: undefined }
  if (evt && typeof evt === 'object') {
    if (typeof evt.type === 'string') out.type = evt.type
    if (evt.session?.id) out.sessionID = evt.session.id
    if (typeof evt.sessionName === 'string') out.sessionName = evt.sessionName
    const delta = evt.assistantMessageEvent
    if (delta?.type === 'text_delta' && typeof delta.delta === 'string') out.delta = delta.delta.slice(0, 4000)
  }
  return out
}

handlers = setupAgent()
startHttp()

let shuttingDown = false
function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  piProjects?.stopAll()
  setTimeout(() => process.exit(0), 150)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

let backoff = 2000
for (;;) {
  try {
    if (PB_ON) {
      if (!pbToken) await pbLogin()
      await heartbeat()
      await pollOnce()
      if (AGENT === 'pi') await flushEventsToPB()
    }
    backoff = 2000
  } catch (e) {
    console.error(`[warn] ${e.message}，${Math.round(backoff / 1000)}s 后重试`)
    pbToken = ''
    await sleep(backoff)
    backoff = Math.min(backoff * 2, 30000)
  }
  await sleep(POLL_MS)
}
