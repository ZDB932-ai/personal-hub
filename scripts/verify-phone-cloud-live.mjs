import { _android, chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const serial = process.env.PHUB_ANDROID_SERIAL
const pkg = 'com.zdb.personalhub.syncqa.debug'
const out = `.visual-qa/phone-cloud-${Date.now()}`
mkdirSync(out, { recursive: true })
const device = (await _android.devices({ omitDriverInstall: true })).find(d => d.serial() === serial)
assert.ok(device, '手机未连接')
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] })
const context = await browser.newContext({ viewport: { width: 1365, height: 1000 } })
const web = await context.newPage()
let phone
const results = [], network = [], errors = []
const name = `phone${Date.now()}`, password = `Phone-Test-${Date.now()}-aA`
const button = (p, label) => p.getByRole('button', { name: label, exact: true })
async function profile(p) {
  await p.evaluate(() => { location.hash = '#/' })
  if (p === phone) {
    await button(p, '打开更多导航').click()
    await button(p, '个人资料').filter({ visible: true }).click()
  } else await button(p, '编辑个人资料').click()
}
async function edit(p, value) {
  await profile(p)
  await p.getByPlaceholder('真实姓名', { exact: true }).fill(value)
  await button(p, '保存').click()
}
async function received(p, value) {
  const started = Date.now()
  while (Date.now() - started < 30000) {
    await profile(p)
    const actual = await p.getByPlaceholder('真实姓名', { exact: true }).inputValue()
    await button(p, '取消').click()
    if (actual === value) return Date.now() - started
    await p.waitForTimeout(400)
  }
  throw new Error('自动同步超时')
}
try {
  await device.shell(`am start -n ${pkg}/com.zdb.personalhub.MainActivity`)
  phone = await (await device.webView({ pkg })).page()
  for (const p of [phone, web]) {
    p.setDefaultTimeout(30000)
    p.on('pageerror', e => errors.push(e.message))
    p.on('response', r => { if (r.url().includes('/v1/')) network.push({ side: p === phone ? 'phone' : 'web', path: new URL(r.url()).pathname, status: r.status() }) })
  }
  await button(phone, '首次使用，创建云账号').click()
  await phone.getByPlaceholder('3–40 位英文、数字或下划线').fill(name)
  await phone.getByPlaceholder('账号密码（至少 8 位）', { exact: true }).fill(password)
  await phone.getByPlaceholder('再次输入账号密码', { exact: true }).fill(password)
  await button(phone, '注册并开始同步').click()
  await button(phone, '打开更多导航').waitFor()
  await web.goto('https://111.91.19.235')
  await web.getByPlaceholder('3–40 位英文、数字或下划线').fill(name)
  await web.getByPlaceholder('账号密码（至少 8 位）', { exact: true }).fill(password)
  await button(web, '登录并同步').click()
  await button(web, '编辑个人资料').waitFor()
  const first = `手机上传-${Date.now()}`
  let started = Date.now()
  await edit(phone, first)
  await received(web, first)
  results.push({ test: '真实安卓应用到公网服务器到网页自动同步，无手动刷新', milliseconds: Date.now() - started })
  const second = `服务器回到手机-${Date.now()}`
  started = Date.now()
  await edit(web, second)
  await received(phone, second)
  results.push({ test: '网页到公网服务器到真实安卓应用自动同步', milliseconds: Date.now() - started })
  const cdp = await phone.context().newCDPSession(phone)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  const third = `手机离线补传-${Date.now()}`
  await edit(phone, third)
  await phone.waitForTimeout(2000)
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await received(web, third)
  await cdp.detach()
  results.push({ test: '真实手机 WebView 断网编辑，恢复网络后自动补传' })
  await device.shell('input keyevent KEYCODE_HOME')
  const fourth = `恢复前台-${Date.now()}`
  await edit(web, fourth)
  await web.waitForTimeout(2000)
  await device.shell(`am start -n ${pkg}/com.zdb.personalhub.MainActivity`)
  await received(phone, fourth)
  results.push({ test: '手机切到后台，再回到应用自动接收服务器变更' })
  await phone.screenshot({ path: `${out}/phone.png` })
  assert.deepEqual(errors, [])
  writeFileSync(`${out}/report.json`, JSON.stringify({ passed: true, serial, package: pkg, results, network, errors }, null, 2))
  console.log(JSON.stringify({ out, results }))
} catch (error) {
  writeFileSync(`${out}/report.json`, JSON.stringify({ passed: false, results, network, errors, failure: String(error) }, null, 2))
  if (phone) console.log((await phone.locator('h1,h2,[role=alert]').allTextContents()).join('\n'))
  throw error
} finally {
  await browser.close()
  await device.close()
}
