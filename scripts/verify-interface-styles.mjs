import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const url = process.env.QA_URL || 'http://127.0.0.1:4186'
const output = '.visual-qa/interface-styles'
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
const results = []
page.on('pageerror', error => errors.push(error.message))

async function openSettings() {
  if (page.viewportSize().width < 768) await page.getByRole('button', { name: '打开设置', exact: true }).click()
  else await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '界面样式', exact: true }).click()
  await page.getByRole('group', { name: '界面风格', exact: true }).waitFor()
}

async function noOverflow(label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, label)
}

function luminance(hex) {
  const raw = hex.trim().replace('#', '')
  const normalized = raw.length === 3 ? [...raw].map(v => v + v).join('') : raw
  const rgb = normalized.match(/.{2}/g).map(v => parseInt(v, 16) / 255)
  return rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
}

try {
  await page.goto(url)
  await page.getByPlaceholder('创建主密码', { exact: true }).fill('QA-Interface-Styles-Only')
  await page.getByPlaceholder('再次输入主密码', { exact: true }).fill('QA-Interface-Styles-Only')
  await page.getByRole('button', { name: '创建并进入', exact: true }).click()
  await page.getByRole('button', { name: '锁定', exact: true }).first().waitFor()
  await page.goto(`${url}/#/today`)
  await page.getByLabel('快速添加任务', { exact: true }).fill('整理项目资料，准备下一步')
  await page.getByRole('button', { name: '确认添加', exact: true }).click()
  await page.goto(`${url}/#/`)

  for (const [key, label] of [['classic', '经典纸感'], ['sunrise', '晨光工作室'], ['aurora', '极光浮岛'], ['precision', '精密面板']]) {
    for (const [mode, modeLabel] of [['light', '浅色'], ['dark', '深色']]) {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await openSettings()
      await page.getByRole('button', { name: label, exact: true }).click()
      await page.getByRole('button', { name: modeLabel, exact: true }).click()
      await page.waitForFunction(([style, theme]) => document.documentElement.dataset.interface === style && document.documentElement.dataset.theme === theme, [key, mode])
      assert.equal(await page.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true')
      const contrast = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement)
        return ['--tk-t1', '--tk-t3', '--tk-body', '--tk-surface', '--tk-surface-2', '--tk-chrome', '--tk-inset'].map(key => css.getPropertyValue(key).trim())
      })
      for (const text of contrast.slice(0, 2)) {
        for (const background of contrast.slice(2)) {
          const values = [luminance(text), luminance(background)].sort((a, b) => b - a)
          assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${key}/${mode}: ${text} on ${background}`)
        }
      }
      await page.getByRole('heading', { name: '界面风格', exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${output}/${key}-${mode}-settings.png`, animations: 'disabled' })
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      await page.screenshot({ path: `${output}/${key}-${mode}-desktop.png`, fullPage: true, animations: 'disabled' })
      for (const width of [375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 })
        await noOverflow(`${key}/${mode}/${width}`)
      }
      await page.setViewportSize({ width: 375, height: 812 })
      await openSettings()
      await noOverflow(`${key}/${mode}/mobile-settings`)
      await page.screenshot({ path: `${output}/${key}-${mode}-mobile.png`, animations: 'disabled' })
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      results.push(`${key}/${mode}: 切换、对比度、四档视口、手机设置通过`)
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 })
  await openSettings()
  await page.getByRole('button', { name: '极光浮岛', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: '玫红', exact: true }).click()
  await page.getByRole('button', { name: '晨光工作室', exact: true }).click()
  assert.equal(await page.evaluate(() => document.documentElement.dataset.accent), 'rose', '切换风格保留自选配色')
  await page.getByRole('button', { name: '极光浮岛', exact: true }).click()
  await page.getByRole('button', { name: '跟随系统', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await page.reload()
  await page.getByPlaceholder('主密码', { exact: true }).waitFor()
  assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.interface, document.documentElement.dataset.theme, document.documentElement.dataset.accent]), ['aurora', 'dark', 'rose'])
  await page.getByPlaceholder('主密码', { exact: true }).fill('QA-Interface-Styles-Only')
  await page.getByRole('button', { name: '解锁', exact: true }).click()
  await page.getByRole('button', { name: '锁定', exact: true }).first().waitFor()
  for (const route of ['today', 'memos', 'vault', 'docs', 'repos', 'agent-library']) {
    await page.goto(`${url}/#/${route}`)
    await page.locator('.page-header').waitFor()
    await noOverflow(route)
  }
  await page.goto(`${url}/#/`)
  await page.getByText('整理项目资料，准备下一步', { exact: true }).waitFor()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openSettings()
  const duration = await page.getByRole('button', { name: '经典纸感', exact: true }).evaluate(el => getComputedStyle(el).transitionDuration)
  assert.ok(parseFloat(duration) <= 0.001)
  await page.getByRole('button', { name: '经典纸感', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.interface === 'classic')
  assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-card-radius'))), 0.75)
  results.push('键盘操作、跟随系统、刷新保留风格与自选色、业务数据保留、六页面、减少动画、恢复原版通过')

  const fallbackPage = await context.newPage()
  await fallbackPage.addInitScript(() => localStorage.setItem('xk.theme.v1', JSON.stringify({ style: 'unknown', mode: 'invalid', accent: 'invalid' })))
  await fallbackPage.goto(url)
  await fallbackPage.getByPlaceholder('主密码', { exact: true }).waitFor()
  assert.deepEqual(await fallbackPage.evaluate(() => [document.documentElement.dataset.interface, document.documentElement.dataset.theme, document.documentElement.dataset.accent]), ['classic', 'light', 'teal'])
  await fallbackPage.close()
  assert.deepEqual(errors, [])
  results.push('未知偏好安全回退，无页面异常')
  writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2))
  console.log(results.join('\n'))
} finally {
  await browser.close()
}
