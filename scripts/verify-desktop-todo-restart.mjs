import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const previous = JSON.parse(readFileSync(process.argv[2] ?? '.visual-qa/desktop-todo-latest.json', 'utf8'))
const expected = JSON.parse(readFileSync(resolve(previous.out, 'before-restart.json'), 'utf8'))
const server = createServer()
await new Promise(done => server.listen(0, '127.0.0.1', done))
const port = server.address().port
await new Promise(done => server.close(done))
const child = spawn(previous.exe, [], { windowsHide: true, stdio: 'ignore', env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: resolve(previous.out, 'profile'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1 --no-proxy-server` } })
const endpoint = `http://127.0.0.1:${port}`
const checks = []
let browser
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${endpoint}/json/version`)).ok) break } catch {}
    await new Promise(done => setTimeout(done, 500))
  }
  browser = await chromium.connectOverCDP(endpoint)
  let main, todo
  for (let i = 0; i < 60; i++) {
    const pages = browser.contexts()[0].pages()
    main = pages.find(page => page.url().includes('scripts/fixtures/desktop-todo.html'))
    todo = pages.find(page => page.url().includes('todo=1'))
    if (main && todo) break
    await new Promise(done => setTimeout(done, 300))
  }
  assert.ok(main && todo)
  await main.waitForFunction(() => Boolean(window.todoQA))
  const state = await main.evaluate(() => window.todoQA.inspect())
  assert.equal(state.gated, true); assert.equal(state.keyPresent, false); assert.equal(state.tasks.length, 0)
  assert.equal(state.todo.view.items.length, 0)
  await todo.getByText('请先解锁主窗口', { exact: true }).waitFor()
  assert.equal((await todo.locator('body').textContent()).includes('主窗修改即时到小窗'), false)
  checks.push('restart shows no saved plaintext snapshot or editable task data')
  const geometry = await main.evaluate(() => window.todoQA.geometry())
  assert.deepEqual(geometry.position, expected.position)
  assert.deepEqual(geometry.size, expected.size)
  assert.equal(geometry.pinned, expected.pinned)
  assert.equal(geometry.visible, true)
  checks.push('native position, expanded size, enabled and pinned preferences survive restart')
  await todo.screenshot({ path: resolve(previous.out, 'restart-locked.png') })
  assert.equal(await main.evaluate(() => window.todoQA.unlock()), true)
  await todo.getByText('主窗关闭后新增', { exact: true }).waitFor()
  const restored = await main.evaluate(() => window.todoQA.inspect())
  assert.ok(restored.tasks.some(task => task.done && task.title === '准备下周演示'))
  if (process.argv.includes('--physical')) {
    assert.ok(restored.tasks.some(task => task.title === '鼠标实测新增任务'))
    assert.ok(restored.tasks.some(task => task.done && task.title === '主窗修改即时到小窗'))
    checks.push('physical mouse additions and completion survive a full process restart')
  }
  await main.evaluate(() => window.todoQA.lock())
  await todo.getByText('已锁定 · 只读', { exact: true }).waitFor()
  assert.deepEqual((await main.evaluate(() => window.todoQA.inspect())).todo.view.items.map(item => item.title), ['主窗修改即时到小窗'])
  checks.push('unlock restores saved changes and encrypted lock-display authorization')
  writeFileSync(resolve(previous.out, 'restart.json'), JSON.stringify({ passed: true, checks, geometry }, null, 2))
  console.log(JSON.stringify({ passed: true, checks, geometry }, null, 2))
} catch (error) {
  writeFileSync(resolve(previous.out, 'restart.json'), JSON.stringify({ passed: false, checks, failure: String(error) }, null, 2))
  throw error
} finally {
  await browser?.close()
  if (child.exitCode === null) child.kill()
}
