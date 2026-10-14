import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
const output = '.visual-qa/mobile-content'
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

  const checkWidth = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  const checkTarget = async locator => {
    const rect = await locator.boundingBox()
    assert.ok(rect.width >= 44 && rect.height >= 44, JSON.stringify(rect))
  }
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 740 })
    await go('/collect')
    await page.getByLabel('记下一句话').fill('收集箱布局验收 ' + width)
    await checkTarget(b('放进口袋'))
    await b('放进口袋').click()
    await page.getByRole('status').filter({ hasText: '已收好' }).waitFor()
    assert.equal(await page.getByLabel('记下一句话').inputValue(), '')
    await shot('collect-' + width)
    await checkWidth()
    await b('打开更多导航').click()
    await page.getByRole('dialog').getByRole('button', { name: '设置', exact: true }).click()
    await page.getByText('外观设置', { exact: true }).waitFor()
    await page.waitForFunction(() => {
      const host = document.querySelector('.settings-panel')?.parentElement
      return host && host.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished')
    })
    const tabs = page.getByRole('group', { name: '设置分区', exact: true })
    for (const tab of await tabs.getByRole('button').all()) {
      await checkTarget(tab)
      const rect = await tab.boundingBox()
      assert.ok(rect.x >= 0 && rect.x + rect.width <= width + 1)
    }
    const headerBefore = await tabs.boundingBox()
    await page.locator('.settings-panel .modal-region-body').evaluate(el => { el.scrollTop = el.scrollHeight })
    const headerAfter = await tabs.boundingBox()
    assert.ok(Math.abs(headerBefore.y - headerAfter.y) < 1)
    assert.equal(await page.locator('.settings-panel').evaluate(el => el.scrollTop), 0)
    await b('安全').click()
    await page.getByPlaceholder('当前主密码', { exact: true }).fill('draft-only')
    await b('外观').click()
    await b('安全').click()
    assert.equal(await page.getByPlaceholder('当前主密码', { exact: true }).inputValue(), 'draft-only')
    assert.equal(await page.locator('.settings-panel .modal-region-body').evaluate(el => el.scrollTop), 0)
    await b('外观').click()
    await page.waitForTimeout(300)
    await shot('settings-' + width)
    await b('关闭设置').click()
    await go('/docs')
    const name = '手机资料库布局验收_这是一份较长的学习笔记文件名称_' + width + '.txt'
    await page.getByLabel('上传文件', { exact: true }).setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from('手机资料预览验收内容') })
    const card = page.locator('article').filter({ has: b(name) })
    await card.waitFor()
    await checkWidth()
    for (const button of await card.locator('.docs-file-actions button,.docs-pin').all()) await checkTarget(button)
    await checkTarget(page.getByRole('combobox', { name: '资料排序' }))
    const search = await page.getByRole('textbox', { name: '搜索资料库' }).boundingBox()
    const sort = await page.getByRole('combobox', { name: '资料排序' }).boundingBox()
    assert.ok(search.x + search.width <= sort.x + 1)
    const rail = await page.locator('.docs-toolbar .filter-rail').boundingBox()
    assert.ok(rail.y >= search.y + search.height)
    await page.getByRole('textbox', { name: '搜索资料库' }).fill(String(width))
    assert.equal(await page.locator('article').count(), 1)
    await shot('docs-' + width)
    await card.getByRole('button', { name: '预览', exact: true }).click()
    await page.getByText('手机资料预览验收内容', { exact: false }).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await b('批量管理').click()
    await page.getByRole('checkbox').click()
    await page.getByText('已选', { exact: false }).waitFor()
    await b('退出管理').click()
    console.log('PASS: capture/save, fixed settings navigation, draft retention, documents search/preview/manage, touch targets at ' + width)
  }
  assert.deepEqual(errors, [])
} finally { await browser.close() }
