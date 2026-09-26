import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
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
  await page.getByPlaceholder('创建主密码', { exact: true }).fill('Preview-QA-Password')
  await page.getByPlaceholder('再次输入主密码', { exact: true }).fill('Preview-QA-Password')
  await page.getByRole('button', { name: '创建并进入', exact: true }).click()
  await page.getByRole('button', { name: '锁定', exact: true }).first().waitFor()
  await page.screenshot({ path: `${output}/dashboard.png`, fullPage: true })
  await page.getByRole('button', { name: '设置', exact: true }).first().click()
  await page.getByRole('button', { name: '关于', exact: true }).click()
  await page.getByText('Personal Hub v1.1.1', { exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '锁定', exact: true }).first().click()
  await page.getByPlaceholder('主密码', { exact: true }).fill('Preview-QA-Password')
  await page.getByRole('button', { name: '解锁', exact: true }).click()
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
