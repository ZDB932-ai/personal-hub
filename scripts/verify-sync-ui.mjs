import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
import { createSyncServer } from '../server/sync-server.ts'

const require = createRequire(import.meta.url)
const { chromium, _android } = require(process.env.PHUB_PLAYWRIGHT_MODULE ?? 'playwright')
const androidSerial = process.env.PHUB_ANDROID_SERIAL
const adbPath = resolve('.android-sdk/platform-tools/adb.exe')
const adb = (...args) => execFileSync(adbPath, ['-s', androidSerial, ...args], { encoding: 'utf8' })
const preview = process.env.PHUB_VERIFY_URL ?? 'http://127.0.0.1:4183'
const dir = resolve('.visual-qa', `sync-${Date.now()}`)
mkdirSync(dir, { recursive: true })
const token = randomBytes(32).toString('base64url')
const passwordA = 'QA-Device-A-Password', passwordB = 'QA-Device-B-Password'
const results = []
const errors = []
let service, port = 0, stopped = true
async function startServer() {
  service = createSyncServer(join(dir, 'sync.sqlite'), { origins: [new URL(preview).origin, 'http://localhost', 'https://localhost'] })
  service.provision('qa', token)
  await new Promise(resolve => service.server.listen(port, '127.0.0.1', resolve))
  port = service.server.address().port; stopped = false
}
async function stopServer() {
  if (stopped) return
  await new Promise(resolve => service.server.close(resolve)); service.close(); stopped = true
}
const pass = text => { results.push(text); console.log(`PASS: ${text}`) }
async function capture(page, name) {
  if (androidSerial && page === mobilePage) return
  await page.screenshot({ path: join(dir, name) })
}
const button = (page, name) => page.getByRole('button', { name, exact: true })
async function settings(page, tab = '同步') {
  const mobile = button(page, '打开设置')
  if (await mobile.isVisible()) await mobile.click()
  else await button(page, '设置').first().click()
  await button(page, tab).click()
}
async function connect(page) {
  await page.getByLabel('逐条同步服务地址', { exact: true }).fill(`http://127.0.0.1:${port}`)
  await page.getByPlaceholder('同步服务访问令牌', { exact: true }).fill(token)
  await button(page, '连接并同步记录').click()
  await page.getByText(`已连接：http://127.0.0.1:${port}`, { exact: true }).waitFor()
}
async function sync(page) { await button(page, '立即同步记录').click(); await button(page, '立即同步记录').waitFor({ state: 'visible' }) }
async function edit(page, name, online = true) {
  await page.keyboard.press('Escape')
  await button(page, '编辑资料').click()
  await page.getByPlaceholder('真实姓名', { exact: true }).fill(name)
  const uploaded = online ? page.waitForResponse(response => response.url().endsWith('/v1/push') && response.status() === 200) : undefined
  await button(page, '保存').click()
  await settings(page)
  if (uploaded) await uploaded
}
async function checkName(page, name) {
  await page.keyboard.press('Escape')
  await button(page, '编辑资料').click()
  assert.equal(await page.getByPlaceholder('真实姓名', { exact: true }).inputValue(), name)
  await button(page, '取消').click()
  await settings(page)
}
async function idle(page) { await page.getByText('已准备 0 条记录，其中删除记录 0 条。', { exact: true }).waitFor() }

