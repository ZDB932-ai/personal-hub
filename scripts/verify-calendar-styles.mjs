import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve, extname, sep } from 'node:path'
import assert from 'node:assert/strict'

const out = resolve(process.env.QA_OUTPUT || '.visual-qa/calendar-styles')
const root = resolve('dist')
const allStyles = ['classic', 'swiss', 'terminal', 'brutalist', 'retro', 'botanical', 'orbital', 'atelier', 'blueprint', 'gallery', 'arcade', 'sunrise', 'aurora', 'precision']
const styles = process.env.QA_STYLE_FILTER?.split(',') || allStyles
const widths = process.env.QA_WIDTHS?.split(',').map(Number) || [1440, 1024, 768, 375, 320, 1920]
const views = [['week', '周'], ['day', '日'], ['month', '月']].filter(([view]) => !process.env.QA_VIEWS || process.env.QA_VIEWS.split(',').includes(view))
const password = 'Calendar-style-isolated-2026'
const report = { passed: false, scope: 'Production Web; isolated synthetic account; no remote requests', layouts: [], interactions: [], appearances: [], contrast: [], failures: [], errors: [], screenshots: [] }
mkdirSync(out, { recursive: true })
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  try {
    const file = resolve(root, `.${new URL(req.url, 'http://localhost').pathname.replace(/^\/$/, '/index.html')}`)
    if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw new Error('not found')
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-store')
    createReadStream(file).pipe(res)
  } catch { res.writeHead(404); res.end() }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, timezoneId: 'Asia/Shanghai', locale: 'zh-CN', reducedMotion: 'reduce', permissions: ['notifications'] })
