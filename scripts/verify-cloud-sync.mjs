import { chromium } from 'playwright'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const base = process.env.PHUB_CLOUD_URL ?? 'https://111.91.19.235'
const { token } = JSON.parse(readFileSync(process.env.PHUB_CLOUD_ACCESS ?? '.sync-data/cloud-111.91.19.235/access.local.json', 'utf8'))
const out = `.visual-qa/cloud-sync-${Date.now()}`
mkdirSync(out, { recursive: true })
const results = [], errors = [], vaults = new Set()
const network = []
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] })
const ca = await browser.newContext({ viewport: { width: 1365, height: 1000 }, acceptDownloads: true })
const cb = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true })
const a = await ca.newPage(), b = await cb.newPage()
const button = (page, name) => page.getByRole('button', { name, exact: true })
const pass = value => { results.push(value); console.log(`PASS: ${value}`) }
const pwdA = 'Cloud-QA-A-2026', pwdB = 'Cloud-QA-B-2026'
for (const p of [a, b]) {
  p.setDefaultTimeout(30000)
  p.on('pageerror', e => errors.push(e.message))
  p.on('dialog', d => d.accept())
  p.on('response', r => { if (r.url().startsWith(`${base}/v1/`)) network.push({ path: new URL(r.url()).pathname, status: r.status() }) })
  p.on('requestfailed', r => { if (r.url().startsWith(base)) network.push({ path: new URL(r.url()).pathname, failure: r.failure()?.errorText }) })
  p.on('request', r => { if (r.url() === `${base}/v1/connect`) { try { vaults.add(r.postDataJSON().space.vaultId) } catch {} } })
}
async function settings(p, tab = '同步') {
  if (p.viewportSize().width < 768) await button(p, '打开更多导航').click()
  await button(p, '设置').filter({ visible: true }).first().click()
  await p.getByRole('group', { name: '设置分区' }).getByRole('button', { name: tab, exact: true }).click()
}
async function idle(p) { await p.getByText('已准备 0 条记录，其中删除记录 0 条。', { exact: true }).waitFor() }
async function sync(p) {
  await button(p, '立即同步记录').click()
  await button(p, '立即同步记录').waitFor()
}
async function connect(p) {
  await p.getByLabel('逐条同步服务地址', { exact: true }).fill(base)
  await p.getByPlaceholder('同步服务访问令牌', { exact: true }).fill(token)
  await button(p, '连接并同步记录').click()
  await p.getByText(`已连接：${base}`, { exact: true }).waitFor()
  await idle(p)
}
async function home(p) {
  await p.keyboard.press('Escape')
  await p.evaluate(() => { location.hash = '#/' })
}
async function profile(p) {
  await home(p)
  if (p.viewportSize().width < 768) {
    await button(p, '打开更多导航').click()
    await button(p, '个人资料').filter({ visible: true }).click()
  } else await button(p, '编辑个人资料').click()
}
async function edit(p, name, online = true) {
  await profile(p)
  await p.getByPlaceholder('真实姓名', { exact: true }).fill(name)
  const sent = online ? p.waitForResponse(r => r.url().endsWith('/v1/push') && r.status() === 200) : undefined
  await button(p, '保存').click()
  await settings(p)
  if (sent) await sent
}
async function check(p, name) {
  await profile(p)
  assert.equal(await p.getByPlaceholder('真实姓名', { exact: true }).inputValue(), name)
  await button(p, '取消').click()
  await settings(p)
}
try {
  assert.equal((await fetch(base)).status, 200)
  assert.equal((await fetch(`${base}/v1/connect`, { method: 'POST' })).status, 401)
  assert.equal((await fetch(`${base}/v1/connect`, { method: 'POST', headers: { Origin: 'https://untrusted.invalid' } })).status, 403)
  pass('公网 HTTPS 信任校验、网页 200、未授权 401、非白名单来源 403')
  await a.goto(base)
  await a.getByPlaceholder('例如：我的工作台').fill('公网同步验收')
  await a.getByPlaceholder('创建主密码', { exact: true }).fill(pwdA)
  await a.getByPlaceholder('再次输入主密码', { exact: true }).fill(pwdA)
  await button(a, '下一步：保存恢复密钥').click()
  const recovery = await a.locator('textarea[readonly]').inputValue()
  await a.getByLabel('确认密钥最后 8 位').fill(recovery.slice(-8))
  await a.getByRole('checkbox', { name: '我已在应用之外保存完整密钥' }).check()
  await button(a, '确认保存并启用').click()
  await settings(a, '安全')
  await a.getByPlaceholder('验证本机主密码', { exact: true }).fill(pwdA)
  const download = a.waitForEvent('download')
  await button(a, '生成设备加入文件').click()
  const file = join(out, 'qa-device.phub-device')
  await (await download).saveAs(file)
  const code = await a.locator('code').filter({ hasText: /^[a-f0-9]{32}$/ }).innerText()
  await b.goto(base)
  await b.getByText('加入已有保险库', { exact: true }).click()
  await b.locator('input[type=file]').setInputFiles(file)
  await b.getByPlaceholder('32 位转移码', { exact: true }).fill(code)
  await b.getByPlaceholder('本机新主密码（至少 8 位）', { exact: true }).fill(pwdB)
  await b.getByPlaceholder('确认本机新主密码', { exact: true }).fill(pwdB)
  await button(b, '加入并设置本机密码').click()
  await b.getByPlaceholder('主密码', { exact: true }).fill(pwdB)
  await button(b, '登录').click()
  await settings(b)
  await a.getByRole('group', { name: '设置分区' }).getByRole('button', { name: '同步', exact: true }).click()
  await connect(a); await connect(b)
  pass('桌面和手机尺寸独立存储，通过设备文件加入同一保险库并使用独立密码')
  await edit(a, '公网A到B'); await idle(a); await sync(b); await check(b, '公网A到B')
  await edit(b, '公网B到A'); await idle(b); await sync(a); await check(a, '公网B到A')
  pass('真实公网双向加密记录同步')
  await b.getByLabel('打开时下载，保留已下载文件').check()
  await a.keyboard.press('Escape')
  await a.evaluate(() => { location.hash = '#/docs' })
  const payload = Buffer.from('公网附件一致性验收\n'.repeat(60000))
  const uploaded = a.waitForResponse(r => r.url().endsWith('/v1/blobs/put') && r.status() === 200, { timeout: 90000 })
  uploaded.catch(() => {})
  await a.locator('input[type=file]').setInputFiles({ name: 'cloud-qa.txt', mimeType: 'text/plain', buffer: payload })
  await a.getByText('cloud-qa.txt', { exact: true }).waitFor()
  await settings(a)
  await sync(a)
  await uploaded
  await a.getByText('已同步（记录与附件）', { exact: true }).waitFor()
  await sync(b)
  await b.keyboard.press('Escape')
  await b.evaluate(() => { location.hash = '#/docs' })
  await b.getByText('cloud-qa.txt', { exact: true }).waitFor()
  const received = b.waitForEvent('download')
  await button(b, '下载').click()
  const receivedPath = join(out, 'downloaded.txt')
  await (await received).saveAs(receivedPath)
  assert.deepEqual(readFileSync(receivedPath), payload)
  pass('跨分块加密附件公网传输，接收后明文逐字节一致')
  await home(a); await settings(a)
  await home(b); await settings(b)
  await ca.setOffline(true); await cb.setOffline(true)
  await edit(a, '公网离线A', false); await edit(b, '公网离线B', false)
  await ca.setOffline(false); await sync(a)
  await cb.setOffline(false); await sync(b)
  await b.getByText('需要处理的冲突（1）', { exact: true }).waitFor()
  await button(b, '使用另一设备版本').click()
  await idle(b); await check(b, '公网离线A')
  pass('双端离线修改产生冲突，选择远端后恢复一致')
  await b.reload()
  await b.getByPlaceholder('主密码', { exact: true }).fill(pwdB)
  await button(b, '登录').click()
  await settings(b)
  await b.getByText(`已连接：${base}`, { exact: true }).waitFor()
  await idle(b); await check(b, '公网离线A')
  pass('刷新后重新登录，已保存的加密连接自动恢复')
  await a.screenshot({ path: join(out, 'desktop.png'), fullPage: true })
  await b.screenshot({ path: join(out, 'mobile.png'), fullPage: true })
  assert.deepEqual(errors, [])
  writeFileSync(join(out, 'report.json'), JSON.stringify({ passed: true, base, results, errors, network, vaults: [...vaults], nativeDevice: false }, null, 2))
} catch (error) {
  console.log('UI diagnostics:', JSON.stringify(await Promise.all([a, b].map(p => p.locator('h1,h2,[role=alert],button').allTextContents()))))
  writeFileSync(join(out, 'report.json'), JSON.stringify({ passed: false, results, errors, network, vaults: [...vaults], failure: String(error) }, null, 2))
  throw error
} finally { await browser.close(); console.log(`Report: ${out}`) }
