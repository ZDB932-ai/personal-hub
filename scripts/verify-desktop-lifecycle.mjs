import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'

if (process.platform !== 'win32') throw new Error('此验收仅适用于 Windows')
const root = resolve(import.meta.dirname, '..')
const reuse = process.env.PHUB_DESKTOP_QA_RUN
if (reuse && !/^\d{13}$/.test(reuse)) throw new Error('PHUB_DESKTOP_QA_RUN 必须是已有验收的时间戳')
const runId = reuse ?? Date.now().toString()
const output = resolve(root, '.visual-qa', `desktop-lifecycle-${runId}`)
const identifier = `com.zdb.personalhub.qa-${runId}`
const configDir = join(process.env.APPDATA, identifier)
const stateFile = join(configDir, '.window-state.json')
const executable = join(output, 'personal-hub-qa.exe')
await mkdir(output, { recursive: true })
const config = {
  identifier,
  productName: 'Personal Hub QA',
  build: { beforeBuildCommand: '' },
  app: { security: { capabilities: ['default', 'pet', {
    identifier: 'qa-window-controls',
    windows: ['main'],
    permissions: ['core:window:allow-set-size', 'core:window:allow-set-position', 'core:window:allow-close', 'core:window:allow-maximize', 'core:window:allow-unmaximize', 'core:window:allow-minimize'],
  }] } },
}
const configPath = join(output, 'tauri.qa.json')
if (reuse) {
  assert.equal(JSON.parse(await readFile(configPath, 'utf8')).identifier, identifier)
} else {
  await writeFile(configPath, JSON.stringify(config, null, 2))
  const build = spawn(process.execPath, [resolve(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'build', '--no-bundle', '--config', configPath], { cwd: root, stdio: 'inherit', windowsHide: true })
  const [buildCode] = await once(build, 'exit')
  assert.equal(buildCode, 0, '隔离身份的原生测试构建失败')
  await copyFile(resolve(root, 'src-tauri/target/release/personal-hub-desktop.exe'), executable)
}

const checks = []
const errors = []
let active
async function until(predicate, label, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await predicate()
    if (value) return value
    await delay(100)
  }
  throw new Error(`等待超时：${label}`)
}
async function launch() {
  const socket = createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  const env = { ...process.env, WEBVIEW2_USER_DATA_FOLDER: join(output, 'profile'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` }
  const child = spawn(executable, [], { windowsHide: true, stdio: 'ignore', env })
  child.on('error', error => errors.push(error.message))
  active = { child, env }
  const endpoint = `http://127.0.0.1:${port}`
  await until(async () => {
    if (child.exitCode !== null) throw new Error(`测试进程提前退出：${child.exitCode}`)
    try { return (await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) })).ok } catch { return false }
  }, 'WebView2 调试端口', 30000)
  active.browser = await chromium.connectOverCDP(endpoint)
  active.page = await until(() => active.browser.contexts()[0].pages().find(page => page.url().includes('tauri') && !page.url().includes('pet=1')), '主窗口页面')
  active.page.on('pageerror', error => errors.push(error.message))
  await active.page.getByPlaceholder('创建主密码', { exact: true }).waitFor()
  return active
}
async function invoke(command, extra = {}) {
  return active.page.evaluate(({ command, extra }) => window.__TAURI_INTERNALS__.invoke(`plugin:window|${command}`, { label: 'main', ...extra }), { command, extra })
}
async function stop() {
  if (!active) return
  const { child, browser } = active
  if (child.exitCode === null) {
    const exited = once(child, 'exit')
    child.kill()
    await exited
  }
  await browser?.close().catch(() => {})
  active = undefined
}
async function checkpoint() {
  await invoke('close')
  await until(async () => !await invoke('is_visible'), '关闭后隐藏到托盘')
  return JSON.parse(await readFile(stateFile, 'utf8'))
}
async function duplicate() {
  const child = spawn(executable, [], { windowsHide: true, stdio: 'ignore', env: active.env })
  try {
    await until(() => child.exitCode !== null, '重复启动进程退出')
    assert.equal(child.exitCode, 0)
    await until(() => invoke('is_visible'), '唤回主窗口')
    await until(async () => !await invoke('is_minimized'), '恢复最小化窗口')
  } finally {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited }
  }
}

