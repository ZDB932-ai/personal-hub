import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
const output = '.visual-qa/navigation-history'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.PHUB_BROWSER_CHANNEL ?? 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, permissions: ['notifications'] })
await page.clock.setFixedTime(new Date('2026-09-28T09:00:00'))
page.setDefaultTimeout(12000)
const errors = []
page.on('pageerror', e => errors.push(e.message))
const b = name => page.getByRole('button', { name, exact: true })
const l = name => page.getByRole('link', { name, exact: true })
const go = async path => { await page.evaluate(p => { location.hash = '#' + p }, path); await page.waitForTimeout(350) }
const shot = name => page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' })
const base = resolve('dist')
await page.route('http://127.0.0.1:4200/**', async route => {
  const pathname = decodeURIComponent(new URL(route.request().url()).pathname)
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


  const quick = page.getByRole('form', { name: '快速添加今日任务' })
  for (let i = 1; i <= 28; i++) {
    await quick.getByRole('textbox').fill('历史导航测试任务 ' + i)
    await quick.getByRole('textbox').press('Enter')
    await page.locator('.today-task-row').filter({ hasText: '历史导航测试任务 ' + i }).waitFor()
  }
  const scroll = async y => { await page.evaluate(y => window.scrollTo(0, y), y); await page.waitForFunction(y => Math.abs(window.scrollY - y) < 2, y) }
  const position = async y => page.waitForFunction(y => Math.abs(window.scrollY - y) < 2, y)
  for (const reducedMotion of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion })
    await scroll(900)
    await l('备忘录').filter({ visible: true }).click()
    await page.getByRole('heading', { name: '备忘录', exact: true }).waitFor()
    await position(0)
    await page.goBack()
    await page.locator('.today-task-row').first().waitFor()
    await position(900)
    await page.goForward()
    await page.getByRole('heading', { name: '备忘录', exact: true }).waitFor()
    await position(0)
    await page.goBack()
    await position(900)
    await page.evaluate(() => { location.hash = '#/?navigation=history' })
    await page.waitForURL('**navigation=history')
    await position(900)
    await scroll(600)
    await page.goBack()
    await position(900)
    await page.goForward()
    await position(600)
    await l('日历').filter({ visible: true }).click()
    await position(0)
    await page.goBack()
    await position(600)
    await shot('history-' + reducedMotion)
  }
  await b('锁定').filter({ visible: true }).click()
  await page.getByPlaceholder('主密码', { exact: true }).waitFor()
  await page.goBack()
  await page.getByPlaceholder('主密码', { exact: true }).fill('Redesign-QA-2026')
  await b('登录').click()
  await l('备忘录').filter({ visible: true }).click()
  await page.getByRole('heading', { name: '备忘录', exact: true }).waitFor()
  await position(0)
  assert.deepEqual(errors, [])
  console.log('PASS: back/forward restore, query-only updates preserve scroll, calendar exit, normal/reduced transitions, lock during history navigation')
} finally { await browser.close() }
