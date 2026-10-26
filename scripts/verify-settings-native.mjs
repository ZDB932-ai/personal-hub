import { chromium } from 'playwright'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createServer as createSocket } from 'node:net'
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, extname, sep } from 'node:path'
import assert from 'node:assert/strict'

const exe = resolve('src-tauri/target/debug/personal-hub-desktop.exe')
const product = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Item -LiteralPath '${exe.replaceAll("'", "''")}').VersionInfo.ProductName`], { encoding: 'utf8', windowsHide: true }).trim()
assert.equal(product, 'Personal Hub Todo QA', 'Only the isolated QA executable may run')
const out = resolve('.visual-qa', `settings-native-${Date.now()}`)
mkdirSync(out, { recursive: true })
const root = resolve('.visual-qa/settings-native-bundle')
const report = { passed: false, boundary: 'Existing isolated Todo QA debug executable and fresh WebView profile; current production frontend source; no release application or user profile accessed. No physical Android coverage.', executable: { path: exe, product, sha256: createHash('sha256').update(readFileSync(exe)).digest('hex') }, bundleSha256: createHash('sha256').update(readFileSync(resolve(root, 'index.html'))).digest('hex'), checks: [], layouts: [], errors: [], blockedExternal: [] }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary' }
const server = createServer((request, response) => {
  try {
    const path = resolve(root, `.${new URL(request.url, 'http://localhost').pathname === '/' ? '/index.html' : decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`)
    if (!path.startsWith(root + sep) || !statSync(path).isFile()) throw new Error('not found')
    response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream')
    response.setHeader('Cache-Control', 'no-store')
    createReadStream(path).pipe(response)
  } catch { response.writeHead(404); response.end() }
})
await new Promise((done, reject) => { server.once('error', reject); server.listen(5187, '127.0.0.1', done) })
const socket = createSocket()
await new Promise(done => socket.listen(0, '127.0.0.1', done))
const port = socket.address().port
await new Promise(done => socket.close(done))
const child = spawn(exe, [], { windowsHide: true, stdio: 'ignore', env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: resolve(out, 'profile'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1 --no-proxy-server` } })
writeFileSync(resolve(out, 'session.json'), JSON.stringify({ pid: child.pid, port, profile: resolve(out, 'profile') }))
let browser, main
const waitFor = async fn => { for (let i = 0; i < 80; i++) { const value = await fn().catch(() => undefined); if (value) return value; await new Promise(done => setTimeout(done, 500)) } throw new Error('Timed out waiting for isolated native fixture') }
try {
  await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).ok)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const context = browser.contexts()[0]
  await context.route('**/*', route => {
    const url = route.request().url()
    if (/^https?:/.test(url) && !['http://127.0.0.1:5187', 'http://ipc.localhost'].includes(new URL(url).origin)) { report.blockedExternal.push(new URL(url).origin); return route.abort() }
    return route.continue()
  })
  main = await waitFor(async () => context.pages().find(page => page.url().includes('/scripts/fixtures/desktop-todo.html')))
  main.setDefaultTimeout(20000)
  main.on('pageerror', error => report.errors.push(error.message))
  await main.waitForFunction(() => Boolean(window.todoQA))
  await main.evaluate(() => window.todoQA.seed())
  const todo = await waitFor(async () => context.pages().find(page => page.url().includes('todo=1')))
  await main.goto('http://127.0.0.1:5187/')
  await main.getByPlaceholder('主密码', { exact: true }).fill('Todo-isolated-fixture-2026')
  await main.getByRole('button', { name: '登录', exact: true }).click()
  await main.locator('.today-workspace').waitFor()
  await main.getByRole('button', { name: '管理桌面清单', exact: true }).click()
  const panel = main.getByRole('dialog', { name: '设置', exact: true })
  const nav = label => panel.getByRole('navigation', { name: '设置分类' }).getByRole('button').filter({ has: main.getByText(label, { exact: true }) })
  const section = () => panel.getByRole('region', { name: '桌面清单设置', exact: true })
  await section().waitFor()
  assert.equal(await nav('桌面清单').count(), 1)
  const read = () => main.evaluate(() => window.__TAURI_INTERNALS__.invoke('todo_read'))
  await section().getByRole('checkbox', { name: '始终显示在其他窗口上方' }).check()
  await main.waitForFunction(async () => (await window.__TAURI_INTERNALS__.invoke('todo_read')).preferences.pinned)
  await section().getByRole('checkbox', { name: '靠近屏幕边缘时吸附' }).uncheck()
  await main.waitForFunction(async () => !(await window.__TAURI_INTERNALS__.invoke('todo_read')).preferences.snap)
  await section().getByRole('combobox', { name: '显示哪些任务' }).click()
  await main.getByRole('option', { name: '手动选择任务', exact: true }).click()
  const taskRow = section().locator('div.border-b').filter({ hasText: '准备下周演示' })
  await taskRow.getByRole('checkbox', { name: '加入清单' }).check()
  await taskRow.getByRole('checkbox', { name: '锁定可见' }).check()
  await main.waitForFunction(async () => { const state = await window.__TAURI_INTERNALS__.invoke('todo_read'); return state.view.source === 'manual' && state.view.items.length === 1 && state.view.items[0].title === '准备下周演示' })
  await section().getByRole('searchbox', { name: '搜索任务' }).fill('保留筛选草稿')
  await nav('关于与帮助').click(); await nav('桌面清单').click()
  assert.equal(await section().getByRole('searchbox', { name: '搜索任务' }).inputValue(), '保留筛选草稿')
  await section().getByRole('searchbox', { name: '搜索任务' }).fill('')
  report.checks.push('Actual settings controls persist pin, edge snap, manual task selection and lock visibility through native IPC; section switches preserve the filter draft')
  const styles = ['classic', 'sunrise', 'aurora', 'precision', 'swiss', 'terminal', 'brutalist', 'retro', 'botanical', 'orbital', 'atelier', 'blueprint', 'gallery', 'arcade']
  for (const style of styles) {
    await nav('外观').click()
    await panel.getByRole('button', { name: '界面风格', exact: true }).click()
    await panel.locator('.interface-style-option').filter({ has: main.locator(`[data-preview="${style}"]`) }).click()
    await todo.waitForFunction(style => document.documentElement.dataset.interface === style, style)
    for (const mode of ['light', 'dark']) {
      await panel.getByRole('button', { name: '颜色与显示', exact: true }).click()
      await panel.getByRole('button', { name: mode === 'light' ? '浅色' : '深色', exact: true }).click()
      await todo.waitForFunction(mode => document.documentElement.dataset.theme === mode, mode)
      await nav('桌面清单').click()
      const layout = await section().evaluate(element => ({ scrollWidth: element.scrollWidth, width: element.clientWidth, controls: [...element.querySelectorAll('button, summary, label.settings-row')].filter(item => item.getClientRects().length).map(item => ({ label: item.textContent.trim(), height: item.getBoundingClientRect().height })), radius: getComputedStyle(element.querySelector('.settings-card')).borderRadius }))
      assert.ok(layout.scrollWidth <= layout.width + 1, `${style}/${mode}: no horizontal overflow`)
      assert.ok(layout.controls.every(control => control.height >= 43), `${style}/${mode}: controls at least 44px`)
      report.layouts.push({ style, mode, ...layout })
      if (['classic', 'terminal', 'botanical'].includes(style)) await main.screenshot({ path: resolve(out, `${style}-${mode}.png`) })
      await nav('外观').click()
    }
    console.log(`Native settings checked: ${style}`)
  }
  report.checks.push('All 14 styles in light and dark reach actual Windows settings and independent native Todo window with no content overflow and 44px controls')
  await panel.getByRole('button', { name: '关闭设置', exact: true }).click()
  await main.reload()
  await main.getByPlaceholder('主密码', { exact: true }).fill('Todo-isolated-fixture-2026')
  await main.getByRole('button', { name: '登录', exact: true }).click()
  await main.getByRole('button', { name: '管理桌面清单', exact: true }).click()
  await section().waitFor()
  assert.equal(await section().getByRole('searchbox', { name: '搜索任务' }).inputValue(), '')
  const state = await read()
  assert.equal(state.preferences.pinned, true); assert.equal(state.preferences.snap, false)
  assert.equal(state.view.source, 'manual'); assert.equal(state.view.items[0].title, '准备下周演示')
  report.checks.push('Encrypted selection and native window preferences survive reload; closed settings discard temporary filter draft')
  assert.deepEqual(report.errors, [])
  report.passed = true
} catch (error) {
  report.failure = String(error)
  await main?.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {})
  throw error
} finally {
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2))
  await browser?.close()
  if (child.exitCode === null) child.kill()
  await new Promise(done => server.close(done))
  console.log(JSON.stringify({ passed: report.passed, out, checks: report.checks.length, layouts: report.layouts.length, failure: report.failure }))
}
