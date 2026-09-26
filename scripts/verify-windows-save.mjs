import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PHUB_PLAYWRIGHT_MODULE ?? 'playwright')
if (!process.env.PHUB_QA_DESKTOP_PROFILE) throw new Error('需要 PHUB_QA_DESKTOP_PROFILE，必须为已有合成数据的隔离 QA 配置目录')
const directory = resolve('.visual-qa', `windows-save-${Date.now()}`)
mkdirSync(directory, { recursive: true })
const output = join(directory, 'verified.bin')
const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const child = spawn(resolve('src-tauri/target/release/personal-hub-desktop.exe'), [], {
  windowsHide: false, stdio: 'ignore',
  env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: resolve(process.env.PHUB_QA_DESKTOP_PROFILE), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` },
})
let browser
const results = [], errors = []
const sizeMiB = Number(process.env.PHUB_QA_SAVE_MIB ?? 10)
assert.ok([10, 50].includes(sizeMiB))
const pass = message => { results.push(message); console.log(`PASS: ${message}`) }
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break } catch {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const page = browser.contexts()[0].pages()[0]
  page.setDefaultTimeout(30000)
  page.on('pageerror', error => errors.push(error.message))
  await page.getByPlaceholder('主密码', { exact: true }).fill('QA-Native-Desktop-Password')
  await page.getByRole('button', { name: '解锁', exact: true }).click()
  await page.getByRole('button', { name: '编辑资料', exact: true }).waitFor()
  await page.evaluate(() => {
    const original = window.fetch.bind(window)
    const saveUrl = window.__TAURI_INTERNALS__.convertFileSrc('plugin:dialog|save', 'ipc')
    const writeUrl = window.__TAURI_INTERNALS__.convertFileSrc('plugin:fs|write_file', 'ipc')
    const messageUrl = window.__TAURI_INTERNALS__.convertFileSrc('plugin:dialog|message', 'ipc')
    window.qaWindowEvents = []; window.qaSaveEvents = []
    window.qaDialogRequests = []
    window.qaAlerts = []
    new MutationObserver(() => { for (const el of document.querySelectorAll('[role=alert], .pointer-events-none .rounded-full')) window.qaAlerts.push(el.textContent) }).observe(document.body, { subtree: true, childList: true })
    window.fetch = async (input, options) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url === saveUrl || url === messageUrl) window.qaDialogRequests.push({ kind: url === saveUrl ? 'save' : 'message' })
      if (url.includes('window')) window.qaWindowEvents.push({ url, stage: 'request' })
      const response = await original(input, options)
      if (url.includes('window')) window.qaWindowEvents.push({ url, stage: 'reply', value: await response.clone().text() })
      if (url === saveUrl || url === writeUrl || url === messageUrl) {
        const ok = response.headers.get('Tauri-Response') === 'ok'
        const value = await response.clone().text()
        window.qaSaveEvents.push({ kind: url === saveUrl ? 'dialog' : url === messageUrl ? 'message' : 'write', ok, value })
      }
      return response
    }
    location.hash = '#/docs'
  })
  await page.getByRole('heading', { name: '个人资料库', exact: true }).waitFor()
  const name = process.env.PHUB_QA_SAVE_NAME ?? (sizeMiB === 50 ? `qa-windows-save-50-${Date.now()}.bin` : (await page.locator('article p[title]').allTextContents()).find(value => /^phone-\d+\.bin$/.test(value)))
  if (!name) throw new Error('未找到 QA 的 10 MiB 附件')
  if (sizeMiB === 50 && !(await page.getByText(name, { exact: true }).count())) {
    await page.locator('input[type=file]').evaluate((input, name) => {
      const bytes = new Uint8Array(50 * 1024 * 1024)
      for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], name, { type: 'application/octet-stream' }))
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, name)
    await page.getByText(name, { exact: true }).waitFor({ timeout: 120000 })
  }
  const download = page.locator('article').filter({ has: page.getByText(name, { exact: true }) }).getByRole('button', { name: '下载', exact: true })
  let path = process.env.PHUB_QA_SAVED_FILE
  if (!path) {
    await download.click()
    console.log(`WAIT_SAVE: 请在 Windows 系统保存窗口将文件保存至 ${output}`)
    await page.waitForFunction(() => window.qaSaveEvents.some(event => event.kind === 'write' || !event.ok || (event.kind === 'dialog' && event.value === 'null')), null, { timeout: 600000 })
    const events = await page.evaluate(() => window.qaSaveEvents)
    assert.ok(events.some(event => event.kind === 'write' && event.ok), JSON.stringify(events))
    path = JSON.parse(events.find(event => event.kind === 'dialog').value)
  }
  const bytes = readFileSync(path)
  const expected = Buffer.alloc(sizeMiB * 1024 * 1024)
  for (let i = 0; i < expected.length; i++) expected[i] = i % 251
  assert.equal(bytes.length, expected.length)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), createHash('sha256').update(expected).digest('hex'))
  pass(`Windows 系统保存窗口实际写入 ${sizeMiB} MiB 附件，大小与 SHA-256 一致`)
  writeFileSync(join(directory, 'save-checkpoint.json'), JSON.stringify({ savedFileVerified: true, cancelVerified: false, sizeMiB, output: path, results, errors }, null, 2))
  await page.evaluate(() => { window.qaSaveEvents = [] })
  await download.click()
  await page.waitForFunction(() => window.qaDialogRequests.length > 0 || window.qaAlerts.length > 0)
  const downloadAlerts = await page.evaluate(() => window.qaAlerts)
  assert.deepEqual(downloadAlerts, [], '下载未进入保存对话框：' + downloadAlerts.join('；'))
  const windowState = await page.evaluate(() => window.qaDialogRequests.at(-1))


  writeFileSync(join(directory, 'window-checkpoint.json'), JSON.stringify(windowState, null, 2))
  console.log('WAIT_CANCEL: 请取消第二次 Windows 系统保存窗口')
  await page.waitForFunction(() => window.qaSaveEvents.some(event => event.kind === 'dialog'), null, { timeout: 600000 })
  const events = await page.evaluate(() => window.qaSaveEvents)
  assert.equal(events[0].ok, true)
  assert.equal(events[0].value, 'null')
  assert.equal(events.some(event => event.kind === 'write'), false)
  pass('取消系统保存不写入，页面没有异常')
  if (sizeMiB === 50) {
    await page.locator('article').filter({ has: page.getByText(name, { exact: true }) }).getByRole('button', { name: '删除文件', exact: true }).click()
    console.log('WAIT_CONFIRM_CANCEL: 请在删除确认窗口点击取消，验证附件保留')
    await page.waitForFunction(() => window.qaSaveEvents.some(event => event.kind === 'message'), null, { timeout: 600000 })
    const confirmation = await page.evaluate(() => window.qaSaveEvents.find(event => event.kind === 'message'))
    assert.equal(confirmation.ok, true)
    assert.equal(JSON.parse(confirmation.value), '取消')
    await page.getByText(name, { exact: true }).waitFor()
    pass('原生删除确认选择取消，附件仍保留且未发生 ACL 错误')
  }
  assert.deepEqual(errors, [])
  writeFileSync(join(directory, 'report.json'), JSON.stringify({ passed: true, results, errors, output: path, resumedSavedFile: Boolean(process.env.PHUB_QA_SAVED_FILE) }, null, 2))
  console.log(`验证记录：${directory}`)
} catch (error) {
  const alerts = await browser?.contexts()[0]?.pages()[0]?.evaluate(() => window.qaAlerts).catch(() => [])
  const windowEvents = await browser?.contexts()[0]?.pages()[0]?.evaluate(() => window.qaWindowEvents).catch(() => [])
  const pageText = await browser?.contexts()[0]?.pages()[0]?.locator('body').innerText().catch(() => '')
  writeFileSync(join(directory, 'report.json'), JSON.stringify({ passed: false, results, errors, alerts, windowEvents, pageText, failure: String(error) }, null, 2))
  throw error
} finally {
  await browser?.close()
  if (child.exitCode === null) child.kill()
}
