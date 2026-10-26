import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'

const serial = process.env.PHUB_ANDROID_SERIAL
const exec = promisify(execFile)
const shell = async (...args) => (await exec(resolve('.android-sdk/platform-tools/adb.exe'), ['-s', serial, 'shell', ...args], { timeout: 15000, maxBuffer: 16 * 1024 * 1024, windowsHide: true })).stdout
const adb = async (...args) => (await exec(resolve('.android-sdk/platform-tools/adb.exe'), ['-s', serial, ...args], { timeout: 15000, windowsHide: true })).stdout
const pkg = 'com.zdb.personalhub.syncqa.debug'
const existingAccount = process.env.PHUB_BG_TEST_ACCOUNT
assert.ok(!existingAccount || existingAccount === 'phone1792673993299', '只允许已知的独立合成验收账号')
assert.ok(!existingAccount || process.env.PHUB_BG_TEST_PASSWORD, '复用验收账号时必须提供测试凭据')
const out = `.visual-qa/android-background-${Date.now()}`
mkdirSync(out, { recursive: true })
assert.equal((await adb('get-state')).trim(), 'device')
const pid = (await shell('pidof', pkg)).trim()
assert.match(pid, /^\d+$/)
const uid = (await shell('stat', '-c', '%u', `/proc/${pid}`)).trim()
assert.match(uid, /^\d+$/)
const socket = `webview_devtools_remote_${pid}`
assert.ok((await shell('cat', '/proc/net/unix')).includes(`@${socket}`))
const port = (await adb('forward', 'tcp:0', `localabstract:${socket}`)).trim()
assert.match(port, /^\d+$/)
const phoneBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(async error => {
  await adb('forward', '--remove', `tcp:${port}`).catch(() => {})
  throw error
})
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  ...(process.env.PHUB_TEST_PROXY ? { proxy: { server: process.env.PHUB_TEST_PROXY } } : { args: ['--no-proxy-server'] }) })
const web = await browser.newPage({ viewport: { width: 1365, height: 1000 } })
const phone = phoneBrowser.contexts()[0].pages()[0]
assert.ok(phone)
for (const p of [web, phone]) p.setDefaultTimeout(20000)
const account = existingAccount || `bg${Date.now()}`
const password = process.env.PHUB_BG_TEST_PASSWORD || `Bg-QA-${randomBytes(24).toString('base64url')}`
const results = [], errors = []
for (const p of [web, phone]) p.on('pageerror', e => errors.push(e.message))
const b = (p, name) => p.getByRole('button', { name, exact: true })
const status = () => phone.evaluate(() => window.Capacitor.nativePromise('BackgroundSync', 'status', {}))
async function settings() {
  await b(phone, '打开更多导航').click()
  await b(phone, '设置').filter({ visible: true }).click()
  const navigation = phone.getByRole('navigation', { name: '设置分类' })
  if (await navigation.count()) await navigation.locator('button[aria-controls="settings-page-sync"]').click()
  else await phone.getByRole('group', { name: '设置分区' }).getByRole('button', { name: '同步', exact: true }).click()
}
async function lockPhone() {
  await b(phone, '打开更多导航').click()
  await b(phone, '锁定').click()
  await phone.getByPlaceholder('主密码', { exact: true }).waitFor()
}
async function edit(value) {
  await b(web, '编辑个人资料').click()
  await web.getByPlaceholder('真实姓名', { exact: true }).fill(value)
  const pushed = web.waitForResponse(r => r.url().endsWith('/v1/push') && r.status() === 200)
  await b(web, '保存').click()
  const receipt = await (await pushed).json()
  assert.equal(receipt.status, 'accepted')
  return receipt.operationId
}
const nativeLog = () => adb('logcat', '-d', '--pid', pid, '-s', 'PhubBackgroundLoop:I', '*:S')
async function snapshot(label) {
  writeFileSync(`${out}/${label}-freezer.txt`, await shell('cat', `/sys/fs/cgroup/apps/uid_${uid}/cgroup.freeze`, `/sys/fs/cgroup/apps/uid_${uid}/pid_${pid}/cgroup.events`).catch(() => '冻结状态不可读'))
  writeFileSync(`${out}/${label}-loop.log`, await nativeLog().catch(() => '日志不可读'))
  writeFileSync(`${out}/${label}-service.txt`, await shell('dumpsys', 'activity', 'services', pkg).catch(() => '服务不可读'))
  writeFileSync(`${out}/${label}-idle.txt`, await shell('dumpsys', 'deviceidle').catch(() => '系统状态不可读'))
  writeFileSync(`${out}/${label}-process.txt`, await shell('cat', `/proc/${pid}/status`).catch(() => '进程不可读'))
  const notifications = await shell('dumpsys', 'notification', '--noredact')
  const own = notifications.split(/(?=NotificationRecord\()/).filter(section => section.includes(`pkg=${pkg} `)).map(section => section.split('\n').filter(line => /android.title=|android.text=|android.subText=|android.bigText=|android.chronometer|android.showWhen/.test(line)).join('\n')).join('\n')
  writeFileSync(`${out}/${label}-notification.txt`, own)
}
async function cachedAfter(before, operationId) {
  assert.ok(!before.includes(`cached operation=${operationId}`), '新提交不能已存在于旧日志')
  for (let i = 0; i < 30; i++) {
    const next = await nativeLog()
    const matched = next.split(/\r?\n/).filter(line => line.endsWith(`cached operation=${operationId}`))
    if (matched.length) return matched.join('\n')
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error('后台没有收到新的密文页')
}
try {
  assert.equal((await shell('pm', 'path', pkg)).includes('package:'), true)
  if (await phone.getByPlaceholder('主密码', { exact: true }).count()) {
    assert.ok((await phone.locator('body').innerText()).includes(account), '手机必须处于指定合成验收账号')
  } else {
    assert.ok(await phone.getByPlaceholder('3–40 位英文、数字或下划线').count(), '请先锁定验收应用以核对账号')
  }
  console.log('已确认独立验收应用与合成账号范围')
  await web.goto('https://111.91.19.235', { waitUntil: 'domcontentloaded', timeout: 60000 })
  if (!process.env.PHUB_BG_TEST_ACCOUNT) await b(web, '首次使用，创建云账号').click()
  await web.getByPlaceholder('3–40 位英文、数字或下划线').fill(account)
  await web.getByPlaceholder('账号密码（至少 8 位）', { exact: true }).fill(password)
  if (!process.env.PHUB_BG_TEST_ACCOUNT) await web.getByPlaceholder('再次输入账号密码', { exact: true }).fill(password)
  await b(web, process.env.PHUB_BG_TEST_ACCOUNT ? '登录并同步' : '注册并开始同步').click()
  await b(web, '编辑个人资料').waitFor()
  if (await phone.getByPlaceholder('3–40 位英文、数字或下划线').count()) {
    await phone.getByPlaceholder('3–40 位英文、数字或下划线').fill(account)
    await phone.getByPlaceholder('账号密码（至少 8 位）', { exact: true }).fill(password)
    await b(phone, '登录并同步').click()
  } else if (await phone.getByPlaceholder('主密码', { exact: true }).count()) {
    await phone.getByPlaceholder('主密码', { exact: true }).fill(password)
    await b(phone, '登录').click()
  }
  await settings()
  const startBackground = phone.getByRole('button', { name: /^(开启及时后台同步|开启)$/ })
  if (await startBackground.count()) await startBackground.click()
  await phone.getByRole('button', { name: /^(关闭后台同步|关闭)$/ }).waitFor()
  await phone.getByText('已同步（记录与附件）', { exact: true }).waitFor()
  console.log('前台连接已建立，开始后台密文接收验证')
  const initial = await status()
  assert.match(initial.message, /同步|检查/)
  if (process.env.PHUB_BG_EXPECT_EXEMPT === 'true') {
    assert.equal(initial.batteryExempt, true)
    await b(phone, '设置系统后台运行').waitFor()
    await phone.getByText('已获系统电池优化豁免；仍以实际检查时间判断同步状态。', { exact: true }).waitFor()
  }
  if (await b(phone, '关闭设置').count()) await b(phone, '关闭设置').click()
  else await phone.keyboard.press('Escape')
  await lockPhone()
  await shell('input', 'keyevent', 'KEYCODE_HOME')
  const beforeHome = await nativeLog()
  const first = `后台密文-${Date.now()}`
  const firstOperation = await edit(first)
  const received = await cachedAfter(beforeHome, firstOperation)
  results.push({ test: '应用已锁定且退到后台，原生服务缓存服务器密文', received })
  await shell('am', 'start', '-n', `${pkg}/com.zdb.personalhub.MainActivity`)
  await phone.getByPlaceholder('主密码', { exact: true }).fill(password)
  await b(phone, '登录').click()
  let merged = false
  for (let i = 0; i < 20 && !merged; i++) {
    await b(phone, '打开更多导航').click()
    await b(phone, '个人资料').filter({ visible: true }).click()
    merged = await phone.getByPlaceholder('真实姓名', { exact: true }).inputValue() === first
    await b(phone, '取消').click()
    if (!merged) await new Promise(r => setTimeout(r, 1000))
  }
  assert.ok(merged, '解锁后未合并后台收到的新变更')
  results.push({ test: '解锁后自动校验并合并后台密文，用户数据一致' })
  await lockPhone()
  const beforeSleep = await nativeLog()
  await shell('input', 'keyevent', 'KEYCODE_SLEEP')
  const sleepSeconds = Number(process.env.PHUB_BG_LOCK_SECONDS || 0)
  assert.ok(Number.isInteger(sleepSeconds) && sleepSeconds >= 0 && sleepSeconds <= 300)
  for (let elapsed = 0; elapsed < sleepSeconds; elapsed += 15) {
    await new Promise(r => setTimeout(r, Math.min(15, sleepSeconds - elapsed) * 1000))
    assert.match(await shell('dumpsys', 'power'), /mWakefulness=Asleep|mWakefulness=Dozing/)
    await snapshot(`locked-${elapsed + 15}`)
    console.log(`持续锁屏检查：${Math.min(elapsed + 15, sleepSeconds)} / ${sleepSeconds} 秒`)
  }
  const sleepingValue = `屏幕关闭-${Date.now()}`
  const sleepOperation = await edit(sleepingValue)
  const asleep = await cachedAfter(beforeSleep, sleepOperation)
  const power = await shell('dumpsys', 'power')
  assert.match(power, /mWakefulness=Asleep|mWakefulness=Dozing/)
  results.push({ test: '真实屏幕关闭、应用锁定期间收到新的密文', sleepSeconds, sleepOperation, asleep })
  writeFileSync(`${out}/native-loop.log`, await nativeLog())
  const notifications = await shell('dumpsys', 'notification', '--noredact')
  const ownNotifications = notifications.split(/(?=NotificationRecord\()/).filter(section => section.includes(`pkg=${pkg} `)).map(section => section.split('\n').filter(line => /android.title=|android.text=|android.subText=|android.bigText=|android.chronometer|android.showWhen/.test(line)).join('\n')).join('\n')
  writeFileSync(`${out}/notification.txt`, ownNotifications)
  assert.deepEqual(errors, [])
  writeFileSync(`${out}/report.json`, JSON.stringify({ passed: true, results, errors, serial, package: pkg }, null, 2))
  console.log(JSON.stringify({ out, results }))
} catch (error) {
  await snapshot('failure').catch(() => {})
  writeFileSync(`${out}/report.json`, JSON.stringify({ passed: false, results, errors, error: String(error) }, null, 2))
  writeFileSync(`${out}/native-loop.log`, await nativeLog().catch(() => '日志不可读'))
  throw error
} finally {
  if (process.env.PHUB_BG_KEEP_SCENE !== 'true') {
    await shell('am', 'force-stop', pkg).catch(() => {})
    await shell('input', 'keyevent', 'KEYCODE_WAKEUP').catch(() => {})
  }
  await browser.close()
  await phoneBrowser.close()
  await adb('forward', '--remove', `tcp:${port}`).catch(() => {})
}
