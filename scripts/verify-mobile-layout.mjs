import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
const output = '.visual-qa/mobile-layout'
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
const shot = name => page.screenshot({ path: `${output}/${name}.png` })
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

  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 740 })
    await go('/')
    await shot(`today-${width}`)
    await b('新建任务').click()
    await page.getByPlaceholder('要做什么？').fill('准备本周的学习计划')
    for (const height of [740, 449]) {
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(250)
      const geometry = await page.locator('.modal-region-footer').evaluate(el => {
        const r = el.getBoundingClientRect()
        return { top: r.top, bottom: r.bottom, height: innerHeight, width: innerWidth, scrollWidth: document.documentElement.scrollWidth }
      })
      assert.ok(geometry.bottom <= height + 1 && geometry.top > 44, JSON.stringify(geometry))
      assert.ok(geometry.scrollWidth <= width + 1)
      for (const button of await page.locator('.modal-region-footer button,.modal-region-header button').all()) {
        const box = await button.boundingBox()
        assert.ok(box.width >= 44 && box.height >= 44)
      }
      await b('添加任务').click()
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      await b('新建任务').click()
      await page.getByPlaceholder('要做什么？').fill('准备本周的学习计划')
    }
    await page.setViewportSize({ width, height: 740 })
    const sub = page.getByPlaceholder('添加子任务，回车确认')
    await sub.fill('先整理课程笔记')
    await b('添加子任务').click()
    await page.getByText('先整理课程笔记', { exact: true }).waitFor()
    await page.locator('.modal-region-body').evaluate(el => { el.scrollTop = 0 })
    await shot(`task-${width}`)
    await b('取消').click()
    await b('打开更多导航').click()
    for (const link of await page.getByRole('navigation', { name: '更多功能' }).getByRole('link').all()) {
      const box = await link.boundingBox()
      assert.ok(box.width >= 44 && box.height >= 44)
    }
    await shot(`more-${width}`)
    await page.getByRole('dialog').getByRole('link', { name: '任务与计划', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await shot(`plan-${width}`)
    await go('/calendar')
    const toolbar = page.locator('.calendar-toolbar')
    const boxes = []
    for (const button of await toolbar.getByRole('button').all()) {
      if (!await button.isVisible()) continue
      const box = await button.boundingBox()
      assert.ok(box.width >= 44 && box.height >= 44, 'Small calendar target: ' + JSON.stringify(box))
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1)
      boxes.push(box)
    }
    for (let i=0; i<boxes.length; i++) for (let j=i+1; j<boxes.length; j++) {
      const a=boxes[i], b=boxes[j]
      assert.ok(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x) <= 1 || Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y) <= 1, 'Calendar buttons overlap')
    }
    await shot(`calendar-${width}`)
    console.log('PASS: mobile sheet, fixed save, subtasks, grouped navigation, calendar targets at ' + width)
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await shot('calendar-dark')
  await go('/')
  await b('新建任务').click()
  await shot('task-dark')
  assert.deepEqual(errors, [])
} finally { await browser.close() }
