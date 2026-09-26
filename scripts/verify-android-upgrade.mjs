import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
import { captureNativeDownload } from './capture-native-download.mjs'

const require = createRequire(import.meta.url)
const { _android } = require(process.env.PHUB_PLAYWRIGHT_MODULE ?? 'playwright')
const device = (await _android.devices({ omitDriverInstall: true })).find(d => d.serial() === process.env.PHUB_ANDROID_SERIAL)
if (!device) throw new Error('需要连接指定 QA 手机')
const dir = resolve('.visual-qa', `android-upgrade-${Date.now()}`)
mkdirSync(dir, { recursive: true })
const errors = []
try {
  await device.shell('am force-stop com.zdb.personalhub.debug')
  await device.shell('am start -n com.zdb.personalhub.debug/com.zdb.personalhub.MainActivity')
  const page = await (await device.webView({ pkg: 'com.zdb.personalhub.debug' })).page()
  page.setDefaultTimeout(60000)
  page.on('pageerror', e => errors.push(e.message))
  await page.getByPlaceholder('主密码', { exact: true }).fill('QA-Device-B-Password')
  await page.getByRole('button', { name: '解锁', exact: true }).click()
  await page.getByRole('button', { name: '编辑资料', exact: true }).click()
  assert.equal(await page.getByPlaceholder('真实姓名', { exact: true }).inputValue(), 'QA三端重连')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: /^(打开设置|设置)$/ }).first().click()
  await page.getByRole('button', { name: '关于', exact: true }).click()
  await page.getByText('Personal Hub v1.1.0', { exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.evaluate(() => { location.hash = '#/docs' })
  await page.getByRole('heading', { name: '个人资料库', exact: true }).waitFor()
  const names = await page.locator('article p[title]').allTextContents()
  assert.equal(names.length, 8)
  await captureNativeDownload(page)
  const bytes = Buffer.alloc(10 * 1024 * 1024)
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
  const hash = createHash('sha256').update(bytes).digest('hex')
  for (const name of names) {
    await page.evaluate(() => { window.qaDownloaded = undefined })
    await page.locator('article').filter({ has: page.getByText(name, { exact: true }) }).getByRole('button', { name: '下载', exact: true }).click()
    await page.waitForFunction(() => Boolean(window.qaDownloaded))
    assert.deepEqual(await page.evaluate(() => window.qaDownloaded), { bytes: bytes.length, hash })
  }
  assert.deepEqual(errors, [])
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ passed: true, version: '1.1.0-debug', files: names.length, errors }, null, 2))
  console.log(`PASS: 覆盖更新后密码、资料、8 个附件保留且 SHA-256 一致；${dir}`)
} finally {
  await device.shell('am force-stop com.zdb.personalhub.debug').catch(() => {})
  await device.close()
}
