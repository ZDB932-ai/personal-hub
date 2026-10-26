import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs'
import { resolve, extname, sep } from 'node:path'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const output = resolve('promo/personal-hub-60s/assets')
mkdirSync(output, { recursive: true })
const url = 'http://127.0.0.1:5199'
const root = resolve('dist')
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2' }
const server = createServer((request, response) => {
  try { const pathname = decodeURIComponent(new URL(request.url, url).pathname); const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`); if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw new Error('not found'); response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream'); response.end(readFileSync(file)) }
  catch { response.writeHead(404); response.end() }
})
await new Promise(resolve => server.listen(5199, '127.0.0.1', resolve))
console.log('Capture static build server ready')
const report = { source: url, build: root, buildIndexSha256: createHash('sha256').update(readFileSync(resolve(root, 'index.html'))).digest('hex'), method: 'isolated headless Edge; real production web UI; synthetic demo content created through UI', syntheticOnly: true, nativeAcceptance: false, syntheticContent: { todayTasks: 6, additionalCalendarTasks: 3, memos: 5, textDocuments: 5, accounts: ['linjian@example.test', 'studio@example.test', 'design@example.test'], passwordsVisible: false, realUserCredentialsUsed: false, recoveryKeySavedToDisk: false }, capturedAt: new Date().toISOString(), navigationReloads: [], pageErrors: [], blockedExternalOrigins: [], screenshots: [] }
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, timezoneId: 'Asia/Shanghai', locale: 'zh-CN', permissions: ['notifications'] })
await context.route('**/*', route => {
  const requested = route.request().url()
  if (/^https?:/.test(requested) && new URL(requested).origin !== url) {
    report.blockedExternalOrigins.push(new URL(requested).origin)
    return route.abort()
  }
  return route.continue()
})
const page = await context.newPage()
page.setDefaultTimeout(30000)
page.on('pageerror', error => report.pageErrors.push(error.message))
page.on('dialog', async dialog => { if (dialog.type() === 'confirm' && dialog.message().startsWith('确定删除「示例')) await dialog.accept(); else await dialog.dismiss() })
const button = name => page.getByRole('button', { name, exact: true })
async function shot(name) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => !document.querySelector('.pointer-events-none.fixed [role="status"], .toast-leave-active'))
  await page.waitForTimeout(500)
  const path = resolve(output, `${name}.png`)
  await page.screenshot({ path, fullPage: false, animations: 'disabled' })
  report.screenshots.push({ name, path, route: await page.evaluate(() => location.hash), viewport: page.viewportSize(), appearance: await page.evaluate(() => ({...document.documentElement.dataset})) })
  writeFileSync(resolve(output, 'capture-report.json'), JSON.stringify(report, null, 2))
  console.log(`Captured ${name}: ${path}`)
}
async function go(path, ready) {
  await page.locator(`a[href="#${path}"]`).first().click()
  try { await page.waitForFunction(path => location.hash === `#${path}`, path, { timeout: 3000 }) }
  catch {
    report.navigationReloads.push(path)
    await page.goto(`${url}/?capture=${Date.now()}#${path}`)
    await page.getByPlaceholder('主密码', { exact: true }).fill('Synthetic-Promo-Only-2026')
    await button('登录').click()
    await page.locator('.hub-shell').waitFor()
  }
  if (ready) await page.locator(ready).first().waitFor()
  await page.waitForTimeout(500)
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  console.log('Demo page loaded')
  await button('仅在本机使用 / 旧版设备加入').click()
  await page.getByPlaceholder('例如：我的工作台').fill('林间工作台')
  const demoPassword = 'Synthetic-Promo-Only-2026'
  await page.getByPlaceholder('创建主密码', { exact: true }).fill(demoPassword)
  await page.getByPlaceholder('再次输入主密码', { exact: true }).fill(demoPassword)
  await button('下一步：保存恢复密钥').click()
  const recovery = await page.locator('textarea[readonly]').inputValue()
  await page.getByLabel('确认密钥最后 8 位').fill(recovery.slice(-8))
  await page.getByRole('checkbox', { name: '我已在应用之外保存完整密钥' }).check()
  await button('确认保存并启用').click()
  await page.locator('.hub-shell').waitFor()
  console.log('Synthetic account ready')
  for (const [title, time, minutes] of [['完善秋日品牌提案', '09:30', 45], ['和设计伙伴碰个头', '11:00', 30], ['整理本周灵感与素材', '14:00', 30], ['阅读《设计中的设计》', '16:00', 25], ['下班后，去河边走走', '18:00', 20], ['写下今天最重要的一件事', '', 10]]) {
    await button('新建任务').click()
    await page.getByPlaceholder('要做什么？').fill(title)
    await page.getByRole('dialog').locator('input[type=number]').fill(String(minutes))
    if (time) await page.getByRole('dialog').locator('input[type=time]').fill(time)
    if (title === '完善秋日品牌提案') for (const task of ['梳理核心信息', '完善视觉方向', '整理提案文档']) { await page.getByPlaceholder('添加子任务，回车确认').fill(task); await page.getByPlaceholder('添加子任务，回车确认').press('Enter') }
    await button('添加任务').click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  }
  await shot('today')
  await page.setViewportSize({ width: 390, height: 844 })
  await shot('mobile')
  await page.setViewportSize({ width: 1440, height: 900 })
  await go('/memos', '.page-header')
  for (const [title, content, color] of [['周五的创作灵感', '把秋天的颜色带进下一次提案。\n\n留白、纸张的肌理，还有光落在桌面上的样子。\n\n#灵感 #设计', '翠绿'], ['与设计伙伴的讨论', '让信息更清晰，让阅读更轻松。\n\n[ ] 补充用户旅程\n[x] 确定核心场景\n[ ] 试试更简洁的首页\n\n#工作 #提案', '天蓝'], ['这一周，值得记下', '完成了一份喜欢的提案。\n学会给每件事留出缓冲。\n也记得，在忙碌里好好吃饭。\n\n#生活 #回顾', '琥珀'], ['阅读摘记', '设计的起点，是认真观察日常。\n\n下一次散步，试着不看手机，留意城市里的招牌与窗。\n\n#阅读 #观察', '玫红'], ['周末的小计划', '[ ] 带相机去公园\n[ ] 找一家安静的书店\n[ ] 做一顿新尝试的晚餐\n\n不把日程排满，留一点意外。\n\n#周末', '靛蓝']]) {
    await button('新建便签').first().click()
    await page.getByPlaceholder('一句话主题（选填）').fill(title)
    await page.getByPlaceholder('随手记点什么…').fill(content)
    await button(`选择${color}便签色`).click()
    await button('创建便签').click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  }
  await shot('memos')
  await go('/vault', '.page-header')
  for (const title of ['示例 - GitHub', '示例 - QQ邮箱', '示例 - 微博']) {
    await page.locator('.vault-entry-item').filter({ hasText: title }).click()
    await page.getByLabel('更多账号操作').click()
    await button('删除').click()
  }
  for (const [title, username] of [['GitHub · 创作项目', 'linjian@example.test'], ['工作邮箱', 'studio@example.test'], ['设计资料库', 'design@example.test']]) {
    await button('新增账号').first().click()
    await page.getByPlaceholder('如：GitHub').fill(title)
    await page.getByPlaceholder('账号 / 邮箱 / 手机号').fill(username)
    await page.getByPlaceholder('输入或生成密码').fill('Synthetic-Display-Only-2026!')
    await button('添加').click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  }
  await shot('vault')
  await go('/calendar', '.calendar-workspace')
  for (const [date, time, title] of [['2026-10-20', '10:00', '收集秋日灵感'], ['2026-10-21', '11:00', '绘制第一版草图'], ['2026-10-22', '10:00', '方案讨论与交流']]) {
    await button(`${date} ${time} 新建任务`).click()
    await page.getByPlaceholder('要做什么？').fill(title)
    await page.getByRole('dialog').locator('input[type=number]').fill('60')
    await button('添加任务').click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  }
  await page.locator('.calendar-timeline').evaluate(el => { el.scrollTop = 9 * parseFloat(getComputedStyle(el).getPropertyValue('--hour-height')) })
  await shot('calendar')
  await go('/docs', '.docs-workspace')
  {
    const items = [
      ['秋日品牌提案.md', '# 秋日品牌提案\n\n## 我们想传达的\n温暖、清晰、从容。\n\n## 视觉方向\n自然纸色与温和留白，让内容成为主角。\n\n## 下一步\n整理视觉草图，与伙伴沟通确认。', ['提案', '设计']],
      ['本周阅读笔记.txt', '本周阅读笔记\n\n观察日常中的秩序，收集那些让人感到安静的细节。\n把想法记录下来，再挑选一件开始实践。', ['阅读']],
      ['项目会议纪要.txt', '项目会议纪要\n\n目标：让重要的信息更容易找到。\n进展：已完成方向梳理。\n下一步：完善首版提案与文档。', ['会议', '项目']],
      ['周末旅行清单.txt', '周末旅行清单\n\n相机与充电器\n一本正在读的书\n一双舒适的鞋\n以及一份不用赶路的心情。', ['生活']],
      ['灵感素材索引.md', '# 灵感素材索引\n\n- 纸张与印刷\n- 城市里的色彩\n- 极简版式\n- 秋日散步记录', ['灵感', '素材']],
    ]
    for (const [name, content] of items) { await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(content) }); await button(name).waitFor() }
  }
  await shot('docs')
  await button('秋日品牌提案.md').click()
  await page.getByRole('dialog').waitFor()
  await shot('docs-preview')
  await page.keyboard.press('Escape')
  await go('/', '.today-workspace')
  await button('设置').click(); await button('界面样式').click(); await page.locator('.interface-style-option').filter({ has: page.locator('[data-preview="orbital"]') }).click(); await button('深色').click(); await button('兰紫').click(); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await shot('style-dark')
  await button('设置').click(); await button('界面样式').click(); await page.locator('.interface-style-option').filter({ has: page.locator('[data-preview="swiss"]') }).click(); await button('浅色').click(); await button('珊瑚').click(); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await shot('style-editorial')
  report.completed = true
} catch (error) {
  report.error = String(error)
  await page.screenshot({ path: resolve(output, 'capture-failure.png') })
  throw error
} finally {
  writeFileSync(resolve(output, 'capture-report.json'), JSON.stringify(report, null, 2))
  await browser.close()
  await server.close()
}
