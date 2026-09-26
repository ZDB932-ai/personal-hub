import { createRequire } from 'node:module'
import { spawn, execFileSync } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createServer } from 'node:net'
import assert from 'node:assert/strict'
import { createSyncServer } from '../server/sync-server.ts'
import { captureNativeDownload } from './capture-native-download.mjs'
import { verifyNativeBackup } from './verify-native-backup.mjs'

const require = createRequire(import.meta.url)
const { chromium, _android } = require(process.env.PHUB_PLAYWRIGHT_MODULE ?? 'playwright')
const source = process.env.PHUB_VERIFY_RESUME
const serial = process.env.PHUB_ANDROID_SERIAL
if (!source || !serial) throw new Error('需要 PHUB_VERIFY_RESUME（已有 QA 数据目录）和 PHUB_ANDROID_SERIAL')
const directory = resolve('.visual-qa', `native-${Date.now()}`)
mkdirSync(directory, { recursive: true })
const preview = 'http://127.0.0.1:4183'
const token = randomBytes(32).toString('base64url')
const mobilePassword = 'QA-Device-B-Password', desktopPassword = 'QA-Native-Desktop-Password', webPassword = 'QA-Native-Web-Password'
const adb = (...args) => execFileSync(resolve('.android-sdk/platform-tools/adb.exe'), ['-s', serial, ...args], { encoding: 'utf8' })
const results = [], errors = []
const attachmentNames = { phone: `phone-${Date.now()}.bin`, desktop: `desktop-${Date.now()}.bin` }
const attachmentMiB = Number(process.env.PHUB_QA_ATTACHMENT_MIB ?? 10)
assert.ok([10, 50].includes(attachmentMiB))
const attachmentBytes = Buffer.alloc(attachmentMiB * 1024 * 1024)
for (let i = 0; i < attachmentBytes.length; i++) attachmentBytes[i] = i % 251
const expectedHash = createHash('sha256').update(attachmentBytes).digest('hex')
const pass = text => { results.push(text); console.log(`PASS: ${text}`) }
const button = (page, name) => page.getByRole('button', { name, exact: true })
const idle = page => page.getByText('已准备 0 条记录，其中删除记录 0 条。', { exact: true }).waitFor()
let service, port = 0, closed = true, device, desktopProcess, desktopBrowser, browser
let phone, desktop, web
async function startServer() {
  service = createSyncServer(join(resolve(source), 'sync.sqlite'), { origins: [preview, 'http://localhost', 'https://localhost', 'http://tauri.localhost', 'tauri://localhost'] })
  service.provision('qa', token)
  await new Promise(resolve => service.server.listen(port, '127.0.0.1', resolve))
  port = service.server.address().port; closed = false
}
async function stopServer() { if (!closed) { await new Promise(resolve => service.server.close(resolve)); service.close(); closed = true } }
async function settings(page, tab = '同步') {
  await page.getByRole('button', { name: /^(打开设置|设置)$/ }).first().click()
  await button(page, tab).click()
}
async function connect(page) {
  if (await button(page, '断开并移除配置').isVisible()) await button(page, '断开并移除配置').click()
  await page.getByLabel('逐条同步服务地址', { exact: true }).fill(`http://127.0.0.1:${port}`)
  await page.getByPlaceholder('同步服务访问令牌', { exact: true }).fill(token)
  await button(page, '连接并同步记录').click()
  await page.getByText(`已连接：http://127.0.0.1:${port}`, { exact: true }).waitFor()
}
async function sync(page) { await button(page, '立即同步记录').click(); await button(page, '立即同步记录').waitFor() }
async function edit(page, name, online = true) {
  await page.keyboard.press('Escape'); await button(page, '编辑资料').click()
  await page.getByPlaceholder('真实姓名', { exact: true }).fill(name)
  const upload = online ? page.waitForResponse(r => r.url().endsWith('/v1/push') && r.status() === 200) : undefined
  await button(page, '保存').click(); await settings(page)
  if (upload) await upload
  if (online) await idle(page)
}
async function check(page, name) {
  await page.keyboard.press('Escape'); await button(page, '编辑资料').click()
  assert.equal(await page.getByPlaceholder('真实姓名', { exact: true }).inputValue(), name)
  await button(page, '取消').click(); await settings(page)
}
async function docs(page) {
  await page.keyboard.press('Escape')
  await page.evaluate(() => { location.hash = '#/docs' })
  await page.getByRole('heading', { name: '个人资料库', exact: true }).waitFor()
}
async function home(page) {
  await page.evaluate(() => { location.hash = '#/' })
  await button(page, '编辑资料').waitFor(); await settings(page)
}
async function uploadFile(page, name) {
  await docs(page)
  const sent = page.waitForResponse(r => r.url().endsWith('/v1/blobs/put') && r.status() === 200, { timeout: 180000 })
  if (attachmentMiB === 50) {
    await page.locator('input[type=file]').evaluate((input, name) => {
      const bytes = new Uint8Array(50 * 1024 * 1024)
      for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], name, { type: 'application/octet-stream' }))
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, name)
  } else await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: attachmentBytes })
  await sent
  if (process.env.PHUB_QA_INTERRUPT === '1' && page === phone) {
    await stopServer()
    await settings(page)
    await page.getByText('同步失败', { exact: true }).waitFor({ timeout: 180000 })
    await startServer()
    await button(page, '立即同步记录').click()
    pass('手机附件上传首块后停止真实 HTTP 服务，界面报告失败；恢复原 SQLite 服务后重试')
  } else await settings(page)
  await page.getByText('已同步（记录与附件）', { exact: true }).waitFor({ timeout: 180000 })
  await page.keyboard.press('Escape'); await home(page)
}
async function verifyFile(page, name) {
  await sync(page)
  await page.getByText('已同步（记录与附件）', { exact: true }).waitFor({ timeout: 180000 })
  await docs(page)
  await page.evaluate(() => {
    if (window.qaDownloadInstalled) return
    window.qaDownloadInstalled = true
    const blobs = new Map()
    const createObjectURL = URL.createObjectURL.bind(URL)
    const revokeObjectURL = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = function (blob) {
      const url = createObjectURL(blob)
      blobs.set(url, blob)
      return url
    }
    URL.revokeObjectURL = function (url) {
      blobs.delete(url)
      return revokeObjectURL(url)
    }
    const original = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && !this.download.endsWith('.phub-device')) {
        const blob = blobs.get(this.href)
        if (!blob) throw new Error('下载未使用可校验的 Blob')
        window.qaDownloaded = blob.arrayBuffer().then(async buffer => ({ bytes: buffer.byteLength, hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), b => b.toString(16).padStart(2, '0')).join('') }))
        return
      }
      return original.call(this)
    }
  })
  await page.evaluate(() => { window.qaDownloaded = undefined })
  const card = page.locator('article').filter({ has: page.getByText(name, { exact: true }) })
  await card.getByRole('button', { name: '下载', exact: true }).click()
  await page.waitForFunction(() => Boolean(window.qaDownloaded))
  const downloaded = await page.evaluate(() => window.qaDownloaded)
  assert.deepEqual(downloaded, { bytes: attachmentBytes.length, hash: expectedHash })
  await home(page)
}
function observe(page) { page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept()) }
async function unlock(page, password) {
  await page.getByPlaceholder('主密码', { exact: true }).waitFor()
  await captureNativeDownload(page)
  await page.getByPlaceholder('主密码', { exact: true }).fill(password)
  await button(page, '解锁').click(); await settings(page)
}
async function joinVault(page, transfer) {
  await page.getByText('加入已有保险库', { exact: true }).waitFor()
  await captureNativeDownload(page)
  await page.getByText('加入已有保险库', { exact: true }).click()
  const transferPath = join(directory, 'qa.phub-device')
  writeFileSync(transferPath, transfer.text)
  if (page === desktop) {
    await page.locator('input[type=file]').waitFor()
    const cdp = await page.context().newCDPSession(page)
    try {
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' })
      await cdp.send('DOM.setFileInputFiles', { nodeId, files: [transferPath] })
    } finally { await cdp.detach() }
  } else await page.locator('input[type=file]').setInputFiles(transferPath)
  await page.getByPlaceholder('32 位转移码', { exact: true }).fill(transfer.code)
  const password = page === desktop ? desktopPassword : webPassword
  await page.getByPlaceholder('本机新主密码（至少 8 位）', { exact: true }).fill(password)
  await page.getByPlaceholder('确认本机新主密码', { exact: true }).fill(password)
  await button(page, '加入并设置本机密码').click()
  await unlock(page, password); await connect(page); await idle(page)
}
let debugPort
async function openDesktop() {
  if (!debugPort) {
    const socket = createServer()
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
    debugPort = socket.address().port; await new Promise(resolve => socket.close(resolve))
  }
  desktopProcess = spawn(resolve('src-tauri/target/release/personal-hub-desktop.exe'), [], {
    windowsHide: true,
    env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: join(directory, 'webview-profile'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort} --remote-debugging-address=127.0.0.1` },
    stdio: 'ignore',
  })
  const endpoint = `http://127.0.0.1:${debugPort}`
  let ready = false
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${endpoint}/json/version`)).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (!ready) throw new Error('Windows WebView2 调试端口未就绪')
  desktopBrowser = await chromium.connectOverCDP(endpoint)
  const context = desktopBrowser.contexts()[0]
  desktop = context.pages()[0] ?? await context.waitForEvent('page')
  await desktop.waitForURL('http://tauri.localhost/**')
  observe(desktop)
  assert.equal(await desktop.evaluate(() => Boolean(window.__TAURI_INTERNALS__)), true)
}
async function stopDesktop() {
  await desktopBrowser?.close(); desktopBrowser = undefined
  if (desktopProcess && desktopProcess.exitCode === null) {
    const exited = new Promise(resolve => desktopProcess.once('exit', resolve))
    desktopProcess.kill(); await exited
  }
}

try {
  await startServer()
  device = (await _android.devices({ omitDriverInstall: true })).find(d => d.serial() === serial)
  if (!device) throw new Error('未找到指定安卓设备')
  adb('reverse', `tcp:${port}`, `tcp:${port}`)
  await device.shell('am force-stop com.zdb.personalhub.debug')
  await device.shell('am start -n com.zdb.personalhub.debug/com.zdb.personalhub.MainActivity')
  phone = await (await device.webView({ pkg: 'com.zdb.personalhub.debug' })).page(); observe(phone)
  await unlock(phone, mobilePassword); await connect(phone)
  if (await phone.getByText('需要处理的冲突（1）', { exact: true }).isVisible()) {
    assert.equal(await phone.locator('pre').count(), 0)
    await button(phone, '查看两边内容（可能包含密码）').click()
    assert.match(await phone.locator('pre').nth(0).innerText(), /QA冲突B/)
    assert.match(await phone.locator('pre').nth(1).innerText(), /QA冲突A/)
    await button(phone, '使用另一设备版本').click(); await idle(phone); await check(phone, 'QA冲突A')
    pass('沿用上轮 Android 测试数据：离线冲突双方保留，选择远端版本成功')
  } else { await idle(phone); pass('沿用已解锁且无待处理冲突的 Android QA 保险库') }

  await phone.getByText('已同步（记录与附件）', { exact: true }).waitFor({ timeout: 180000 })
  await button(phone, '暂停同步').click()
  await phone.getByText('同步已暂停', { exact: true }).waitFor()
  await button(phone, '安全').click()
  await phone.evaluate(() => {
    const original = HTMLAnchorElement.prototype.click
    window.qaTransfer = undefined
    HTMLAnchorElement.prototype.click = function () {
      if (this.download.endsWith('.phub-device')) { window.qaTransfer = fetch(this.href).then(r => r.text()); return }
      return original.call(this)
    }
  })
  await phone.getByPlaceholder('验证本机主密码', { exact: true }).fill(mobilePassword)
  await button(phone, '生成设备加入文件').click()
  const code = phone.locator('code').filter({ hasText: /^[a-f0-9]{32}$/ }); await code.waitFor({ timeout: 180000 })
  const transfer = { text: await phone.evaluate(() => window.qaTransfer), code: await code.innerText() }
  assert.equal(JSON.parse(transfer.text).app, 'personal-hub-device')
  await button(phone, '同步').click()
  await button(phone, '恢复同步').click()
  await phone.getByText(`已连接：http://127.0.0.1:${port}`, { exact: true }).waitFor()
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  web = await context.newPage(); observe(web); await web.goto(preview)
  await openDesktop()
  await joinVault(web, transfer); await joinVault(desktop, transfer)
  pass('Windows 新构建 exe 与 Edge 通过手机生成的加密加入文件进入同一保险库，三端分别使用不同主密码')

  const phoneStart = Date.now()
  await uploadFile(phone, attachmentNames.phone)
  await verifyFile(desktop, attachmentNames.phone); await verifyFile(web, attachmentNames.phone)
  pass(`Android 上传 ${attachmentMiB} MiB 新附件，Windows/Web 下载解密后大小及 SHA-256 一致；全流程 ${Math.round((Date.now() - phoneStart) / 1000)} 秒`)
  const desktopStart = Date.now()
  await uploadFile(desktop, attachmentNames.desktop)
  await verifyFile(phone, attachmentNames.desktop); await verifyFile(web, attachmentNames.desktop)
  pass(`Windows 上传 ${attachmentMiB} MiB 新附件，Android/Web 下载解密后大小及 SHA-256 一致；全流程 ${Math.round((Date.now() - desktopStart) / 1000)} 秒`)

  await edit(phone, 'QA手机发往三端'); await sync(desktop); await sync(web)
  await check(desktop, 'QA手机发往三端'); await check(web, 'QA手机发往三端')
  pass('Android 修改经真实服务传到 Windows 程序与 Web，三端内容一致')
  await edit(desktop, 'QA桌面发往三端'); await sync(phone); await sync(web)
  await check(phone, 'QA桌面发往三端'); await check(web, 'QA桌面发往三端')
  pass('Windows 程序修改传到 Android 和 Web，三端内容一致')
  await stopServer(); await edit(desktop, 'QA三端重连', false)
  await desktop.getByText(/可重试时间/).waitFor()
  await startServer(); await idle(desktop); await sync(phone); await sync(web)
  await check(phone, 'QA三端重连'); await check(web, 'QA三端重连')
  pass('Windows 离线修改保留，SQLite 服务重启后自动重试，手机与 Web 收到新内容')
  await desktop.screenshot({ path: join(directory, 'windows-connected.png') })
  await stopDesktop(); await openDesktop(); await unlock(desktop, desktopPassword)
  await desktop.getByText(`已连接：http://127.0.0.1:${port}`, { exact: true }).waitFor()
  await idle(desktop); await check(desktop, 'QA三端重连')
  pass('Windows exe 完整重启后仍可解锁并保留数据，加密凭据自动恢复同步')
  await device.shell('am force-stop com.zdb.personalhub.debug')
  await device.shell('am start -n com.zdb.personalhub.debug/com.zdb.personalhub.MainActivity')
  phone = await (await device.webView({ pkg: 'com.zdb.personalhub.debug' })).page(); observe(phone)
  await unlock(phone, mobilePassword)
  await phone.getByText(`已连接：http://127.0.0.1:${port}`, { exact: true }).waitFor()
  await idle(phone); await check(phone, 'QA三端重连')
  pass('Android 进程强制停止后重新启动：独立密码解锁、数据保留，加密凭据自动恢复同步')
  await verifyFile(phone, attachmentNames.desktop); await verifyFile(desktop, attachmentNames.phone)
  pass('Android 与 Windows 进程重启后，附件仍能解密下载且 SHA-256 一致')
  if (attachmentMiB === 10) {
  const phoneDocs = await verifyNativeBackup(phone, mobilePassword, browser, preview, directory, 'android-backup')
  pass(`Android 暂停后导出完整备份，独立 Web 用不同主密码恢复并重启解锁，${phoneDocs} 个附件逐个 SHA-256 一致（原生保存接口截取）`)
  const desktopDocs = await verifyNativeBackup(desktop, desktopPassword, browser, preview, directory, 'windows-backup')
  pass(`Windows 暂停后导出完整备份，独立 Web 用不同主密码恢复并重启解锁，${desktopDocs} 个附件逐个 SHA-256 一致（原生保存接口截取）`)
  }
  if (attachmentMiB === 50) {
    await docs(web)
    const count = await web.locator('article').count()
    const oversized = join(directory, 'over-limit.bin')
    writeFileSync(oversized, Buffer.alloc(50 * 1024 * 1024 + 1))
    await web.locator('input[type=file]').setInputFiles(oversized)
    await web.getByText(/超过 50MB 上限/).waitFor()
    assert.equal(await web.locator('article').count(), count)
    pass('50 MiB 加 1 字节文件被拒绝，资料库未新增记录')
    for (const name of Object.values(attachmentNames)) {
      await web.locator('article').filter({ has: web.getByText(name, { exact: true }) }).getByRole('button', { name: '删除文件', exact: true }).click()
    }
    await settings(web)
    await web.getByText('已同步（记录与附件）', { exact: true }).waitFor({ timeout: 180000 })
    await sync(phone); await sync(desktop)
    for (const page of [phone, desktop]) {
      await docs(page)
      for (const name of Object.values(attachmentNames)) assert.equal(await page.getByText(name, { exact: true }).count(), 0)
    }
    pass('清理本轮两份大文件，删除记录同步到三端；服务端密文块按既定策略保留')
  }
  assert.deepEqual(errors, [])
  writeFileSync(join(directory, 'report.json'), JSON.stringify({ passed: true, source, results, errors }, null, 2))
  console.log(`验证记录：${directory}`)
} catch (error) {
  const alerts = phone ? await phone.getByRole('alert').allTextContents().catch(() => []) : []
  writeFileSync(join(directory, 'report.json'), JSON.stringify({ passed: false, source, results, errors, alerts, failure: String(error) }, null, 2))
  throw error
} finally {
  await stopDesktop(); await browser?.close()
  if (device) await device.shell('am force-stop com.zdb.personalhub.debug').catch(() => {})
  await device?.close()
  if (port) adb('reverse', '--remove', `tcp:${port}`)
  await stopServer()
}
