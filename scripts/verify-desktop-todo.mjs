import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const out = resolve('.visual-qa', `desktop-todo-${Date.now()}`)
mkdirSync(out, { recursive: true })
const socket = createServer()
await new Promise(done => socket.listen(0, '127.0.0.1', done))
const port = socket.address().port
await new Promise(done => socket.close(done))
const exe = resolve('src-tauri/target/debug/personal-hub-desktop.exe')
const child = spawn(exe, [], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: resolve(out, 'profile'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1 --no-proxy-server` } })
child.stdout.on('data', data => appendFileSync(resolve(out, 'native.log'), data))
child.stderr.on('data', data => appendFileSync(resolve(out, 'native.log'), data))
const endpoint = `http://127.0.0.1:${port}`
writeFileSync(resolve(out, 'session.json'), JSON.stringify({ endpoint, pid: child.pid, out }))
let browser, passed = false
const networkErrors = []
const checks = [], errors = []
const appearances = []
try {
  let ready = false
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${endpoint}/json/version`)).ok) { ready = true; break } } catch {}
    await new Promise(done => setTimeout(done, 500))
  }
  assert.ok(ready, 'WebView2 endpoint')
  browser = await chromium.connectOverCDP(endpoint)
  let pages, main, todo
  for (let i = 0; i < 60; i++) {
    pages = browser.contexts()[0].pages()
    main = pages.find(page => page.url().includes('scripts/fixtures/desktop-todo.html'))
    todo = pages.find(page => page.url().includes('todo=1'))
    if (main && todo) break
    await new Promise(done => setTimeout(done, 500))
  }
  assert.ok(main && todo, `QA main and Todo windows: ${pages.map(p => p.url()).join(', ')}`)
  main.on('pageerror', error => errors.push(error.message)); todo.on('pageerror', error => errors.push(error.message))
  main.on('console', message => { if (message.type() === 'error') networkErrors.push(message.text()) })
  main.on('requestfailed', request => networkErrors.push(`${request.url()}: ${request.failure()?.errorText}`))
  main.setDefaultTimeout(20000); todo.setDefaultTimeout(20000)
  await main.reload()
  await main.waitForFunction(() => Boolean(window.todoQA))
  await main.evaluate(() => window.todoQA.seed())
  await todo.getByText('整理今日计划', { exact: true }).waitFor()
  checks.push('isolated native fixture and real task store projection')
  if (process.env.QA_TODO_STYLES === '1') {
    const styles = ['classic', 'swiss', 'terminal', 'brutalist', 'retro', 'botanical', 'orbital', 'atelier', 'blueprint', 'gallery', 'arcade', 'sunrise', 'aurora', 'precision']
    for (const style of styles) {
      for (const mode of ['light', 'dark']) {
        await main.evaluate(([style, mode]) => window.todoQA.appearance(style, mode), [style, mode])
        await todo.waitForFunction(([style, mode]) => document.documentElement.dataset.interface === style && document.documentElement.dataset.theme === mode, [style, mode])
        await todo.getByLabel('快速添加', { exact: true }).fill('检查小窗配色')
        for (const [width, height] of [[300, 240], [360, 480], [480, 640]]) {
          await todo.evaluate(async ([width, height]) => {
            const bounds = await window.__TAURI_INTERNALS__.invoke('todo_window_bounds')
            await window.__TAURI_INTERNALS__.invoke('todo_set_window_bounds', { bounds: { width: Math.round(width * bounds.scale), height: Math.round(height * bounds.scale) } })
          }, [width, height])
          await todo.waitForFunction(([width, height]) => Math.abs(innerWidth - width) < 2 && Math.abs(innerHeight - height) < 2, [width, height])
          const layout = await todo.evaluate(() => {
            const r = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom } }
            const controls = [...document.querySelectorAll('.desktop-todo-titlebar button, .desktop-todo-footer button, #desktop-todo-input')].map(el => {
              const box = r(el), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
              return { label: el.getAttribute('aria-label') || el.textContent.trim(), ...box, reachable: hit === el || el.contains(hit) }
            })
            const fingerprint = ['.desktop-todo-root', '.desktop-todo-titlebar', '.desktop-todo-summary', '.desktop-todo-task', '.desktop-todo-check', '.desktop-todo-task-title', '.desktop-todo-footer .ui-primary-button'].map(selector => {
              const s = getComputedStyle(document.querySelector(selector))
              return [selector, ...['borderRadius', 'borderTopWidth', 'borderTopStyle', 'boxShadow', 'fontFamily', 'fontSize', 'fontWeight', 'padding'].map(key => s[key])]
            })
            const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
            const rgba = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].map((v, i) => i === 3 ? v / 255 : v) }
            const over = (fg, bg) => [...fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3])), 1]
            const lum = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
            const contrast = [...document.querySelectorAll('.desktop-todo-footer .ui-primary-button, .desktop-todo-footer button.text-primary, .desktop-todo-summary > button')].map(el => {
              const chain = []; for (let n = el; n; n = n.parentElement) chain.unshift(n)
              const bg = chain.reduce((bg, n) => over(rgba(getComputedStyle(n).backgroundColor), bg), [255, 255, 255, 1]), fg = over(rgba(getComputedStyle(el).color), bg), a = lum(fg), b = lum(bg)
              return { label: el.textContent.trim(), ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }
            })
            return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth, list: r(document.querySelector('.desktop-todo-list')), controls, fingerprint, contrast }
          })
          appearances.push({ style, mode, ...layout })
          assert.equal(layout.overflow, false, `${style}/${mode}/${width}: width overflow`)
          assert.ok(layout.list.height > 0, `${style}/${mode}/${height}: list remains scrollable`)
          assert.ok(layout.controls.every(c => c.height >= 43 && c.reachable && c.x >= -1 && c.right <= width + 1 && c.bottom <= height + 1), `${style}/${mode}/${width}: controls accessible ${JSON.stringify(layout.controls)}`)
          assert.ok(layout.contrast.every(c => c.ratio >= 4.48), `${style}/${mode}/${width}: text contrast ${JSON.stringify(layout.contrast)}`)
          if (width === 360) await todo.screenshot({ path: resolve(out, `${style}-${mode}.png`) })
        }
        await todo.getByRole('button', { name: '折叠清单', exact: true }).click()
        await main.waitForFunction(async () => { const g = await window.todoQA.geometry(); return Math.abs(g.size.height / g.scale - 56) < 3 })
        await todo.getByRole('button', { name: '展开清单', exact: true }).click()
        await todo.waitForFunction(() => innerHeight > 400)
      }
      console.log(`native Todo style checked: ${style}`)
    }
    assert.equal(new Set(appearances.filter(a => a.width === 360 && a.mode === 'light').map(a => JSON.stringify(a.fingerprint))).size, styles.length)
    checks.push('14 native themes x 2 modes x 3 sizes; real host-to-widget theme events; collapse/expand in every style')
    await todo.getByLabel('快速添加', { exact: true }).fill('')
    await main.evaluate(() => window.todoQA.appearance('swiss', 'light'))
    await todo.evaluate(async () => { const bounds = await window.__TAURI_INTERNALS__.invoke('todo_window_bounds'); await window.__TAURI_INTERNALS__.invoke('todo_set_window_bounds', { bounds: { width: Math.round(360 * bounds.scale), height: Math.round(480 * bounds.scale) } }) })
  }
  await todo.getByLabel('快速添加', { exact: true }).fill('保留输入草稿')
  await new Promise(done => setTimeout(done, 2600))
  assert.equal(await todo.getByLabel('快速添加', { exact: true }).inputValue(), '保留输入草稿')
  await todo.getByLabel('快速添加', { exact: true }).fill('')
  checks.push('background refresh preserves unsent input')
  assert.equal(await todo.evaluate(() => indexedDB.databases().then(values => values.some(db => db.name === 'xk-vault'))), true)
  assert.equal(await todo.evaluate(() => document.body.textContent.includes('不能出现在小窗的测试备注')), false)
  const qa = await main.evaluate(() => window.todoQA.inspect())
  const original = qa.tasks.find(task => task.title === '整理今日计划')
  await main.evaluate(id => window.todoQA.update(id, '主窗修改即时到小窗'), original.id)
  await todo.getByText('主窗修改即时到小窗', { exact: true }).waitFor()
  checks.push('main-to-widget task update')
  await todo.getByRole('button', { name: '置顶小窗', exact: true }).click()
  await main.waitForFunction(async () => (await window.todoQA.geometry()).pinned)
  checks.push('native always-on-top')
  const before = await main.evaluate(() => window.todoQA.geometry())
  await todo.getByRole('button', { name: '折叠清单', exact: true }).click()
  await main.waitForFunction(async () => { const g = await window.todoQA.geometry(); return Math.abs(g.size.height / g.scale - 56) < 3 })
  await todo.getByRole('button', { name: '展开清单', exact: true }).click()
  await main.waitForFunction(async height => (await window.todoQA.geometry()).size.height === height, before.size.height)
  checks.push('collapse and expanded size restoration')
  await main.evaluate(() => window.todoQA.closeMain())
  await main.waitForFunction(async () => !(await window.todoQA.inspect()).mainVisible)
  assert.equal((await main.evaluate(() => window.todoQA.geometry())).visible, true)
  await todo.getByLabel('快速添加', { exact: true }).fill('主窗关闭后新增')
  await todo.getByRole('button', { name: '添加', exact: true }).click()
  await todo.getByText('主窗关闭后新增', { exact: true }).waitFor()
  await main.waitForFunction(async () => (await window.todoQA.inspect()).tasks.some(task => task.title === '主窗关闭后新增'))
  checks.push('main close hides only main; widget writes persist while main hidden')
  await todo.getByRole('button', { name: '完成：准备下周演示', exact: true }).click()
  await todo.getByRole('button', { name: '确认完成', exact: true }).click()
  await main.waitForFunction(async () => (await window.todoQA.inspect()).tasks.some(task => task.title === '准备下周演示' && task.done))
  const completed = await main.evaluate(() => window.todoQA.inspect())
  const repeated = completed.tasks.find(task => task.title === '准备下周演示' && task.done)
  assert.equal(completed.tasks.filter(task => task.repeatSourceId === repeated.id).length, 1)
  checks.push('widget completion persists and generates exactly one repeated instance')
  await main.evaluate(() => window.todoQA.lock())
  await todo.getByText('已锁定 · 只读', { exact: true }).waitFor()
  const locked = await main.evaluate(() => window.todoQA.inspect())
  assert.equal(locked.keyPresent, false); assert.equal(locked.tasks.length, 0)
  assert.deepEqual(locked.todo.view.items.map(item => item.id), [original.id])
  assert.deepEqual(Object.keys(locked.todo.view.items[0]).sort(), ['date', 'done', 'id', 'time', 'title'])
  assert.equal(await todo.locator('input').count(), 0)
  assert.equal(await todo.getByRole('button', { name: '完成：主窗修改即时到小窗' }).count(), 0)
  await todo.screenshot({ path: resolve(out, 'locked.png') })
  checks.push('lock clears key and full task store; whitelist-only immutable snapshot')
  const rejected = await todo.evaluate(async () => {
    try { await window.__TAURI_INTERNALS__.invoke('todo_publish', { owner: 'forged', view: {} }); return false } catch { return true }
  })
  assert.equal(rejected, true)
  const layoutScope = await main.evaluate(async () => {
    try { await window.__TAURI_INTERNALS__.invoke('todo_set_window_bounds', { bounds: { x: 1, y: 1 } }); return false } catch { return true }
  })
  assert.equal(layoutScope, true)
  const arbitraryWindow = await todo.evaluate(async () => {
    try { await window.__TAURI_INTERNALS__.invoke('plugin:window|set_position', { label: 'main', value: { Physical: { x: 1, y: 1 } } }); return false } catch { return true }
  })
  assert.equal(arbitraryWindow, true)
  checks.push('layout commands are Todo-only; widget cannot move arbitrary windows')
  const blocked = await todo.evaluate(async () => {
    const state = await window.__TAURI_INTERNALS__.invoke('todo_read')
    try { await window.__TAURI_INTERNALS__.invoke('todo_submit', { request: { id: crypto.randomUUID(), epoch: state.view.epoch, revision: state.view.revision, action: 'add', text: '禁止写入' } }); return false } catch { return true }
  })
  assert.equal(blocked, true)
  checks.push('native ACL denies widget publication; locked native IPC denies edits')
  await main.evaluate(() => window.todoQA.unlock())
  await todo.getByText('主窗关闭后新增', { exact: true }).waitFor()
  await todo.getByRole('button', { name: '打开主窗', exact: true }).click()
  await main.waitForFunction(async () => (await window.todoQA.inspect()).mainVisible)
  await todo.screenshot({ path: resolve(out, 'ready.png') })
  const geometry = await main.evaluate(() => window.todoQA.geometry())
  writeFileSync(resolve(out, 'before-restart.json'), JSON.stringify(geometry, null, 2))
  assert.deepEqual(errors, [])
  checks.push('unlock restores writable projection; open main reveals same owner')
  if (process.env.QA_TODO_STYLES === '1') {
    await main.goto(new URL('/', main.url()).href)
    await main.getByPlaceholder('主密码', { exact: true }).fill('Todo-isolated-fixture-2026')
    await main.getByRole('button', { name: '登录', exact: true }).click()
    await main.locator('.today-workspace').waitFor()
    await main.getByRole('button', { name: '管理桌面清单', exact: true }).click()
    await main.getByLabel('桌面清单设置', { exact: true }).waitFor()
    await main.getByRole('button', { name: '外观', exact: true }).click()
    await main.getByRole('button', { name: '界面样式', exact: true }).click()
    await main.locator('.interface-style-option').filter({ has: main.locator('[data-preview="botanical"]') }).click()
    await todo.waitForFunction(() => document.documentElement.dataset.interface === 'botanical')
    await main.getByRole('button', { name: '关闭设置', exact: true }).click()
    await main.locator('.today-task-row').filter({ hasText: '主窗关闭后新增' }).waitFor()
    await main.screenshot({ path: resolve(out, 'integrated-dashboard.png') })
    await todo.screenshot({ path: resolve(out, 'integrated-todo.png') })
    await main.getByRole('button', { name: '锁定', exact: true }).filter({ visible: true }).click()
    await todo.getByText('已锁定 · 只读', { exact: true }).waitFor()
    checks.push('actual App dashboard opens native Todo settings; appearance picker updates native widget; actual lock projects readonly whitelist')
  }
  passed = true
  const report = { passed, out, checks, errors, appearances, geometry, endpoint, pid: child.pid, exe, boundary: 'Isolated synthetic native data; real mouse drag, monitor changes and restart checked separately.' }
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2))
  writeFileSync(resolve('.visual-qa', 'desktop-todo-latest.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (process.argv.includes('--keep-open')) {
    await new Promise(done => {
      const timer = setInterval(() => { if (existsSync(resolve(out, 'finish.json')) || child.exitCode !== null) { clearInterval(timer); done() } }, 500)
    })
  }
} catch (error) {
  const todoPage = browser?.contexts()[0]?.pages().find(page => page.url().includes('todo=1'))
  await todoPage?.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {})
  const pages = browser ? await Promise.all(browser.contexts()[0].pages().map(async page => ({ url: page.url(), text: await page.locator('body').textContent().catch(() => ''), tauri: await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__)).catch(() => false) }))) : []
  const failure = { passed: false, checks, errors, appearances, networkErrors, pages, failure: String(error), endpoint, pid: child.pid }
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(failure, null, 2))
  console.error(JSON.stringify(failure, null, 2))
  throw error
} finally {
  await browser?.close()
  if (child.exitCode === null) child.kill()
}
