import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const exe = resolve('src-tauri/target/release/personal-hub-desktop.exe')
const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const out = resolve('.visual-qa', `windows-cloud-${Date.now()}`)
mkdirSync(out, { recursive: true })
const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const child = spawn(exe, [], { windowsHide: true, stdio: 'ignore', env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: resolve(out, 'profile'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1 --no-proxy-server` } })
let browser
const errors = [], checks = []
const base = 'https://111.91.19.235'
try {
  const endpoint = `http://127.0.0.1:${port}`
  let ready = false
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${endpoint}/json/version`)).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  assert.ok(ready, 'Native WebView2 debugging endpoint must start')
  browser = await chromium.connectOverCDP(endpoint)
  const context = browser.contexts()[0]
  let page
  for (let i = 0; i < 30; i++) {
    page = context.pages().find(p => p.url().includes('tauri') && !p.url().includes('pet=1'))
    if (page) break
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  assert.ok(page)
  page.setDefaultTimeout(30000)
  page.on('pageerror', e => errors.push(e.message))
  const button = name => page.getByRole('button', { name, exact: true })
  async function settings(tab = '同步') {
    await button('设置').filter({ visible: true }).first().click()
    await page.getByRole('group', { name: '设置分区' }).getByRole('button', { name: tab, exact: true }).click()
  }
  const password = 'Windows-Cloud-QA-2026'
  await page.getByPlaceholder('例如：我的工作台').fill('桌面公网验收')
  await page.getByPlaceholder('创建主密码', { exact: true }).fill(password)
  await page.getByPlaceholder('再次输入主密码', { exact: true }).fill(password)
  await button('下一步：保存恢复密钥').click()
  const recovery = await page.locator('textarea[readonly]').inputValue()
  await page.getByLabel('确认密钥最后 8 位').fill(recovery.slice(-8))
  await page.getByRole('checkbox', { name: '我已在应用之外保存完整密钥' }).check()
  await button('确认保存并启用').click()
  await settings('关于')
  await page.getByText(`Personal Hub v${version}`, { exact: true }).waitFor()
  checks.push('native version and isolated account')
  await page.getByRole('group', { name: '设置分区' }).getByRole('button', { name: '同步', exact: true }).click()
  assert.equal(await page.getByLabel('逐条同步服务地址', { exact: true }).inputValue(), base)
  await page.getByLabel('同步连接文件', { exact: true }).setInputFiles(resolve('.sync-data/cloud-111.91.19.235/Personal-Hub-private-sync.json'))
  await page.getByText(`已连接：${base}`, { exact: true }).waitFor()
  await page.getByText('已准备 0 条记录，其中删除记录 0 条。', { exact: true }).waitFor()
  checks.push('preset URL and private connection file import through native WebView2')
  await page.keyboard.press('Escape')
  const quick = page.getByRole('form', { name: '快速添加今日任务' }).getByRole('textbox')
  const uploaded = page.waitForResponse(r => r.url() === `${base}/v1/push` && r.status() === 200)
  await quick.fill('Windows 原生公网同步验收')
  await quick.press('Enter')
  await uploaded
  checks.push('native task change uploaded over trusted public HTTPS')
  await page.reload()
  await page.getByPlaceholder('主密码', { exact: true }).fill(password)
  await button('登录').click()
  await page.getByText('Windows 原生公网同步验收', { exact: true }).waitFor()
  await settings()
  await page.getByText(`已连接：${base}`, { exact: true }).waitFor()
  await page.getByText('已准备 0 条记录，其中删除记录 0 条。', { exact: true }).waitFor()
  checks.push('reload preserves task and restores encrypted sync credentials')
  assert.deepEqual(errors, [])
  await page.screenshot({ path: resolve(out, 'connected.png') })
  writeFileSync(resolve(out, 'report.json'), JSON.stringify({ passed: true, version, exe, checks, errors, origin: new URL(page.url()).origin, boundary: 'Isolated native runtime; OS file chooser and installer upgrade not exercised' }, null, 2))
  console.log(`PASS: Windows native cloud sync; ${out}`)
} catch (e) {
  writeFileSync(resolve(out, 'report.json'), JSON.stringify({ passed: false, checks, errors, failure: String(e) }, null, 2))
  throw e
} finally {
  await browser?.close()
  if (child.exitCode === null) child.kill()
}
