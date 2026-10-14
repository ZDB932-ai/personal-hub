import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
const output = '.visual-qa/settings-performance'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.PHUB_BROWSER_CHANNEL ?? 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, permissions: ['notifications'] })
await page.clock.setFixedTime(new Date('2026-09-28T09:00:00'))
page.setDefaultTimeout(12000)
const requests = []; page.on('request', request => requests.push(request.url()));
let failAbout = true;
const errors = []
page.on('pageerror', e => errors.push(e.message))
const b = name => page.getByRole('button', { name, exact: true })
const l = name => page.getByRole('link', { name, exact: true })
const go = async path => { await page.evaluate(p => { location.hash = '#' + p }, path); await page.waitForTimeout(350) }
const shot = name => page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' })
const base = resolve('dist')
await page.route('http://127.0.0.1:4200/**', async route => {
  const pathname = decodeURIComponent(new URL(route.request().url()).pathname)
  if (pathname.includes('/AboutSection-') && failAbout) { failAbout = false; return route.abort('failed') }
  const path = resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname))
  if (!path.startsWith(base + sep)) return route.abort()
  try {
    const body = await readFile(path)
    const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }[extname(path)] ?? 'application/octet-stream'
    await route.fulfill({ body, contentType })
  } catch { await route.fulfill({ status: 404, body: '' }) }
})
try {
  await page.goto('http://127.0.0.1:4200/', { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('例如：我的工作台').fill('界面验收账户')
  await page.getByPlaceholder('创建主密码', { exact: true }).fill('Redesign-QA-2026')
  await page.getByPlaceholder('再次输入主密码', { exact: true }).fill('Redesign-QA-2026')
  await b('下一步：保存恢复密钥').click()
  const recoveryCode = await page.locator('textarea[readonly]').inputValue()
  await page.getByLabel('确认密钥最后 8 位').fill(recoveryCode.slice(-8))
  await page.getByRole('checkbox', { name: '我已在应用之外保存完整密钥' }).check()
  await b('确认保存并启用').click()
  await page.getByRole('heading', { name: '今天', exact: true }).waitFor()


  const sectionRequested = name => requests.some(url => url.includes('/' + name + '-'))
  for (const name of ['AppearanceSection', 'SecuritySection', 'BackupPanel', 'SyncSection', 'AboutSection', 'PetSection']) assert.equal(sectionRequested(name), false, name + ' loaded too early')
  const skip = page.getByRole('link', { name: '跳到主要内容' })
  await skip.focus()
  assert.ok((await skip.boundingBox()).y >= 0)
  await skip.press('Enter')
  assert.equal(await page.locator('main').evaluate(el => el === document.activeElement), true)
  assert.ok(!page.url().includes('main-content'))
  await b('设置').filter({ visible: true }).click()
  await page.getByText('外观设置', { exact: true }).waitFor()
  assert.equal(sectionRequested('AppearanceSection'), true)
  assert.equal(sectionRequested('SyncSection'), false)
  await b('安全').click()
  const password = page.getByPlaceholder('当前主密码', { exact: true })
  await password.fill('unsaved-draft')
  await b('外观').click()
  await b('安全').click()
  assert.equal(await password.inputValue(), 'unsaved-draft')
  await b('关于').click()
  await page.getByText('关于暂时无法加载', { exact: true }).waitFor()
  await shot('settings-load-error')
  page.once('dialog', dialog => dialog.dismiss())
  await b('重新加载应用').click()
  await page.getByText('关于暂时无法加载', { exact: true }).waitFor()
  await b('安全').click()
  assert.equal(await password.inputValue(), 'unsaved-draft')
  await b('备份').click()
  await page.getByText('回收站与历史版本', { exact: true }).waitFor()
  await b('关闭设置').click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await b('设置').filter({ visible: true }).click()
  await b('安全').click()
  assert.equal(await password.inputValue(), '')
  await b('关闭设置').click()
  await b('查看同步状态').click()
  await page.getByRole('textbox', { name: '逐条同步服务地址' }).waitFor()
  assert.equal(await b('同步').getAttribute('aria-pressed'), 'true')
  await shot('settings-sync-direct')
  await b('关闭设置').click()
  await b('设置').filter({ visible: true }).click()
  await b('关于').click()
  page.once('dialog', dialog => dialog.accept())
  await b('重新加载应用').click()
  await page.getByPlaceholder('主密码', { exact: true }).fill('Redesign-QA-2026')
  await b('登录').click()
  await b('设置').filter({ visible: true }).click()
  await b('关于').click()
  await page.getByText(`Personal Hub v${JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version}`, { exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS: lazy settings requests, skip navigation, draft preservation and cleanup, failed chunk reload confirmation and recovery, sync entry')
} finally { await browser.close() }
