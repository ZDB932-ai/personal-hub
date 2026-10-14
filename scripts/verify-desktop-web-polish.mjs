import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
const output = '.visual-qa/desktop-web-polish'
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
const shot = name => page.screenshot({ path: `${output}/${name}.png`, fullPage: true })
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
  for (const title of ['桌面验收甲', '桌面验收乙', '桌面验收丙']) {
    await quick.getByRole('textbox').fill(title)
    await quick.getByRole('textbox').press('Enter')
    await quick.getByText('已添加到今天', { exact: true }).waitFor()
  }
  await b('搜索与收集').filter({ visible: true }).click()
  const search = page.getByRole('textbox', { name: '搜索所有内容' })
  await search.waitFor()
  await page.waitForTimeout(250)
  assert.equal(await search.evaluate(el => el === document.activeElement), true)
  assert.equal(await page.evaluate(() => document.documentElement.style.overflow), 'hidden')
  await search.fill('桌面验收')
  await page.getByRole('status').filter({ hasText: '找到 3 项' }).waitFor()
  const rows = page.locator('#hub-search-results > li')
  const secondTitle = await rows.nth(1).locator('p').first().innerText()
  await search.press('ArrowDown')
  assert.ok((await page.locator('#hub-search-status').innerText()).includes(secondTitle))
  await search.evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })))
  assert.equal(await search.isVisible(), true)
  await shot('keyboard-search-desktop')
  await search.press('Enter')
  await page.getByPlaceholder('要做什么？').waitFor()
  assert.equal(await page.getByPlaceholder('要做什么？').inputValue(), secondTitle)
  assert.equal(await page.evaluate(() => document.documentElement.style.overflow), 'hidden')
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '')
  await b('设置').filter({ visible: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await b('设置').filter({ visible: true }).evaluate(el => el === document.activeElement), true)
  for (const width of [768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 820 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'overflow at ' + width)
    await shot('workspace-' + width)
  }
  await go('/missing-page')
  await page.waitForURL('**/#/')
  await page.getByRole('heading', { name: '今天', exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS: search focus, arrow selection, IME, modal scroll restoration, focus return, desktop widths, unknown route')
} finally {
  await browser.close()
}