try {
  await launch()
  assert.equal(await invoke('is_visible'), true)
  const monitor = await invoke('current_monitor')
  const expectedPosition = { x: monitor.position.x + 80, y: monitor.position.y + 60 }
  await invoke('unmaximize')
  await invoke('set_size', { value: { Logical: { width: 1000, height: 680 } } })
  await invoke('set_position', { value: { Physical: expectedPosition } })
  await until(async () => JSON.stringify(await invoke('outer_position')) === JSON.stringify(expectedPosition), '测试窗口位置')
  const expectedSize = await invoke('inner_size')
  await active.page.evaluate(() => { window.__qaInstanceMarker = 'first-instance' })
  let state = await checkpoint()
  assert.deepEqual(Object.keys(state), ['main'], '玩偶不得纳入主窗口状态保存')
  assert.equal(state.main.width, expectedSize.width)
  assert.equal(state.main.height, expectedSize.height)
  await duplicate()
  assert.equal(await active.page.evaluate(() => window.__qaInstanceMarker), 'first-instance')
  checks.push('close-to-tray', 'second-launch-reveals-existing-instance', 'pet-state-excluded')
  await invoke('minimize')
  await until(() => invoke('is_minimized'), '最小化')
  await duplicate()
  assert.equal(await active.page.evaluate(() => window.__qaInstanceMarker), 'first-instance')
  checks.push('second-launch-restores-minimized-window')
  await checkpoint()
  await stop()

  await launch()
  assert.deepEqual(await invoke('inner_size'), expectedSize)
  assert.deepEqual(await invoke('outer_position'), expectedPosition)
  assert.equal(await invoke('is_visible'), true)
  assert.equal(await invoke('is_minimized'), false)
  await active.page.screenshot({ path: join(output, 'restored-main.png'), animations: 'disabled' })
  checks.push('size-position-restored', 'startup-visible-after-tray-close')
  await invoke('maximize')
  await until(() => invoke('is_maximized'), '最大化')
  state = await checkpoint()
  assert.equal(state.main.maximized, true)
  await stop()
  await launch()
  assert.equal(await invoke('is_maximized'), true)
  await invoke('unmaximize')
  await until(async () => !await invoke('is_maximized'), '还原最大化')
  assert.deepEqual(await invoke('inner_size'), expectedSize)
  checks.push('maximized-restored', 'unmaximize-restores-normal-size')
  await checkpoint()
  await stop()

  state = JSON.parse(await readFile(stateFile, 'utf8'))
  Object.assign(state.main, { x: 100000, y: 100000, prev_x: 100000, prev_y: 100000, maximized: false })
  await writeFile(stateFile, JSON.stringify(state))
  await launch()
  const position = await invoke('outer_position')
  assert.ok(position.x < 100000 && position.y < 100000, '失效显示器位置不应被恢复')
  assert.equal(await invoke('is_visible'), true)
  checks.push('offscreen-position-ignored')
  await stop()
  await writeFile(stateFile, '{invalid')
  await launch()
  assert.equal(await invoke('is_visible'), true)
  checks.push('corrupt-window-state-falls-back')
  assert.deepEqual(errors, [])
  await writeFile(join(output, 'report.json'), JSON.stringify({ passed: true, identifier, executable, configDir, checks, errors, boundary: '独立应用标识与 WebView2 数据目录；未操作个人保险库、未验收安装升级或实体多屏 DPI 切换；测试构建有额外窗口控制权限，生产权限未扩展。测试结束后需重新运行默认 desktop:build 恢复生产构建产物。' }, null, 2))
  console.log(`PASS: Windows 生命周期验收 ${checks.length} 项；${output}`)
} catch (error) {
  await writeFile(join(output, 'report.json'), JSON.stringify({ passed: false, identifier, executable, configDir, checks, errors, error: String(error) }, null, 2))
  throw error
} finally {
  await stop()
}
