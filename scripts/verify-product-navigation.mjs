import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { createReadStream, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { extname, resolve, sep } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(process.env.QA_DIST || 'dist')
const output = resolve(process.env.QA_OUTPUT || '.visual-qa/product-navigation')
const allStyles = ['classic', 'sunrise', 'aurora', 'precision', 'swiss', 'terminal', 'brutalist', 'retro', 'botanical', 'orbital', 'atelier', 'blueprint', 'gallery', 'arcade']
const styles = process.env.QA_STYLE_FILTER?.split(',') || allStyles
const widths = process.env.QA_WIDTHS?.split(',').map(Number) || [1440, 1024, 375]
const routes = [
  { path: '/', label: '今天', ready: '.today-workspace' },
  { path: '/calendar', label: '日历', ready: '.calendar-workspace' },
  { path: '/today', label: '任务与计划', ready: '.planning-workspace' },
  { path: '/collect', label: '收集箱', ready: '.attention-pocket.is-review' },
  { path: '/review', label: '回顾', ready: '.attention-tabs' },
  { path: '/memos', label: '备忘录', ready: '.page-header' },
  { path: '/docs', label: '资料库', ready: '.docs-workspace' },
  { path: '/repos', label: '项目收藏', ready: '.page-header' },
  { path: '/vault', label: '密码库', ready: '.page-header' },
  { path: '/ai', label: 'AI 工作台', ready: '.page-header' },
  { path: '/agent-library', label: 'Agent 资源库', ready: '.page-header' },
]
const password = 'Product-Navigation-Isolated-2026'
const taskName = '核对导航与窗口布局'
const accountName = '导航检查合成账号'
const buildFiles = ['index.html', ...readdirSync(resolve(root, 'assets')).filter(name => /^(App|index)-.*\.(css|js)$/.test(name)).map(name => `assets/${name}`)]
const build = buildFiles.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') }))
const report = { passed: false, scope: 'Production Web build; fresh ephemeral browser context; synthetic local account; all navigation routes; no real user profile or cloud connection', build, styles, widths, routes: [], geometry: [], more: [], lowHeight: [], modals: [], compatibility: [], failures: [], errors: [], externalRequests: [], screenshots: [] }
mkdirSync(output, { recursive: true })
assert.ok(statSync(resolve(root, 'index.html')).isFile(), 'Build dist before running navigation QA')
assert.ok(styles.every(style => allStyles.includes(style)), 'Unknown QA_STYLE_FILTER value')
assert.ok(widths.every(width => Number.isInteger(width) && width >= 320), 'Invalid QA_WIDTHS value')
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' }
const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
    if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw new Error('not found')
    response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream')
    response.setHeader('Cache-Control', 'no-store')
    createReadStream(file).pipe(response)
  } catch { response.writeHead(404); response.end() }
})
await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept) })
const origin = `http://127.0.0.1:${server.address().port}`
let browser
let page
const button = name => page.getByRole('button', { name, exact: true }).filter({ visible: true })
const nav = () => page.locator('.hub-mobile-nav:visible, .desktop-sidebar:visible, .style-desktop-navigation:visible').first()
const check = (passed, message, data) => { if (!passed) report.failures.push({ message, data }); return passed }
async function settled() {
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))))
  await page.waitForFunction(() => !document.querySelector('.modal-enter-active, .modal-leave-active'))
  await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {}))))
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))))
}
async function capture(name) {
  await page.screenshot({ path: resolve(output, `${name}.png`), animations: 'disabled' })
  report.screenshots.push(`${name}.png`)
}
async function closeDialog() {
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await settled()
}
async function openMore() {
  await nav().getByRole('button', { name: '打开更多导航', exact: true }).click()
  await page.getByRole('heading', { name: '更多功能', exact: true }).waitFor()
  await settled()
}
async function inspectMore(label, activeLabel) {
  const dialog = page.getByRole('dialog')
  const labels = await dialog.locator('.mobile-more-link').allTextContents()
  const expected = page.viewportSize().width < 768 ? routes.slice(2).filter(item => item.path !== '/collect') : routes.slice(5)
  check(expected.every(item => labels.some(text => text.trim() === item.label)) && labels.length === expected.length, `${label}: more menu has complete, nonduplicated destinations`, { expected: expected.map(item => item.label), labels })
  if (activeLabel) assert.equal(await dialog.getByRole('link', { name: activeLabel, exact: true }).getAttribute('aria-current'), 'page')
  const controls = []
  for (const link of await dialog.locator('.mobile-more-link').all()) {
    await link.scrollIntoViewIfNeeded()
    controls.push(await link.evaluate(element => {
      const box = element.getBoundingClientRect(), hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return { name: element.textContent.trim(), width: box.width, height: box.height, left: box.left, right: box.right, top: box.top, bottom: box.bottom, reachable: Boolean(hit && element.contains(hit)) }
    }))
  }
  const footer = await dialog.locator('.mobile-more-utilities button').evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect(), hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return { name: element.textContent.trim(), width: box.width, height: box.height, top: box.top, bottom: box.bottom, reachable: Boolean(hit && element.contains(hit)), viewport: innerHeight }
  }))
  const passed = controls.every(item => item.width >= 43 && item.height >= 43 && item.left >= -1 && item.right <= page.viewportSize().width + 1 && item.reachable) && footer.every(item => item.width >= 43 && item.height >= 43 && item.top >= 0 && item.bottom <= item.viewport + 1 && item.reachable)
  check(passed, `${label}: more menu and utilities remain reachable`, { controls, footer })
  report.more.push({ label, passed, controls, footer })
  await closeDialog()
  const focus = await nav().getByRole('button', { name: '打开更多导航', exact: true }).evaluate(element => document.activeElement === element)
  check(focus, `${label}: closing more returns keyboard focus`, { focus })
}
async function goViaNavigation(destination) {
  const navigation = nav()
  let link = navigation.getByRole('link', { name: destination.label, exact: true, includeHidden: true })
  if (await link.count() && !await link.isVisible()) {
    const toggle = navigation.getByRole('button', { name: 'AI 与扩展', exact: true })
    if (await toggle.count() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click()
  }
  if (!await link.isVisible()) {
    await openMore()
    link = page.getByRole('dialog').getByRole('link', { name: destination.label, exact: true })
  }
  await link.click()
  await page.waitForFunction(path => location.hash.slice(1).split('?')[0] === path, destination.path)
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.locator(destination.ready).first().waitFor()
  await settled()
  assert.equal(await page.title(), `${destination.label} · Personal Hub`)
  if (!['/', '/calendar'].includes(destination.path)) await page.locator('#main-content').getByRole('heading', { name: destination.label, exact: true }).first().waitFor()
}
async function inspectCurrent(label, destination) {
  const navigation = nav()
  const direct = navigation.getByRole('link', { name: destination.label, exact: true })
  if (await direct.isVisible()) assert.equal(await direct.getAttribute('aria-current'), 'page')
  else {
    const more = navigation.getByRole('button', { name: '打开更多导航', exact: true })
    assert.match(await more.getAttribute('class') || '', /is-active/)
    await openMore()
    await inspectMore(label, destination.label)
  }
}
async function inspectGeometry(label) {
  const result = await page.evaluate(() => {
    const visible = element => { const box = element.getBoundingClientRect(); return getComputedStyle(element).display !== 'none' && box.width > 0 && box.height > 0 }
    const navigation = [...document.querySelectorAll('.hub-mobile-nav, .desktop-sidebar, .style-desktop-navigation')].find(visible)
    const rect = element => { const box = element.getBoundingClientRect(); return Object.fromEntries(['left', 'right', 'top', 'bottom', 'width', 'height'].map(key => [key, Math.round(box[key] * 10) / 10])) }
    const controls = [...document.querySelectorAll('#main-content .page-header :is(button,a), #main-content .calendar-toolbar button, #main-content .dashboard-hero-actions :is(button,a), #main-content .today-quick-add input')].filter(visible).flatMap(element => {
      const box = element.getBoundingClientRect()
      if (box.top < 0 || box.bottom > innerHeight || box.left < 0 || box.right > innerWidth) return []
      const x = box.left + box.width / 2, y = box.top + box.height / 2
      for (let ancestor = element.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
        const css = getComputedStyle(ancestor), clip = ancestor.getBoundingClientRect()
        if ((css.overflowX !== 'visible' && (x < clip.left || x > clip.right)) || (css.overflowY !== 'visible' && (y < clip.top || y > clip.bottom))) return []
      }
      const hit = document.elementFromPoint(x, y)
      return [{ name: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 50), bounds: rect(element), coveredByNavigation: Boolean(hit && navigation.contains(hit)) }]
    })
    return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, navigation: rect(navigation), controls }
  })
  const bounds = result.navigation
  const passed = result.scrollWidth <= result.width + 1 && bounds.left >= -1 && bounds.right <= result.width + 1 && bounds.top >= -1 && bounds.bottom <= result.height + 1 && !result.controls.some(item => item.coveredByNavigation)
  check(passed, `${label}: no horizontal overflow or navigation obstruction`, result)
  report.geometry.push({ label, passed, ...result })
}
async function inspectModal(label, heading) {
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: heading, exact: true }).waitFor()
  await settled()
  const geometry = await dialog.evaluate(element => {
    const box = element.getBoundingClientRect()
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, scrollWidth: document.documentElement.scrollWidth, width: innerWidth, height: innerHeight, text: element.innerText }
  })
  const passed = geometry.left >= -1 && geometry.right <= geometry.width + 1 && geometry.top >= -1 && geometry.bottom <= geometry.height + 1 && geometry.scrollWidth <= geometry.width + 1 && !geometry.text.includes('新增')
  check(passed, `${label}: ${heading} stays in viewport with product copy`, geometry)
  report.modals.push({ label, heading, passed, ...geometry, text: undefined })
  await closeDialog()
}
async function modalJourney(label) {
  await goViaNavigation(routes[0])
  await button('新建任务').first().click()
  await inspectModal(label, '新建任务')
  await page.locator('.today-task-row').filter({ hasText: taskName }).locator('.today-task-content').click()
  await inspectModal(label, '编辑任务')
  await goViaNavigation(routes[8])
  await button('添加账号').first().click()
  await inspectModal(label, '添加账号')
  const account = page.locator('.vault-entry-item').filter({ hasText: accountName })
  if (await account.isVisible()) await account.click()
  await page.locator('.vault-entry-detail summary[aria-label="更多账号操作"]').click()
  await button('编辑').click()
  await inspectModal(label, '编辑账号')
}
async function chooseStyle(style) {
  await page.setViewportSize({ width: 1440, height: 960 })
  await button('设置').click()
  await page.locator('.settings-panel').waitFor()
  await page.locator('.settings-navigation .settings-nav-item').filter({ has: page.getByText('外观', { exact: true }) }).click()
  await page.locator('.appearance-tabs').getByRole('button', { name: '界面风格', exact: true }).click()
  await page.locator('.interface-style-option').filter({ has: page.locator(`[data-preview="${style}"]`) }).click()
  await page.waitForFunction(value => document.documentElement.dataset.interface === value, style)
  const recommend = button('应用推荐配色')
  if (await recommend.count()) await recommend.click()
  await button('关闭设置').click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await settled()
}
async function lowHeightJourney(style) {
  await page.setViewportSize({ width: 1024, height: 460 })
  await goViaNavigation(routes[10])
  const sidebar = page.locator('.desktop-sidebar:visible')
  const result = await sidebar.locator('.sidebar-nav').evaluate(element => {
    const current = element.querySelector('[aria-current="page"]'), box = element.getBoundingClientRect(), item = current.getBoundingClientRect()
    const hit = document.elementFromPoint(item.left + item.width / 2, item.top + item.height / 2)
    return { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop, top: box.top, bottom: box.bottom, activeTop: item.top, activeBottom: item.bottom, activeReachable: Boolean(hit && current.contains(hit)) }
  })
  const passed = result.clientHeight > 0 && result.activeTop >= result.top - 1 && result.activeBottom <= result.bottom + 1 && result.activeReachable && (result.scrollHeight <= result.clientHeight || result.scrollTop > 0)
  check(passed, `${style}: low-height sidebar scrolls to current route`, result)
  report.lowHeight.push({ style, passed, ...result })
  await sidebar.getByRole('button', { name: '收起主导航', exact: true }).click()
  assert.equal(await sidebar.getByRole('link', { name: 'Agent 资源库', exact: true }).getAttribute('aria-current'), 'page')
  await sidebar.getByRole('button', { name: '展开主导航', exact: true }).click()
  await capture(`${style}-sidebar-low-height`)
}
async function seed() {
  await page.goto(origin)
  await button('仅在本机使用 / 旧版设备加入').click()
  await page.getByPlaceholder('例如：我的工作台').fill('导航隔离验收')
  await page.getByPlaceholder('创建主密码', { exact: true }).fill(password)
  await page.getByPlaceholder('再次输入主密码', { exact: true }).fill(password)
  await button('下一步：保存恢复密钥').click()
  const recovery = await page.locator('textarea[readonly]').inputValue()
  await page.getByLabel('确认密钥最后 8 位').fill(recovery.slice(-8))
  await page.getByRole('checkbox', { name: '我已在应用之外保存完整密钥' }).check()
  await button('确认保存并启用').click()
  await page.locator('.hub-shell').waitFor()
  const quick = page.getByRole('form', { name: '快速添加今日任务' }).getByRole('textbox')
  await quick.fill(taskName)
  await quick.press('Enter')
  await page.locator('.today-task-row').filter({ hasText: taskName }).waitFor()
  await goViaNavigation(routes[8])
  await button('添加账号').first().click()
  await page.getByPlaceholder('如：GitHub', { exact: true }).fill(accountName)
  await page.getByPlaceholder('账号 / 邮箱 / 手机号', { exact: true }).fill('isolated-qa-user')
  await page.getByPlaceholder('输入或生成密码', { exact: true }).fill('Synthetic-Entry-Only-2026')
  await page.getByRole('dialog').getByRole('button', { name: '添加', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
}
try {
  browser = await chromium.launch({ channel: process.env.PHUB_BROWSER_CHANNEL || 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, permissions: ['notifications'] })
  await context.route('**/*', async route => {
    const url = route.request().url()
    if (url.startsWith(origin + '/') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue()
    report.externalRequests.push({ url, method: route.request().method() })
    await route.abort('blockedbyclient')
  })
  page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', error => report.errors.push(error.message))
  await page.clock.setFixedTime(new Date('2026-10-23T09:00:00+08:00'))
  await seed()
  for (const style of styles) {
    await chooseStyle(style)
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 960 })
      for (const destination of routes) {
        const label = `${style}/${width}/${destination.path}`
        await goViaNavigation(destination)
        await inspectCurrent(label, destination)
        await inspectGeometry(label)
        report.routes.push({ label, destination: destination.path, passed: true, title: await page.title() })
      }
      await modalJourney(`${style}/${width}`)
      await goViaNavigation(routes[0])
      await capture(`${style}-${width}`)
    }
    await lowHeightJourney(style)
    console.log(`CHECKED ${style}: ${widths.length} widths, all 11 routes, more menus, task/account forms, short sidebar`)
  }
  for (const [from, to] of [['/focus?tab=pocket', '/collect'], ['/focus?tab=trail', '/review'], ['/focus?tab=story', '/review'], ['/focus?tab=closing', '/review']]) {
    await page.evaluate(path => { location.hash = `#${path}` }, from)
    await page.waitForFunction(path => location.hash.slice(1).split('?')[0] === path, to)
    await settled()
    report.compatibility.push({ from, to, passed: true })
  }
  check(report.routes.length === styles.length * widths.length * routes.length, 'All requested style/viewport/route journeys executed', { executed: report.routes.length, expected: styles.length * widths.length * routes.length })
  check(report.errors.length === 0, 'No uncaught page errors', report.errors)
  report.passed = report.failures.length === 0
} catch (error) {
  report.failures.push({ message: error.message, stack: error.stack })
  if (page) await capture('failure').catch(() => {})
} finally {
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2))
  if (browser) await browser.close()
  await new Promise(done => server.close(done))
}
console.log(JSON.stringify({ passed: report.passed, routes: report.routes.length, more: report.more.length, modals: report.modals.length, lowHeight: report.lowHeight.length, errors: report.errors.length, failures: report.failures, output }, null, 2))
if (!report.passed) process.exitCode = 1
