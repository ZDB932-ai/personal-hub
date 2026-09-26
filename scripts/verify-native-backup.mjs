import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

export async function verifyNativeBackup(source, password, browser, preview, directory, label) {
  const button = (page, name) => page.getByRole('button', { name, exact: true })
  await button(source, '暂停同步').click()
  await source.getByText('同步已暂停', { exact: true }).waitFor()
  await button(source, '备份').click()
  await source.evaluate(() => { window.qaBackup = undefined })
  await button(source, '导出加密备份').click()
  await source.waitForFunction(() => typeof window.qaBackup === 'string', null, { timeout: 180000 })
  const text = await source.evaluate(() => window.qaBackup)
  const path = join(directory, `${label}.phub`)
  writeFileSync(path, text)
  const backup = JSON.parse(text)
  assert.ok(backup.docs.length > 0)
  const context = await browser.newContext({ acceptDownloads: true })
  try {
    const page = await context.newPage()
    page.setDefaultTimeout(180000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    await page.goto(preview)
    await page.getByPlaceholder('创建主密码', { exact: true }).fill('QA-Restored-Backup-Password')
    await page.getByPlaceholder('再次输入主密码', { exact: true }).fill('QA-Restored-Backup-Password')
    await button(page, '创建并进入').click()
    await button(page, '设置').first().click(); await button(page, '备份').click()
    const chooser = page.waitForEvent('filechooser')
    await button(page, '从备份恢复').click()
    await (await chooser).setFiles(path)
    await page.getByPlaceholder('备份文件的主密码', { exact: true }).fill(password)
    await button(page, '确认恢复').click()
    await page.getByText('备份已恢复（密钥已换绑到当前主密码）', { exact: true }).waitFor()
    await page.reload()
    await page.getByPlaceholder('主密码', { exact: true }).fill('QA-Restored-Backup-Password')
    await button(page, '解锁').click()
    await button(page, '编辑资料').click()
    assert.equal(await page.getByPlaceholder('真实姓名', { exact: true }).inputValue(), 'QA三端重连')
    await button(page, '取消').click()
    await page.evaluate(() => { location.hash = '#/docs' })
    await page.getByRole('heading', { name: '个人资料库', exact: true }).waitFor()
    const names = await page.locator('article p[title]').allTextContents()
    assert.equal(names.length, backup.docs.length)
    const expected = Buffer.alloc(10 * 1024 * 1024)
    for (let i = 0; i < expected.length; i++) expected[i] = i % 251
    const hash = bytes => createHash('sha256').update(bytes).digest('hex')
    const expectedHash = hash(expected)
    for (const [index, name] of names.entries()) {
      assert.match(name, /^(phone|desktop)-\d+\.bin$/)
      const download = page.waitForEvent('download')
      await page.locator('article').filter({ has: page.getByText(name, { exact: true }) }).getByRole('button', { name: '下载', exact: true }).click()
      const output = join(directory, `${label}-restored-${index}.bin`)
      await (await download).saveAs(output)
      const bytes = readFileSync(output)
      assert.equal(bytes.length, expected.length)
      assert.equal(hash(bytes), expectedHash)
    }
    assert.deepEqual(errors, [])
    return names.length
  } finally {
    await context.close()
    await button(source, '同步').click()
    await button(source, '恢复同步').click()
    await source.getByText('已同步（记录与附件）', { exact: true }).waitFor({ timeout: 180000 })
  }
}
