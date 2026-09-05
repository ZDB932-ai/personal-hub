#!/usr/bin/env node

import { createInterface } from 'node:readline'

const args = process.argv.slice(2)
const argOf = (name, fallback = '') => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const baseUrl = argOf('url', 'http://127.0.0.1:8811').replace(/\/+$/, '')
const token = argOf('token', '')
let projectId = argOf('project', '')
let projectName = ''
let messages = []
let lastSnapshot = ''
let busy = false
let closed = false

async function command(type, payload = {}) {
  const response = await fetch(`${baseUrl}/cmd`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ type, payload }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `bridge 请求失败（${response.status}）`)
  return result.data
}

function textOf(message) {
  if (typeof message?.content === 'string') return message.content
  if (!Array.isArray(message?.content)) return ''
  const chunks = []
  for (const block of message.content) {
    if (block?.type === 'text' && block.text) chunks.push(block.text)
    if (block?.type === 'toolCall') {
      const shell = block.arguments?.command
      chunks.push(`调用工具：${block.name || '未知工具'}${shell ? `\n${shell}` : ''}`)
    }
  }
  return chunks.join('\n').slice(0, 12000)
}

function render(force = false) {
  if (closed) return
  const snapshot = JSON.stringify(messages)
  if (!force && snapshot === lastSnapshot) return
  lastSnapshot = snapshot
  process.stdout.write('\x1b[2J\x1b[H')
  console.log('Personal Hub · pi 同步终端')
  console.log(`${projectName} · ${busy ? '处理中' : '空闲'} · ${baseUrl}`)
  console.log('此终端与 Hub 共用 RPC；请勿同时在原生 pi TUI 中写入同一会话。')
  console.log('命令：/sync  /new  /abort  /help  /quit')
  console.log('='.repeat(72))
  for (const message of messages) {
    const role = message?.role === 'user' ? '你' : message?.role === 'toolResult' ? `工具 ${message.toolName || ''}`.trim() : 'pi'
    const text = textOf(message)
    if (!text) continue
    console.log(`\n[${role}]`)
    console.log(text)
  }
  console.log('\n' + '-'.repeat(72))
  rl.prompt(true)
}

async function refresh() {
  const state = await command('pi.state', { projectId })
  busy = Boolean(state?.isStreaming || state?.isCompacting)
  const result = await command('pi.messages', { projectId })
  messages = Array.isArray(result) ? result : Array.isArray(result?.messages) ? result.messages : []
  render()
}

async function chooseProject() {
  const projects = await command('pi.projects.list')
  if (!Array.isArray(projects) || projects.length === 0) throw new Error('bridge 尚未登记 pi 项目')
  let project = projects.find((item) => item.id === projectId)
  if (!project) {
    if (projects.length > 1) {
      console.log('请选择项目：')
      projects.forEach((item, index) => console.log(`${index + 1}. ${item.name} · ${item.cwd}`))
      const answer = await new Promise((resolve) => {
        const chooser = createInterface({ input: process.stdin, output: process.stdout })
        chooser.question('项目编号：', (value) => {
          chooser.close()
          resolve(value)
        })
      })
      project = projects[Number(answer) - 1]
    } else {
      project = projects[0]
    }
  }
  if (!project) throw new Error('项目选择无效')
  projectId = project.id
  projectName = project.name
  await command('pi.projects.select', { projectId })
}

async function handleInput(value) {
  const input = value.trim()
  if (!input) return
  if (input === '/quit') {
    closed = true
    rl.close()
    return
  }
  if (input === '/help') {
    console.log('/sync 从 session 文件加载最新分支；/new 新会话；/abort 中止；/quit 退出')
    return
  }
  if (input === '/sync') {
    await command('pi.sync', { projectId })
    await refresh()
    return
  }
  if (input === '/new') {
    await command('pi.new_session', { projectId })
    await refresh()
    return
  }
  if (input === '/abort') {
    await command('pi.abort', { projectId })
    await refresh()
    return
  }
  await command(busy ? 'pi.steer' : 'pi.prompt', { projectId, message: input })
  busy = true
  render(true)
}

const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' })
rl.on('line', (line) => {
  void handleInput(line).catch((error) => {
    console.error(`\n错误：${error.message}`)
    rl.prompt(true)
  })
})
rl.on('close', () => {
  closed = true
  process.stdout.write('\n')
})

try {
  await command('ping')
  await chooseProject()
  await refresh()
  setInterval(() => {
    if (!closed) void refresh().catch(() => {})
  }, 1200).unref()
} catch (error) {
  console.error(`启动失败：${error.message}`)
  rl.close()
  process.exitCode = 1
}
