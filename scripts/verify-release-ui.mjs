import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const base = process.env.PHUB_VERIFY_URL ?? 'http://127.0.0.1:4183'
const output = '.visual-qa/release-ui'
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.PHUB_BROWSER_CHANNEL ?? 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.setDefaultTimeout(30000)
try {
  await page.goto(base)
  await page.getByRole('button', { name: '仅在本机使用 / 旧版设备加入', exact: true }).click()
  await page.getByPlaceholder('创建主密码', { exact: true }).fill('Preview-QA-Password')
  await page.getByPlaceholder('再次输入主密码', { exact: true }).fill('Preview-QA-Password')
  await page.getByPlaceholder('例如：我的工作台').fill('自动验收账户')
  await page.getByRole('button', { name: '下一步：保存恢复密钥', exact: true }).click()
  const recoveryCode = await page.locator('textarea[readonly]').inputValue()
  await page.getByLabel('确认密钥最后 8 位').fill(recoveryCode.slice(-8))
  await page.getByRole('checkbox', { name: '我已在应用之外保存完整密钥' }).check()
  await page.getByRole('button', { name: '确认保存并启用', exact: true }).click()
  await page.getByRole('button', { name: '锁定', exact: true }).first().waitFor()
  await page.screenshot({ path: `${output}/dashboard.png`, fullPage: true })
  await page.getByRole('button', { name: '设置', exact: true }).first().click()
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button').filter({ has: page.getByText('关于与帮助', { exact: true }) }).click()
  await page.getByText(`版本 ${JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version}`, { exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '锁定', exact: true }).first().click()
  await page.getByPlaceholder('主密码', { exact: true }).fill('Preview-QA-Password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '锁定', exact: true }).first().waitFor()
  await page.goto(`${base}/?pet=1`)
  await page.getByRole('heading', { name: '奶龙，今天也陪着你。', exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('.dragon-render')?.getAttribute('data-ready') === 'true')
  assert.equal(await page.locator('.dragon-fallback').count(), 0)
  await page.screenshot({ path: `${output}/pet.png`, fullPage: true })
  for (const action of ['打招呼', '喂蛋糕', '跳个舞', '小憩一下', '摸摸头']) {
    await page.getByRole('button', { name: action, exact: true }).click()
    await page.waitForTimeout(600)
    assert.equal(await page.locator('.dragon-fallback').count(), 0)
  }
  await page.getByRole('button', { name: '开始自主走动', exact: true }).click()
  await page.getByRole('button', { name: '停止自主走动', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: `${output}/pet-mobile.png`, fullPage: true })
  assert.deepEqual(errors, [])
  writeFileSync(`${output}/report.json`, JSON.stringify({ passed: true, errors, checks: ['create', 'version', 'lock-unlock', 'pet-model', 'pet-actions', 'pet-roaming-toggle', 'mobile-width'] }, null, 2))
  console.log('PASS: 预览版版本、锁定解锁、宠物加载与动作、移动端宽度')
} finally { await browser.close() }
