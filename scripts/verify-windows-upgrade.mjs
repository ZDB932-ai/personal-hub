import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { captureNativeDownload } from './capture-native-download.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PHUB_PLAYWRIGHT_MODULE ?? 'playwright')
const executable = process.env.PHUB_QA_INSTALLED_EXE
const profile = process.env.PHUB_QA_DESKTOP_PROFILE
const expectedVersion = process.env.PHUB_QA_VERSION
if (!executable || !profile || !expectedVersion) throw new Error('需要隔离安装路径、QA 配置目录和预期版本')
const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const processHandle = spawn(resolve(executable), [], { windowsHide: true, stdio: 'ignore', env: { ...process.env,
  WEBVIEW2_USER_DATA_FOLDER: resolve(profile), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` } })
let browser
const errors = []
try {
  const endpoint = `http://127.0.0.1:${port}`
  let ready = false
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${endpoint}/json/version`)).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  assert.ok(ready)
  browser = await chromium.connectOverCDP(endpoint)
  const page = browser.contexts()[0].pages()[0]
  page.setDefaultTimeout(60000)
  page.on('pageerror', e => errors.push(e.message))
  const button = name => page.getByRole('button', { name, exact: true })
  await page.getByPlaceholder('主密码', { exact: true }).fill('QA-Native-Desktop-Password')
  await button('解锁').click()
  await button('编辑资料').click()
  assert.equal(await page.getByPlaceholder('真实姓名', { exact: true }).inputValue(), 'QA三端重连')
  await button('取消').click()
  await button('设置').first().click(); await button('关于').click()
  await page.getByText(`Personal Hub v${expectedVersion}`, { exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.evaluate(() => { location.hash = '#/docs' })
  await page.getByRole('heading', { name: '个人资料库', exact: true }).waitFor()
  const names = await page.locator('article p[title]').allTextContents()
  assert.equal(names.length, 8)
  await captureNativeDownload(page)
  const bytes = Buffer.alloc(10 * 1024 * 1024)
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
  const hash = createHash('sha256').update(bytes).digest('hex')
  for (const name of names) {
    await page.evaluate(() => { window.qaDownloaded = undefined })
    await page.locator('article').filter({ has: page.getByText(name, { exact: true }) }).getByRole('button', { name: '下载', exact: true }).click()
    await page.waitForFunction(() => Boolean(window.qaDownloaded))
    assert.deepEqual(await page.evaluate(() => window.qaDownloaded), { bytes: bytes.length, hash })
  }
  assert.deepEqual(errors, [])
  const report = resolve('.visual-qa', `windows-upgrade-${expectedVersion}.json`)
  writeFileSync(report, JSON.stringify({ passed: true, executable, profile, expectedVersion, files: names.length, errors }, null, 2))
  console.log(`PASS: 安装程序 v${expectedVersion} 保留密码、资料及 8 个附件；${report}`)
} finally {
  await browser?.close()
  if (processHandle.exitCode === null) {
    const exited = new Promise(resolve => processHandle.once('exit', resolve))
    processHandle.kill(); await exited
  }
}
