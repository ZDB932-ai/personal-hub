import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const executable = resolve(process.env.PHUB_QA_INSTALLED_EXE ?? 'src-tauri/target/release/personal-hub-desktop.exe')
const version = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version
const dir = resolve('.visual-qa', `windows-preview-${Date.now()}`)
mkdirSync(dir, { recursive: true })
const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const child = spawn(executable, [], { windowsHide: true, stdio: 'ignore', env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: resolve(dir, 'profile'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` } })
let browser
const errors = []
try {
  const endpoint = `http://127.0.0.1:${port}`
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${endpoint}/json/version`)).ok) break } catch {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  browser = await chromium.connectOverCDP(endpoint)
  const context = browser.contexts()[0]
  let page, pet
  for (let i = 0; i < 30; i++) {
    page = context.pages().find(item => !item.url().includes('pet=1') && item.url().includes('tauri'))
    pet = context.pages().find(item => item.url().includes('pet=1'))
    if (page && pet) break
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  assert.ok(page && pet, '主窗口和宠物窗口均须创建')
  for (const target of [page, pet]) { target.on('pageerror', error => errors.push(error.message)); target.setDefaultTimeout(30000) }
  await page.getByPlaceholder('创建主密码', { exact: true }).fill('QA-Preview-Isolated-Password')
  await page.getByPlaceholder('再次输入主密码', { exact: true }).fill('QA-Preview-Isolated-Password')
  await page.getByRole('button', { name: '创建并进入', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).first().click()
  await page.getByRole('button', { name: '关于', exact: true }).click()
  await page.getByText(`Personal Hub v${version}`, { exact: true }).waitFor()
  await page.getByRole('button', { name: '玩偶', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.dragon-render')?.getAttribute('data-ready') === 'true')
  assert.equal(await page.locator('.dragon-fallback').count(), 0)
  await page.screenshot({ path: resolve(dir, 'pet-settings.png') })
  await pet.waitForFunction(() => document.querySelector('.dragon-render')?.getAttribute('data-ready') === 'true')
  assert.equal(await pet.locator('.dragon-fallback').count(), 0)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '锁定', exact: true }).first().click()
  await page.getByPlaceholder('主密码', { exact: true }).fill('QA-Preview-Isolated-Password')
  await page.getByRole('button', { name: '解锁', exact: true }).click()
  await page.getByRole('button', { name: '锁定', exact: true }).first().waitFor()
  assert.deepEqual(errors, [])
  writeFileSync(resolve(dir, 'report.json'), JSON.stringify({ passed: true, executable, checks: ['isolated-vault', 'version', 'native-pet-window-created', 'pet-model-loaded-in-settings-and-pet-window', 'lock-unlock'], errors, boundary: '未改变共享玩偶偏好；未验收悬浮窗拖动、DPI、系统提醒和安装升级' }, null, 2))
  console.log(`PASS: Windows 原生启动、独立保险库、版本与双窗口宠物加载；${dir}`)
} finally {
  await browser?.close()
  if (child.exitCode === null) child.kill()
}
