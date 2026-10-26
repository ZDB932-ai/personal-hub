import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, extname, sep } from 'node:path'
import assert from 'node:assert/strict'
import { createSyncServer } from '../server/sync-server.ts'

const out = resolve('.visual-qa', `settings-branches-${Date.now()}`)
const pauseOnly = process.argv.includes('--pause-only')
mkdirSync(out, { recursive: true })
const root = resolve('.visual-qa/settings-native-bundle')
const report = { passed: false, boundary: 'Current production frontend; isolated browser profiles and local real SQLite cloud server; all remote API requests redirected locally and other external traffic blocked. Android is a simulated bridge UI check, not native-device acceptance.', bundleSha256: createHash('sha256').update(readFileSync(resolve(root, 'index.html'))).digest('hex'), cloudChecks: [], androidSimulation: [], requests: [], blocked: [], errors: [] }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' }
const frontend = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
    if (!path.startsWith(root + sep) || !statSync(path).isFile()) throw new Error('not found')
    response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream')
    response.setHeader('Cache-Control', 'no-store')
    createReadStream(path).pipe(response)
  } catch { response.writeHead(404); response.end() }
})
await new Promise(done => frontend.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${frontend.address().port}`
const api = createSyncServer(resolve(out, 'synthetic-cloud.sqlite'), { origins: [origin], requestBurst: 1000, requestsPerSecond: 200 })
await new Promise(done => api.server.listen(0, '127.0.0.1', done))
const apiOrigin = `http://127.0.0.1:${api.server.address().port}`
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const account = `settings${Date.now()}`, password = 'Settings-Cloud-Isolated-2026', changed = 'Settings-Cloud-Changed-2026'
const button = (page, name) => page.getByRole('button', { name, exact: true }).filter({ visible: true })
const panel = page => page.getByRole('dialog', { name: '设置', exact: true })
let activePage
async function context(android = false) {
  const context = await browser.newContext({ viewport: android ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, locale: 'zh-CN', reducedMotion: 'reduce' })
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === origin || !/^https?:/.test(url.protocol)) return route.continue()
    if (url.origin === 'https://111.91.19.235' && url.pathname.startsWith('/v1/')) {
      const response = await route.fetch({ url: apiOrigin + url.pathname, maxRedirects: 0 })
      report.requests.push({ path: url.pathname, status: response.status(), target: 'isolated-local-server' })
      return route.fulfill({ response })
    }
    report.blocked.push({ origin: url.origin, path: url.pathname })
    return route.abort()
  })
  if (android) await context.addInitScript(() => {
    window.settingsAndroidQA = { failCredentials: true, failStop: false, calls: [] }
    window.CapacitorCustomPlatform = { name: 'android' }
    const methods = { NativeBiometric: ['isAvailable', 'setCredentials', 'deleteCredentials'], BackgroundSync: ['configure', 'stage', 'prepare', 'push', 'pull', 'stop', 'status'], LocalNotifications: ['checkPermissions', 'requestPermissions', 'getPending', 'schedule', 'cancel', 'cancelAll', 'checkExactNotificationSetting', 'removeListener'], App: ['removeListener', 'exitApp', 'minimizeApp'] }
    window.Capacitor = {
      PluginHeaders: Object.entries(methods).map(([name, names]) => ({ name, methods: [...names.map(name => ({ name, rtype: 'promise' })), { name: 'addListener', rtype: 'callback' }] })),
      nativeCallback: () => 'isolated-listener',
      nativePromise: async (plugin, method) => {
        const state = window.settingsAndroidQA
        state.calls.push({ plugin, method })
        if (plugin === 'NativeBiometric') {
          if (method === 'isAvailable') return { isAvailable: true }
          if (method === 'setCredentials' && state.failCredentials) throw new Error('Simulated secure-store failure')
          return {}
        }
        if (plugin === 'BackgroundSync') {
          if (method === 'stop' && state.failStop) throw new Error('模拟系统拒绝停止后台服务')
          if (method === 'status') return { message: '隔离桥接模拟', cachedRecords: 0, pending: 0, lastSuccessAt: 0 }
          return {}
        }
        if (method === 'getPending') return { notifications: [] }
        if (method === 'checkPermissions' || method === 'requestPermissions') return { display: 'granted' }
        if (method === 'checkExactNotificationSetting') return { exact_alarm: 'granted' }
        return {}
      },
    }
  })
  const page = await context.newPage()
  page.setDefaultTimeout(25000)
  page.on('pageerror', error => report.errors.push({ android, message: error.message }))
  activePage = page
  return page
}
async function settings(page, section) {
  if (!await panel(page).isVisible()) {
    if (await button(page, '设置').count()) await button(page, '设置').click()
    else { await button(page, '打开更多导航').click(); await button(page, '设置').click() }
  }
  const nav = panel(page).getByRole('navigation', { name: '设置分类' })
  if (!await nav.isVisible()) await button(page, '返回设置分类').click()
  await nav.getByRole('button').filter({ has: page.getByText(section, { exact: true }) }).click()
  await panel(page).locator('.settings-section-content').filter({ visible: true }).locator('[aria-busy="true"]').waitFor({ state: 'hidden' })
}
async function login(page, secret, register = false) {
  await page.goto(origin)
  if (register) await button(page, '首次使用，创建云账号').click()
  await page.getByPlaceholder('3–40 位英文、数字或下划线').fill(account)
  await page.getByPlaceholder('账号密码（至少 8 位）', { exact: true }).fill(secret)
  if (register) await page.getByPlaceholder('再次输入账号密码', { exact: true }).fill(secret)
  await button(page, register ? '注册并开始同步' : '登录并同步').click()
  await page.locator('.today-workspace').waitFor()
}
try {
  const page = await context()
  await login(page, password, true)
  if (!pauseOnly) {
  await settings(page, '账户与恢复')
  await panel(page).getByRole('region', { name: '云账号与恢复' }).waitFor()
  assert.equal(await panel(page).getByText('本机账户', { exact: true }).count(), 0)
  await button(page, '修改密码').click()
  await page.locator('#settings-cloud-current-password').fill('draft-current-password')
  await page.locator('#settings-cloud-next-password').fill('draft-next-password')
  await settings(page, '同步与离线'); await settings(page, '账户与恢复')
  assert.equal(await page.locator('#settings-cloud-current-password').inputValue(), 'draft-current-password')
  await button(page, '关闭设置').click()
  await panel(page).waitFor({ state: 'hidden' })
  await settings(page, '账户与恢复'); await button(page, '修改密码').click()
  assert.equal(await page.locator('#settings-cloud-current-password').inputValue(), '')
  report.cloudChecks.push('Cloud account branch has distinct purpose; switching sections preserves password draft and closing settings clears it')
  await button(page, '设置恢复密钥').click()
  await page.locator('#settings-cloud-current-password').fill(password)
  await button(page, '生成恢复密钥').click()
  const code = await page.getByRole('textbox', { name: '恢复密钥', exact: true }).inputValue()
  assert.equal(code.replaceAll('-', '').length, 64)
  await page.getByLabel('确认密钥最后 8 位').fill(code.slice(-8))
  await page.getByRole('checkbox', { name: '我已在应用之外保存完整密钥' }).check()
  await button(page, '确认保存并启用').click()
  await page.getByText('云恢复已启用，此密钥可在手机、电脑和网页找回密码。', { exact: true }).waitFor()
  report.cloudChecks.push('Real local cloud server accepts verified recovery-key setup and confirmation without exposing keys in artifacts')
  await button(page, '修改密码').click()
  await page.locator('#settings-cloud-current-password').fill(password)
  await page.locator('#settings-cloud-next-password').fill(changed)
  await page.locator('#settings-cloud-confirm-password').fill(changed)
  await button(page, '保存密码').click()
  await page.getByText('云密码和本机密码已更新，数据已保留。其他设备请使用新密码重新登录。', { exact: true }).waitFor()
  await settings(page, '隐私与锁定')
  assert.equal(await panel(page).getByRole('heading', { name: '本机解锁密码', exact: true }).count(), 0)
  await settings(page, '备份与迁移')
  await panel(page).getByRole('heading', { name: '在其他设备使用', exact: true }).waitFor()
  assert.equal(await panel(page).getByText('迁移到其他设备', { exact: true }).count(), 0)
  report.cloudChecks.push('Password change completes real cryptographic flow; cloud accounts use cloud password management and same-account device guidance instead of local migration')
  await page.screenshot({ path: resolve(out, 'cloud-backup.png') })
  }
  const android = await context(true)
  await login(android, pauseOnly ? password : changed)
  if (!pauseOnly) {
  await settings(android, '隐私与锁定')
  const security = panel(android).locator('#settings-page-security')
  await android.locator('#settings-biometric-password').fill(changed)
  await security.getByRole('button', { name: '开启', exact: true }).click()
  await android.getByRole('alert').filter({ hasText: '无法保存系统解锁凭据' }).waitFor()
  assert.equal(await android.evaluate(() => localStorage.getItem('xk.biometric.v1')), null)
  await android.evaluate(() => { window.settingsAndroidQA.failCredentials = false })
  await security.getByRole('button', { name: '开启', exact: true }).click()
  await security.getByRole('heading', { name: '生物识别解锁 · 已开启', exact: true }).waitFor()
  assert.equal(await android.evaluate(() => localStorage.getItem('xk.biometric.v1')), '1')
  await security.getByRole('button', { name: '关闭', exact: true }).click()
  await android.waitForFunction(() => localStorage.getItem('xk.biometric.v1') === null)
  assert.equal(await android.evaluate(() => localStorage.getItem('xk.biometric.v1')), null)
  report.androidSimulation.push('Android biometric branch reports secure-store failure, does not enable on failure, and persists successful enable/disable with real password verification')
  }
  await settings(android, '同步与离线')
  await button(android, '暂停同步').waitFor()
  await android.evaluate(() => { window.settingsAndroidQA.failStop = true })
  await button(android, '暂停同步').click()
  await panel(android).locator('.settings-status').filter({ hasText: /^暂停未完成$/ }).waitFor()
  await panel(android).getByRole('alert').filter({ hasText: '后台同步未确认停止' }).waitFor()
  await button(android, '关闭设置').click()
  await panel(android).waitFor({ state: 'hidden' })
  await settings(android, '同步与离线')
  await panel(android).locator('.settings-status').filter({ hasText: /^暂停未完成$/ }).waitFor()
  await panel(android).getByRole('alert').filter({ hasText: '后台同步未确认停止' }).waitFor()
  await button(android, '重试暂停').waitFor()
  assert.equal(await button(android, '恢复同步').count(), 0)
  await android.evaluate(() => { window.settingsAndroidQA.failStop = false })
  await button(android, '重试暂停').click()
  await panel(android).locator('.settings-status').filter({ hasText: /^已暂停$/ }).waitFor()
  await button(android, '恢复同步').waitFor()
  assert.equal(await panel(android).getByRole('alert').filter({ hasText: '后台同步未确认停止' }).count(), 0)
  report.androidSimulation.push('Native stop failure is shown as pause incomplete, survives settings close/reopen, and retry confirms stopped without automatically resuming')
  await android.screenshot({ path: resolve(out, 'android-pause-retry.png') })
  if (!pauseOnly) {
  await button(android, '恢复同步').click()
  await settings(android, '同步与离线')
  await panel(android).locator('summary').filter({ hasText: /^连接设置$/ }).click()
  await button(android, '断开并移除连接').click()
  await panel(android).locator('.settings-status').filter({ hasText: /^未连接$/ }).waitFor()
  const background = panel(android).locator('.settings-card').filter({ has: android.getByRole('heading', { name: '锁屏与后台同步', exact: true }) })
  await background.getByRole('button', { name: '开启', exact: true }).click()
  await background.getByRole('button', { name: '关闭', exact: true }).waitFor()
  assert.equal(await android.evaluate(() => localStorage.getItem('xk.android-background')), 'true')
  await android.evaluate(() => { window.settingsAndroidQA.failStop = true })
  await background.getByRole('button', { name: '关闭', exact: true }).click()
  await android.getByRole('alert').filter({ hasText: '模拟系统拒绝停止后台服务' }).waitFor()
  assert.equal(await android.evaluate(() => localStorage.getItem('xk.android-background')), 'true')
  await android.evaluate(() => { window.settingsAndroidQA.failStop = false })
  await background.getByRole('button', { name: '关闭', exact: true }).click()
  await background.getByRole('button', { name: '开启', exact: true }).waitFor()
  report.androidSimulation.push('Android background setting remains enabled when native stop rejects; retry clears it and loading state completes')
  assert.equal(await panel(android).getByRole('navigation', { name: '设置分类' }).getByRole('button').filter({ has: android.getByText('桌面清单', { exact: true }) }).count(), 0)
  await android.screenshot({ path: resolve(out, 'android-simulated-sync.png') })
  }
  report.androidCalls = await android.evaluate(() => window.settingsAndroidQA.calls)
  assert.deepEqual(report.errors, [])
  assert.ok(report.requests.length > 0 && report.requests.every(request => request.target === 'isolated-local-server'))
  report.passed = true
} catch (error) {
  report.failure = String(error)
  await activePage?.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {})
  throw error
} finally {
  await browser.close()
  await new Promise(done => api.server.close(done)); api.close()
  await new Promise(done => frontend.close(done))
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ passed: report.passed, out, cloud: report.cloudChecks.length, androidSimulation: report.androidSimulation.length, failure: report.failure }))
}
