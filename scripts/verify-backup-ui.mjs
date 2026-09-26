import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PHUB_PLAYWRIGHT_MODULE ?? 'playwright')
const directory = resolve('.visual-qa', `backup-${Date.now()}`)
mkdirSync(directory, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const results = [], errors = []
const button = (page, name) => page.getByRole('button', { name, exact: true })
const pass = message => { results.push(message); console.log(`PASS: ${message}`) }
async function settings(page, tab) {
  const mobile = button(page, '打开设置')
  if (await mobile.isVisible()) await mobile.click()
  else await button(page, '设置').first().click()
  await button(page, tab).click()
}
async function create(password) {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('dialog', dialog => dialog.accept())
  await page.goto('http://127.0.0.1:4183')
  await page.getByPlaceholder('创建主密码', { exact: true }).fill(password)
  await page.getByPlaceholder('再次输入主密码', { exact: true }).fill(password)
  await button(page, '创建并进入').click()
  await button(page, '编辑资料').waitFor()
  return page
}
async function importFile(page, path) {
  const chooser = page.waitForEvent('filechooser')
  await button(page, '从备份恢复').click()
  await (await chooser).setFiles(path)
}
try {
  const source = await create('QA-Backup-Source')
  await button(source, '编辑资料').click()
  await source.getByPlaceholder('真实姓名', { exact: true }).fill('QA备份恢复资料')
  await button(source, '保存').click()
  await source.evaluate(() => { location.hash = '#/docs' })
  const content = Buffer.from('备份附件校验\n'.repeat(100000))
  await source.locator('input[type=file]').setInputFiles({ name: 'qa-backup.txt', mimeType: 'text/plain', buffer: content })
  await source.getByText('qa-backup.txt', { exact: true }).waitFor()
  await settings(source, '安全')
  await source.getByPlaceholder('验证本机主密码', { exact: true }).fill('QA-Backup-Source')
  await button(source, '升级并启用').click()
  await button(source, '生成设备加入文件').waitFor()
  await button(source, '备份').click()
  const exported = source.waitForEvent('download')
  await button(source, '导出加密备份').click()
  const backupPath = join(directory, 'source.phub')
  await (await exported).saveAs(backupPath)
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'))
  assert.equal(backup.docs.length, 1)
  assert.equal(backup.envelope.v, 3)
  assert.equal(JSON.stringify(backup).includes('QA备份恢复资料'), false)
  pass('生产 Web 导出 v3 加密备份，包含附件密文，未包含资料明文')

  const target = await create('QA-Backup-Target')
  await settings(target, '备份')
  await importFile(target, backupPath)
  await target.getByPlaceholder('备份文件的主密码', { exact: true }).fill('wrong-password')
  await button(target, '确认恢复').click()
  await target.getByText('无法解密备份，请检查主密码或文件是否完整', { exact: true }).waitFor()
  await target.getByPlaceholder('备份文件的主密码', { exact: true }).fill('QA-Backup-Source')
  await button(target, '确认恢复').click()
  await target.getByText('备份已恢复（密钥已换绑到当前主密码）', { exact: true }).waitFor()
  await target.keyboard.press('Escape')
  await button(target, '编辑资料').click()
  assert.equal(await target.getByPlaceholder('真实姓名', { exact: true }).inputValue(), 'QA备份恢复资料')
  await button(target, '取消').click()
  pass('不同目标主密码恢复：错误备份密码被拒绝，正确密码恢复资料成功')

  await target.reload()
  await target.getByPlaceholder('主密码', { exact: true }).fill('QA-Backup-Target')
  await button(target, '解锁').click()
  await button(target, '编辑资料').waitFor()
  await target.evaluate(() => { location.hash = '#/docs' })
  const downloaded = target.waitForEvent('download')
  await target.locator('article').filter({ has: target.getByText('qa-backup.txt', { exact: true }) }).getByRole('button', { name: '下载', exact: true }).click()
  const restoredPath = join(directory, 'restored.txt')
  await (await downloaded).saveAs(restoredPath)
  assert.deepEqual(readFileSync(restoredPath), content)
  pass('恢复后刷新仍使用目标主密码解锁，附件下载逐字节一致')
  assert.deepEqual(errors, [])
  writeFileSync(join(directory, 'report.json'), JSON.stringify({ passed: true, results, errors }, null, 2))
  console.log(`验证记录：${directory}`)
} catch (error) {
  writeFileSync(join(directory, 'report.json'), JSON.stringify({ passed: false, results, errors, failure: String(error) }, null, 2))
  throw error
} finally { await browser.close() }
