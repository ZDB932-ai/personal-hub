import { chromium } from 'playwright'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const base = process.env.PHUB_CLOUD_URL ?? 'http://127.0.0.1:5173'
const api = 'https://111.91.19.235'
const token = ''; const accountName = `qa${Date.now()}`
const out = `.visual-qa/cloud-recovery-${Date.now()}`
mkdirSync(out, { recursive: true })
const results = [], errors = [], vaults = new Set()
const network = []
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] })
const ca = await browser.newContext({ viewport: { width: 1365, height: 1000 }, acceptDownloads: true })
const cb = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true })
const a = await ca.newPage(), b = await cb.newPage()
const button = (page, name) => page.getByRole('button', { name, exact: true })
const pass = value => { results.push(value); console.log(`PASS: ${value}`) }
const pwdA = 'Cloud-QA-A-2026', pwdB = 'Changed-QA-2026', pwdC = 'Recovered-QA-2026'
if (process.env.PHUB_ACCOUNT_API) {
  for (const ctx of [ca, cb]) await ctx.route(`${api}/v1/**`, async route => { const response = await route.fetch({ url: route.request().url().replace(api, process.env.PHUB_ACCOUNT_API) }); await route.fulfill({ response }) })
}
for (const p of [a, b]) {
  p.setDefaultTimeout(30000)
  p.on('pageerror', e => errors.push(e.message))
  p.on('dialog', d => d.accept())
  p.on('response', r => { if (r.url().startsWith(`${api}/v1/`)) network.push({ path: new URL(r.url()).pathname, status: r.status() }) })
  p.on('requestfailed', r => { if (r.url().startsWith(base)) network.push({ path: new URL(r.url()).pathname, failure: r.failure()?.errorText }) })
  p.on('request', r => { if (r.url() === `${api}/v1/connect`) { try { vaults.add(r.postDataJSON().space.vaultId) } catch {} } })
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
  await p.getByText(`已连接：${api}`, { exact: true }).waitFor()
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
async function security(p) { await home(p); await settings(p, '安全') }
async function saveRecovery(p, password) {
  await security(p)
  await button(p, '设置云恢复密钥').click()
  await p.getByPlaceholder('当前云账号密码').fill(password)
  await button(p, '生成云恢复密钥').click()
  const code = await p.locator('textarea[readonly]').inputValue()
  await p.getByLabel('确认密钥最后 8 位').fill(code.slice(-8))
  await p.getByRole('checkbox', { name: '我已在应用之外保存完整密钥' }).check()
  await button(p, '确认保存并启用').click()
  await p.getByText('云恢复已启用，此密钥可在手机、电脑和网页找回密码。', { exact: true }).waitFor()
  return code
}
async function loginExisting(p, password) {
  await p.getByPlaceholder('主密码', { exact: true }).fill(password)
  await button(p, '登录').click()
}
async function recover(p, code, password) {
  await p.getByPlaceholder('输入完整的 8 组云恢复密钥').fill(code)
  await p.getByPlaceholder('新云账号密码（至少 8 位）').fill(password)
  await p.getByPlaceholder('再次输入新云账号密码').fill(password)
  await button(p, '重设密码并登录').click()
}
try {
  await a.goto(base)
  await button(a, '首次使用，创建云账号').click()
  await a.getByPlaceholder('3–40 位英文、数字或下划线').fill(accountName)
  await a.getByPlaceholder('账号密码（至少 8 位）', { exact: true }).fill(pwdA)
  await a.getByPlaceholder('再次输入账号密码', { exact: true }).fill(pwdA)
  await button(a, '注册并开始同步').click()
  await settings(a)
  await a.getByText(`已连接：${api}`, { exact: true }).waitFor()
  await edit(a, '改密前已有资料'); await idle(a)
  const code = await saveRecovery(a, pwdA)
  pass('已登录设备验证密码后设置并确认保存云恢复密钥')
  await b.goto(base)
  await b.getByPlaceholder('3–40 位英文、数字或下划线').fill(accountName)
  await b.getByPlaceholder('账号密码（至少 8 位）', { exact: true }).fill(pwdA)
  await button(b, '登录并同步').click()
  await settings(b); await b.getByText(`已连接：${api}`, { exact: true }).waitFor()
  await cb.setOffline(true)
  await edit(b, '手机离线未上传数据', false)
  await security(a)
  await button(a, '修改云密码').click()
  await a.getByPlaceholder('当前云账号密码').fill(pwdA)
  await a.getByPlaceholder('新云账号密码（至少 8 位）').fill(pwdB)
  await a.getByPlaceholder('再次输入新云账号密码').fill(pwdB)
  await button(a, '确认修改云密码').click()
  await a.getByText('云密码和本机密码已更新，数据已保留。其他设备请使用新密码重新登录。', { exact: true }).waitFor()
  await cb.setOffline(false); await b.reload()
  await loginExisting(b, pwdA)
  await b.getByRole('alert').filter({ hasText: '账号或密码不正确' }).waitFor()
  await loginExisting(b, pwdB)
  await settings(b); await b.getByText(`已连接：${api}`, { exact: true }).waitFor(); await idle(b)
  await check(b, '手机离线未上传数据')
  await home(a); await settings(a); await sync(a); await check(a, '手机离线未上传数据')
  pass('另一端改密后新密码可登录已有设备，旧云密码被拒绝，离线待上传数据保留并同步')
  const cc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  if (process.env.PHUB_ACCOUNT_API) await cc.route(`${api}/v1/**`, async route => { const response = await route.fetch({ url: route.request().url().replace(api, process.env.PHUB_ACCOUNT_API) }); await route.fulfill({ response }) })
  const c = await cc.newPage(); c.setDefaultTimeout(30000)
  await c.goto(base); await button(c, '忘记云账号密码？').click()
  await c.getByPlaceholder('云账号', { exact: true }).fill(accountName)
  await recover(c, '0'.repeat(64), pwdC)
  await c.getByRole('alert').filter({ hasText: '云恢复密钥不正确' }).waitFor()
  await recover(c, code, pwdC)
  await settings(c); await c.getByText(`已连接：${api}`, { exact: true }).waitFor(); await idle(c)
  await check(c, '手机离线未上传数据')
  pass('全新手机尺寸设备通过云恢复密钥重设密码并找回已有数据，错误密钥拒绝')
  await a.reload(); await loginExisting(a, pwdB)
  await a.getByRole('alert').filter({ hasText: '账号或密码不正确' }).waitFor()
  await loginExisting(a, pwdC)
  await settings(a); await a.getByText(`已连接：${api}`, { exact: true }).waitFor(); await check(a, '手机离线未上传数据')
  const rotated = await saveRecovery(c, pwdC)
  await b.reload(); await button(b, '忘记密码？').click()
  await recover(b, code, pwdB)
  await b.getByRole('alert').filter({ hasText: '云恢复密钥不正确' }).waitFor()
  await recover(b, rotated, pwdB)
  await settings(b); await b.getByText(`已连接：${api}`, { exact: true }).waitFor(); await check(b, '手机离线未上传数据')
  pass('恢复密钥轮换使旧密钥失效；已有设备锁屏可直接恢复且保留本机数据')
  await security(b); await b.screenshot({ path: join(out, 'mobile-security.png'), fullPage: true })
  await a.reload(); await loginExisting(a, pwdB); await security(a)
  await a.screenshot({ path: join(out, 'desktop-security.png'), fullPage: true })
  assert.deepEqual(errors, [])
  writeFileSync(join(out, 'report.json'), JSON.stringify({ passed: true, base, results, errors, accountName, network }, null, 2))
} catch(error) {
  console.log('UI diagnostics:', JSON.stringify(await Promise.all([a,b].map(p=>p.locator('h1,h2,[role=alert],button').allTextContents()))))
  writeFileSync(join(out, 'report.json'), JSON.stringify({ passed: false, base, results, errors, failure: String(error), network }, null, 2))
  throw error
} finally { await browser.close(); console.log(`Report: ${out}`) }