await context.route('**/*', route => /^https?:/.test(route.request().url()) && new URL(route.request().url()).origin !== origin ? route.abort() : route.continue())
const page = await context.newPage()
page.setDefaultTimeout(20000)
page.on('pageerror', error => report.errors.push(error.message))
const button = name => page.getByRole('button', { name, exact: true }).filter({ visible: true })
const settled = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))))
const check = (value, message, details) => { if (!value) report.failures.push({ message, details }) }
async function capture(name) {
  await page.evaluate(() => { const timeline = document.querySelector('.calendar-timeline'); if (timeline) timeline.scrollTop = 9 * parseFloat(getComputedStyle(timeline).getPropertyValue('--hour-height')) })
  await settled()
  await page.screenshot({ path: resolve(out, `${name}.png`), animations: 'disabled' }); report.screenshots.push(`${name}.png`)
}
async function settings(style, mode) {
  await button('设置').click()
  await button('界面样式').click()
  await page.locator('.interface-style-option').filter({ has: page.locator(`[data-preview="${style}"]`) }).click()
  const recommend = button('应用推荐配色')
  if (await recommend.count()) await recommend.click()
  await button(mode === 'light' ? '浅色' : '深色').click()
  await page.waitForFunction(([style, mode]) => document.documentElement.dataset.interface === style && document.documentElement.dataset.theme === mode, [style, mode])
  await button('关闭设置').click()
  await page.locator('.settings-panel').waitFor({ state: 'hidden' })
  await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))))
  await settled()
}
async function inspect(label) {
  const result = await page.evaluate(() => {
    const box = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right } }
    const controls = [...document.querySelectorAll('.calendar-toolbar button')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0).map(el => {
      const r = box(el), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return { label: el.getAttribute('aria-label') || el.textContent.trim(), ...r, reachable: el === hit || el.contains(hit) }
    })
    const frame = document.querySelector('.calendar-canvas')
    const workspace = document.querySelector('.calendar-workspace')
    const scrolling = document.querySelector('.calendar-timeline, .calendar-month-grid')
    const fingerprint = selectors => selectors.map(selector => {
      const el = document.querySelector(selector)
      if (!el) return null
      const s = getComputedStyle(el)
      return [selector, ...['borderRadius', 'borderTopWidth', 'borderLeftWidth', 'borderTopStyle', 'boxShadow', 'fontFamily', 'fontSize', 'fontWeight', 'flexDirection', 'padding'].map(key => s[key])]
    })
    return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1, frame: box(frame), workspace: box(workspace), scrolling: box(scrolling), controls, fingerprint: fingerprint(['.calendar-toolbar', '.calendar-style-strip', '.calendar-period-title h2', '.calendar-create-compact', '.timeline-day-heading', '.timeline-day-number', '.timeline-event', '.calendar-canvas']) }
  })
  check(!result.overflow, `${label}: document fits width`, result)
  check(result.scrolling.height >= 90 && result.frame.bottom <= result.height + 1, `${label}: usable scrolling calendar`, result)
  check(result.controls.every(c => c.width >= 43 && c.height >= 43 && c.reachable && c.x >= -1 && c.right <= result.width + 1), `${label}: toolbar reachable and touch sized`, result.controls)
  report.layouts.push({ label, ...result })
  return result
}
async function contrast(label) {
  const results = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    function rgba(color) { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].map((v, i) => i === 3 ? v / 255 : v) }
    const over = (fg, bg) => [...fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3])), 1]
    function background(el) { const chain = []; for (let n = el; n; n = n.parentElement) chain.unshift(n); return chain.reduce((bg, n) => over(rgba(getComputedStyle(n).backgroundColor), bg), [255, 255, 255, 1]) }
    const lum = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
    return [...document.querySelectorAll('.calendar-toolbar button, .calendar-style-strip p, .calendar-style-count, .calendar-style-count strong, .calendar-month-date.is-today > span:first-child, .mini-date.is-today')].filter(el => el.getBoundingClientRect().width > 0 && !el.disabled).map(el => {
      const s = getComputedStyle(el), bg = background(el), fg = over(rgba(s.color), bg), a = lum(fg), b = lum(bg), icon = el.tagName === 'BUTTON' && !el.textContent.trim()
      const fontSize = parseFloat(s.fontSize), fontWeight = parseInt(s.fontWeight, 10)
      return { text: el.getAttribute('aria-label') || el.textContent.trim(), ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), fontSize, fontWeight, target: icon || fontSize >= 24 || fontSize >= 18.66 && fontWeight >= 700 ? 3 : 4.5 }
    })
  })
  for (const result of results) check(result.ratio >= result.target - .02, `${label}: text/icon contrast`, result)
  report.contrast.push({ label, results })
}
try {
  await page.goto(origin)
  await button('仅在本机使用 / 旧版设备加入').click()
  await page.getByPlaceholder('例如：我的工作台').fill('日历风格隔离验收')
  await page.getByPlaceholder('创建主密码', { exact: true }).fill(password)
  await page.getByPlaceholder('再次输入主密码', { exact: true }).fill(password)
  await button('下一步：保存恢复密钥').click()
  const recovery = await page.locator('textarea[readonly]').inputValue()
  await page.getByLabel('确认密钥最后 8 位').fill(recovery.slice(-8))
  await page.getByRole('checkbox', { name: '我已在应用之外保存完整密钥' }).check()
  await button('确认保存并启用').click()
  await page.locator('.hub-shell').waitFor()
  const quick = page.getByRole('form', { name: '快速添加今日任务' }).getByRole('textbox')
  for (const title of ['核对日历与桌面清单', '整理桌面端和移动端适配记录']) {
    await quick.fill(title); await quick.press('Enter'); await page.locator('.today-task-row').filter({ hasText: title }).waitFor()
  }
  await page.evaluate(() => { location.hash = '#/calendar' })
  await page.locator('.calendar-workspace').waitFor()
  await button('安排任务').click()
  await page.getByPlaceholder('要做什么？').fill('长标题验收：整理项目里的日历按钮、手机布局以及桌面清单的交互体验')
  await page.getByRole('dialog').locator('input[type=time]').fill('10:30')
  await page.getByRole('dialog').locator('input[type=number]').fill('45')
  await button('添加任务').click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  for (const style of styles) {
    for (const mode of ['light', 'dark']) {
      await page.setViewportSize({ width: 1440, height: 960 })
      await settings(style, mode)
      await contrast(`${style}/${mode}/normal`)
      await button('安排任务').hover()
      await contrast(`${style}/${mode}/hover`)
      await button('安排任务').focus()
      await contrast(`${style}/${mode}/focus`)
      await page.mouse.move(0, 0)
      for (const width of widths) {
        await page.setViewportSize({ width, height: width < 768 ? 812 : 960 })
        for (const [view, name] of views) {
          await page.getByRole('group', { name: '日历视图', exact: true }).getByRole('button', { name, exact: true }).click()
          await page.waitForFunction(view => document.querySelector('.calendar-workspace').dataset.calendarView === view, view)
          await settled()
          const result = await inspect(`${style}/${mode}/${width}/${view}`)
          if (view === 'month') await contrast(`${style}/${mode}/${width}/month`)
          if (width === 1440 && view === views[0][0]) {
            report.appearances.push({ style, mode, fingerprint: result.fingerprint })
            await capture(`${style}-${mode}-desktop`)
          }
          if (width === 375 && view === 'day') await capture(`${style}-${mode}-mobile`)
          if (width === 1440 && view === 'month' && mode === 'light') await capture(`${style}-month`)
        }
      }
      await page.setViewportSize({ width: mode === 'light' ? 1440 : 375, height: 960 })
      await button('日').click()
      await button('搜索日历').click()
      await page.getByRole('searchbox', { name: '搜索日历任务' }).fill('不会存在的验收任务')
      await page.locator('.timeline-event').waitFor({ state: 'hidden' })
      await page.keyboard.press('Escape')
      await page.locator('.calendar-search-bar').waitFor({ state: 'hidden' })
      await button('当日安排').click()
      await page.getByLabel('日期详情', { exact: true }).waitFor()
      await button('关闭侧面板').click()
      await button('安排任务').click()
      const title = `交互回归 ${style} ${mode}`
      await page.getByPlaceholder('要做什么？').fill(title)
      await button('添加任务').click()
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      await page.locator('.timeline-floating-event').filter({ hasText: title }).click()
      await page.getByPlaceholder('要做什么？').fill(`${title} 已编辑`)
      await button('保存修改').click()
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      await page.locator('.timeline-floating-event').filter({ hasText: `${title} 已编辑` }).waitFor()
      report.interactions.push({ style, mode, passed: true, checks: ['switch-three-views', 'search-and-escape', 'inspector-open-close', 'create-and-edit-same-task'] })
    }
    console.log(`calendar styles checked: ${style}`)
  }
  const distinct = new Set(report.appearances.filter(a => a.mode === 'light').map(a => JSON.stringify(a.fingerprint))).size
  check(distinct === styles.length, 'each calendar has a distinct structural appearance', { distinct, styles: styles.length })
  check(report.errors.length === 0, 'no page errors', report.errors)
  report.passed = report.failures.length === 0
  assert.equal(report.passed, true, `${report.failures.length} calendar issues`)
} catch (error) {
  report.failures.push({ message: String(error) })
  await capture('failure').catch(() => {})
  throw error
} finally {
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ passed: report.passed, layouts: report.layouts.length, interactions: report.interactions.length, failures: report.failures.length, out }))
  await browser.close(); await new Promise(done => server.close(done))
}
