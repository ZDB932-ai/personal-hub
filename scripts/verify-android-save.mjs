import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { _android } = require(process.env.PHUB_PLAYWRIGHT_MODULE ?? 'playwright')
const serial = process.env.PHUB_ANDROID_SERIAL
if (!serial) throw new Error('需要 PHUB_ANDROID_SERIAL，且手机为已有合成数据的 QA 测试版')
const directory = resolve('.visual-qa', `android-save-${Date.now()}`)
mkdirSync(directory, { recursive: true })
const adb = (...args) => execFileSync(resolve('.android-sdk/platform-tools/adb.exe'), ['-s', serial, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const device = (await _android.devices({ omitDriverInstall: true })).find(d => d.serial() === serial)
if (!device) throw new Error('测试手机未连接')
const results = [], errors = []
const sizeMiB = Number(process.env.PHUB_QA_SAVE_MIB ?? 10)
assert.ok([10, 50].includes(sizeMiB))
const pass = message => { results.push(message); console.log(`PASS: ${message}`) }
const button = (page, name) => page.getByRole('button', { name, exact: true })

try {
  await device.shell('am force-stop com.zdb.personalhub.debug')
  await device.shell('am start -n com.zdb.personalhub.debug/com.zdb.personalhub.MainActivity')
  const page = await (await device.webView({ pkg: 'com.zdb.personalhub.debug' })).page()
  page.setDefaultTimeout(30000)
  page.on('pageerror', error => errors.push(error.message))
  await page.getByPlaceholder('主密码', { exact: true }).fill('QA-Device-B-Password')
  await button(page, '解锁').click()
  await button(page, '打开设置').waitFor()
  await page.evaluate(() => {
    const original = window.Capacitor.nativePromise.bind(window.Capacitor)
    window.qaSaveEvents = []
    window.Capacitor.nativePromise = async (plugin, method, args) => {
      try {
        const result = await original(plugin, method, args)
        if (plugin === 'DocumentSaver') window.qaSaveEvents.push({ method, cancelled: result?.cancelled ?? false })
        return result
      } catch (error) {
        if (plugin === 'DocumentSaver') window.qaSaveEvents.push({ method, error: String(error) })
        throw error
      }
    }
    location.hash = '#/docs'
  })
  await page.getByRole('heading', { name: '个人资料库', exact: true }).waitFor()
  const names = await page.locator('article p[title]').allTextContents()
  const name = process.env.PHUB_QA_SAVE_NAME ?? (sizeMiB === 50 ? `qa-save-50-${Date.now()}.bin` : names.find(name => /^desktop-\d+\.bin$/.test(name)))
  if (!name) throw new Error('未找到此前 10 MiB 合成附件')
  if (sizeMiB === 50 && !names.includes(name)) {
    await page.locator('input[type=file]').evaluate((input, name) => {
      const bytes = new Uint8Array(50 * 1024 * 1024)
      for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], name, { type: 'application/octet-stream' }))
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, name)
    await page.getByText(name, { exact: true }).waitFor({ timeout: 120000 })
  }
  const card = page.locator('article').filter({ has: page.getByText(name, { exact: true }) })
  await card.getByRole('button', { name: '下载', exact: true }).click()
  console.log(`WAIT_SAVE: 请在手机系统保存窗口保存到 Download，文件名 ${name}`)
  await page.waitForFunction(() => window.qaSaveEvents.some(event => event.method === 'finish'), null, { timeout: 600000 })
  const output = join(directory, name)
  adb('pull', `/sdcard/Download/${name}`, output)
  const bytes = readFileSync(output)
  const expected = Buffer.alloc(sizeMiB * 1024 * 1024)
  for (let i = 0; i < expected.length; i++) expected[i] = i % 251
  assert.equal(bytes.length, expected.length)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), createHash('sha256').update(expected).digest('hex'))
  pass(`Android 系统保存窗口实际保存 ${sizeMiB} MiB 附件，ADB 取回文件大小与 SHA-256 一致`)
  writeFileSync(join(directory, 'save-checkpoint.json'), JSON.stringify({ savedFileVerified: true, cancelVerified: false, sizeMiB, output, results, errors }, null, 2))
  await page.evaluate(() => { window.qaSaveEvents = [] })
  await card.getByRole('button', { name: '下载', exact: true }).click()
  console.log('WAIT_CANCEL: 请取消手机系统保存窗口')
  await page.waitForFunction(() => window.qaSaveEvents.some(event => event.method === 'begin' && event.cancelled), null, { timeout: 600000 })
  assert.equal(await page.evaluate(() => window.qaSaveEvents.some(event => event.method === 'append')), false)
  pass('取消系统文件选择不写入内容，应用继续可用')
  if (sizeMiB === 50) {
    page.once('dialog', dialog => dialog.accept())
    await card.getByRole('button', { name: '删除文件', exact: true }).click()
    await page.getByText(name, { exact: true }).waitFor({ state: 'hidden' })
  }
  assert.deepEqual(errors, [])
  writeFileSync(join(directory, 'report.json'), JSON.stringify({ passed: true, results, errors }, null, 2))
  console.log(`验证记录：${directory}`)
} catch (error) {
  writeFileSync(join(directory, 'report.json'), JSON.stringify({ passed: false, results, errors, failure: String(error) }, null, 2))
  throw error
} finally {
  await device.shell('am force-stop com.zdb.personalhub.debug').catch(() => {})
  await device.close()
}