let browser, device, mobilePage
try {
  await startServer()
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const ca = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
  let cb, b
  const a = await ca.newPage()
  if (androidSerial) {
    device = (await _android.devices({ omitDriverInstall: true })).find(d => d.serial() === androidSerial)
    if (!device) throw new Error('指定安卓设备不可用')
    adb('reverse', `tcp:${port}`, `tcp:${port}`)
    adb('shell', 'am', 'start', '-n', 'com.zdb.personalhub.debug/com.zdb.personalhub.MainActivity')
    b = await (await device.webView({ pkg: 'com.zdb.personalhub.debug' })).page()
    mobilePage = b
    cb = b.context()
  } else {
    cb = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    b = await cb.newPage()
  }
  for (const page of [a, b]) { page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept()); page.setDefaultTimeout(30000) }
  await a.goto(preview, { waitUntil: 'domcontentloaded' })
  await a.getByPlaceholder('创建主密码', { exact: true }).fill(passwordA)
  await a.getByPlaceholder('再次输入主密码', { exact: true }).fill(passwordA)
  await button(a, '创建并进入').click()
  await settings(a, '安全')
  await a.getByPlaceholder('验证本机主密码', { exact: true }).fill(passwordA)
  await button(a, '升级并启用').click()
  await button(a, '生成设备加入文件').waitFor()
  await a.getByPlaceholder('验证本机主密码', { exact: true }).fill(passwordA)
  const downloadEvent = a.waitForEvent('download')
  await button(a, '生成设备加入文件').click()
  const file = join(dir, 'device.phub-device')
  await (await downloadEvent).saveAs(file)
  const codeElement = a.locator('code').filter({ hasText: /^[a-f0-9]{32}$/ })
  await codeElement.waitFor()
  const code = await codeElement.innerText()
  if (!androidSerial) await b.goto(preview, { waitUntil: 'domcontentloaded' })
  await b.getByText('加入已有保险库', { exact: true }).click()
  await b.locator('input[type=file]').setInputFiles({ name: 'device.phub-device', mimeType: 'application/json', buffer: readFileSync(file) })
  await b.getByPlaceholder('32 位转移码', { exact: true }).fill(code)
  await b.getByPlaceholder('本机新主密码（至少 8 位）', { exact: true }).fill(passwordB)
  await b.getByPlaceholder('确认本机新主密码', { exact: true }).fill(passwordB)
  await button(b, '加入并设置本机密码').click()
  await b.getByPlaceholder('主密码', { exact: true }).fill(passwordB)
  await button(b, '解锁').click()
  await settings(b)
  await button(a, '同步').click()
  await connect(a); await connect(b); await idle(a); await idle(b)
  pass(androidSerial ? '生产资源：Edge 与 Android 真机 WebView 通过设备文件加入，使用不同主密码连接同一保险库（USB 转发）' : '生产构建：两套独立浏览器存储通过设备文件加入，使用不同主密码连接同一保险库')

  if (!androidSerial) {
    await b.getByLabel('打开时下载，保留已下载文件').check()
    let blobReads = 0
    b.on('request', request => { if (request.url().endsWith('/v1/blobs/get')) blobReads++ })
    const content = Buffer.from('跨设备加密附件验收\n'.repeat(50000))
    await a.keyboard.press('Escape'); await a.locator('a[href="#/docs"]').first().click()
    const uploadedBlob = a.waitForResponse(response => response.url().endsWith('/v1/blobs/put') && response.status() === 200)
    await a.locator('input[type=file]').setInputFiles({ name: 'sync-attachment.txt', mimeType: 'text/plain', buffer: content })
    await uploadedBlob
    await settings(a)
    await a.getByText('已同步（记录与附件）', { exact: true }).waitFor()
    await sync(b)
    await b.getByText('记录已同步，附件按需下载', { exact: true }).waitFor()
    await b.keyboard.press('Escape'); await b.locator('a[href="#/docs"]').first().click()
    await b.getByText('sync-attachment.txt', { exact: true }).waitFor()
    assert.equal(blobReads, 0)
    const downloaded = b.waitForEvent('download')
    await button(b, '下载').click()
    const path = join(dir, 'downloaded.txt'); await (await downloaded).saveAs(path)
    assert.deepEqual(readFileSync(path), content)
    assert.ok(blobReads > 0)
    pass('按需模式不预先下载，点击下载后经真实 HTTP 获取跨分块附件，明文逐字节相同')
    await a.keyboard.press('Escape'); await a.locator('a[href="#/"]').first().click(); await settings(a)
    await b.locator('a[href="#/"]').first().click(); await settings(b)
  }

  await edit(a, 'QA同步到B'); await idle(a)
  await b.waitForResponse(response => response.url().endsWith('/v1/pull') && response.status() === 200, { timeout: 75000 })
  await checkName(b, 'QA同步到B')
  pass('A 自动推送后，前台静置的 B 无手动操作定期拉取并显示一致数据')

  await button(a, '暂停同步').click()
  await a.getByText('同步已暂停', { exact: true }).waitFor()
  await edit(a, 'QA暂停后补传', false)
  await a.getByText('同步已暂停', { exact: true }).waitFor()
  await sync(b); await checkName(b, 'QA同步到B')
  await button(a, '恢复同步').click()
  await a.getByText(`已连接：http://127.0.0.1:${port}`, { exact: true }).waitFor()
  await idle(a); await sync(b); await checkName(b, 'QA暂停后补传')
  pass('暂停期间修改只保留本机，恢复无需重输令牌并补传到另一设备')

  await stopServer()
  await edit(a, 'QA断线后恢复', false)
  await a.getByText(/可重试时间/).waitFor()
  await startServer()
  await idle(a); await sync(b); await checkName(b, 'QA断线后恢复')
  pass('服务停止期间保留本机修改；相同 SQLite 服务重启后自动重试成功')

  await ca.setOffline(true); await cb.setOffline(true)
  await edit(a, 'QA冲突A', false); await edit(b, 'QA冲突B', false)
  await ca.setOffline(false); await sync(a); await idle(a)
  await cb.setOffline(false); await sync(b)
  await b.getByText('需要处理的冲突（1）', { exact: true }).waitFor()
  assert.equal(await b.locator('pre').count(), 0)
  await button(b, '查看两边内容（可能包含密码）').click()
  await b.getByText('本机：QA冲突B', { exact: true }).waitFor()
  await b.getByText('另一设备：QA冲突A', { exact: true }).waitFor()
  await capture(b, 'conflict.png')
  await button(b, '使用另一设备版本').click()
  await idle(b); await checkName(b, 'QA冲突A')
  pass('两台离线修改同一记录产生冲突，默认隐藏敏感内容，选择远端后数据一致')

  await b.reload({ waitUntil: 'domcontentloaded' })
  await b.getByPlaceholder('主密码', { exact: true }).fill(passwordB)
  await button(b, '解锁').click(); await settings(b)
  await b.getByText(`已连接：http://127.0.0.1:${port}`, { exact: true }).waitFor()
  await idle(b); await checkName(b, 'QA冲突A')
  await capture(b, 'connected.png')
  assert.deepEqual(errors, [])
  pass('刷新重新解锁后，数据和游标保留，加密凭据自动恢复连接且没有页面异常')
  if (androidSerial) {
    await device.shell('am force-stop com.zdb.personalhub.debug')
    await device.shell('am start -n com.zdb.personalhub.debug/com.zdb.personalhub.MainActivity')
    b = await (await device.webView({ pkg: 'com.zdb.personalhub.debug' })).page()
    mobilePage = b
    b.on('pageerror', e => errors.push(e.message))
    await b.getByPlaceholder('主密码', { exact: true }).fill(passwordB)
    await button(b, '解锁').click(); await settings(b)
    await b.getByText(`已连接：http://127.0.0.1:${port}`, { exact: true }).waitFor()
    await idle(b); await checkName(b, 'QA冲突A')
    assert.deepEqual(errors, [])
    pass('Android 进程被强制停止后重新启动：独立密码解锁、数据保留，自动恢复同步成功')
  }
  await button(b, '断开并移除配置').click()
  await b.getByPlaceholder('同步服务访问令牌', { exact: true }).waitFor()
  await b.reload({ waitUntil: 'domcontentloaded' })
  await b.getByPlaceholder('主密码', { exact: true }).fill(passwordB)
  await button(b, '解锁').click(); await settings(b)
  await b.getByPlaceholder('同步服务访问令牌', { exact: true }).waitFor()
  assert.equal(await b.getByPlaceholder('同步服务访问令牌', { exact: true }).inputValue(), '')
  pass('显式断开并移除配置后，刷新解锁不会自动恢复连接')
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ passed: true, results, errors }, null, 2))
  console.log(`验证记录：${dir}`)
} catch (error) {
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ passed: false, results, errors, failure: String(error) }, null, 2))
  throw error
} finally {
  await browser?.close()
  await device?.close()
  if (androidSerial && port) adb('reverse', '--remove', `tcp:${port}`)
  await stopServer()
}
