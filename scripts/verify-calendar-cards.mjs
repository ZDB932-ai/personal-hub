import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'

const browser = await chromium.launch({ channel: process.env.PHUB_BROWSER_CHANNEL ?? 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, permissions: ['notifications'] })
await page.clock.setFixedTime(new Date('2026-09-28T09:07:00'))
page.setDefaultTimeout(20000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('dialog', dialog => dialog.accept())
const button = name => page.getByRole('button', { name, exact: true })
const dialog = page.getByRole('dialog')
const output = '.visual-qa/calendar-cards'
mkdirSync(output, { recursive: true })
try {
  await page.goto(process.env.PHUB_VERIFY_URL ?? 'http://127.0.0.1:4188')
  await page.getByPlaceholder('创建主密码', { exact: true }).fill('Calendar-Cards-QA-2026')
  await page.getByPlaceholder('再次输入主密码', { exact: true }).fill('Calendar-Cards-QA-2026')
  await button('创建并进入').click()
  await button('锁定').first().waitFor()
  await page.evaluate(() => { location.hash = '/calendar' })
  for (const [title, time, duration] of [['挑选三张喜欢的照片', '09:15', 15], ['为照片写一段短故事', '09:30', 15], ['整理秋日摄影集', '10:15', 30], ['和朋友一起讨论摄影集的封面与排版', '11:30', 60], ['睡前记录灵感', '23:59', 5]]) {
    await button('安排任务').click()
    await dialog.getByPlaceholder('要做什么？').fill(title)
    await dialog.locator('input[type=time]').fill(time)
    await dialog.locator('input[type=number]').fill(String(duration))
    await dialog.getByRole('button', { name: '添加任务', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
  }
  const geometry = await page.locator('.timeline-event').evaluateAll(elements => elements.map(element => {
    const card = element.getBoundingClientRect(), label = element.querySelector('.timeline-event-time').getBoundingClientRect()
    return { top: card.top, bottom: card.bottom, left: card.left, right: card.right, height: card.height, timeFits: label.bottom <= card.bottom - 2 }
  }))
  assert.ok(geometry.every(card => card.height >= 44 && card.timeFits))
  for (let i = 0; i < geometry.length; i++) for (let j = i + 1; j < geometry.length; j++) {
    const a = geometry[i], b = geometry[j]
    assert.ok(a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left)
  }
  await page.getByText('已添加，到点会提醒你', { exact: true }).first().waitFor({ state: 'hidden' })
  await page.screenshot({ path: `${output}/week.png` })
  await button('日').click()
  const short = page.locator('.timeline-event').filter({ hasText: '挑选三张喜欢的照片' })
  await short.focus()
  await page.keyboard.press('Enter')
  assert.equal(await dialog.locator('input[type=time]').inputValue(), '09:15')
  assert.equal(await dialog.locator('input[type=number]').inputValue(), '15')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  await button('今天').click()
  await page.screenshot({ path: `${output}/day.png` })
  for (const width of [320, 375, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.ok(await short.evaluate(el => el.getBoundingClientRect().height >= 44 && el.querySelector('.timeline-event-time').getBoundingClientRect().bottom < el.getBoundingClientRect().bottom))
    if (width === 375) await page.screenshot({ path: `${output}/mobile.png` })
  }
  const late = page.locator('.timeline-event').filter({ hasText: '睡前记录灵感' })
  await late.scrollIntoViewIfNeeded()
  assert.ok(await late.evaluate(el => el.getBoundingClientRect().bottom <= el.closest('.calendar-timeline').getBoundingClientRect().bottom))
  await late.click()
  assert.equal(await dialog.locator('input[type=time]').inputValue(), '23:59')
  await page.keyboard.press('Escape')
  await button('今天').click()
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark')
  await page.screenshot({ path: `${output}/dark.png` })
  assert.deepEqual(errors, [])
  console.log('PASS: 15分钟卡片与真实时长、连续短任务避让、时间文字不裁切、键盘编辑、午夜卡片可点击、320–1440px布局')
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true })
  throw error
} finally { await browser.close() }
