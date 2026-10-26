import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { createReadStream, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { extname, resolve, sep } from 'node:path'
import assert from 'node:assert/strict'

const smoke = process.argv.includes('--smoke')
const matrixOnly = process.argv.includes('--matrix-only')
const flowsOnly = process.argv.includes('--flows-only')
const output = resolve(process.env.QA_OUTPUT || '.visual-qa/settings-product')
const dist = resolve('dist')
const allStyles = ['classic', 'swiss', 'terminal', 'brutalist', 'retro', 'botanical', 'orbital', 'atelier', 'blueprint', 'gallery', 'arcade', 'sunrise', 'aurora', 'precision']
const styles = process.env.QA_STYLE_FILTER?.split(',') || (smoke ? ['classic', 'terminal', 'botanical'] : allStyles)
const widths = process.env.QA_WIDTHS?.split(',').map(Number) || (smoke ? [1440, 375] : [1440, 1024, 768, 375, 320])
const sections = ['外观', '桌面伙伴', '账户与恢复', '隐私与锁定', '同步与离线', '备份与迁移', '关于与帮助']
const styleNames = { classic: '经典纸感', swiss: '瑞士编辑', terminal: '赛博终端', brutalist: '新粗野主义', retro: '复古桌面', botanical: '自然手札', orbital: '轨道空间', atelier: '纸上工坊', blueprint: '工程蓝图', gallery: '艺廊留白', arcade: '像素游乐场', sunrise: '晨光工作室', aurora: '极光浮岛', precision: '精密面板' }
const password = 'Settings-isolated-fixture-2026'
const taskTitle = '设置验收：保留我的本机任务'
const report = {
  passed: false,
  scope: 'Production Web build, isolated synthetic local account, blocked external requests; Windows native widgets and physical Android are outside this script.',
  startedAt: new Date().toISOString(),
  build: { indexSha256: createHash('sha256').update(readFileSync(resolve(dist, 'index.html'))).digest('hex'), indexModifiedAt: statSync(resolve(dist, 'index.html')).mtime.toISOString() },
  configuration: { smoke, matrixOnly, flowsOnly, styles, widths, sections },
  flows: [], layouts: [], contrast: [], selectPopups: [], appearances: [], screenshots: [], confirmations: [], blockedExternal: [], expectedLoadErrors: [], failures: [], errors: [],
}
assert(styles.every(style => allStyles.includes(style)), 'Unknown style filter')
assert(widths.every(width => Number.isFinite(width) && width >= 320), 'Invalid viewport filter')
assert(!(matrixOnly && flowsOnly), 'Choose only one of --matrix-only and --flows-only')
mkdirSync(output, { recursive: true })
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2' }
const server = createServer((request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const file = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`)
    if (!file.startsWith(dist + sep) || !statSync(file).isFile()) throw new Error('not found')
    response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream')
    response.setHeader('Cache-Control', 'no-store')
    if (request.method === 'HEAD') response.end()
    else createReadStream(file).pipe(response)
  } catch { response.writeHead(404); response.end() }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ channel: process.env.QA_BROWSER_CHANNEL || 'msedge', headless: !process.argv.includes('--headed') })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, timezoneId: 'Asia/Shanghai', locale: 'zh-CN', reducedMotion: 'reduce', permissions: ['notifications'] })
await context.route('**/*', route => {
  const request = route.request()
  if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) {
    const url = new URL(request.url())
    report.blockedExternal.push({ method: request.method(), origin: url.origin, path: url.pathname })
    return route.abort()
  }
  return route.continue()
})
const page = await context.newPage()
page.setDefaultTimeout(20000)
page.on('pageerror', error => report.errors.push(error.message))
page.on('dialog', async dialog => {
  report.confirmations.push({ expected: false, type: dialog.type(), message: dialog.message() })
  report.failures.push({ message: 'Unexpected confirmation while browsing settings', details: dialog.message() })
  await dialog.dismiss()
})
const visible = locator => locator.filter({ visible: true })
const button = (name, target = page) => visible(target.getByRole('button', { name, exact: true }))
const panel = (target = page) => target.getByRole('dialog', { name: '设置', exact: true })
const navButton = (name, target = page) => panel(target).getByRole('navigation', { name: '设置分类', exact: true }).getByRole('button').filter({ has: target.getByText(name, { exact: true }) })
const preferenceSnapshot = () => page.evaluate(() => ({ theme: JSON.parse(localStorage.getItem('xk.theme.v1') || '{}'), wallpaper: JSON.parse(localStorage.getItem('xk.wallpaper.v1') || 'null') }))
const check = (passed, message, details) => { if (!passed) report.failures.push({ message, details }) }
const recordFlow = (name, checks) => report.flows.push({ name, checks, passed: true })

async function settled(target = page) {
  await target.evaluate(async () => {
    const pending = () => document.getAnimations().filter(animation => {
      const element = animation.effect?.target
      if (animation.playState !== 'running' || !Number.isFinite(animation.effect?.getComputedTiming().endTime) || !element?.checkVisibility?.({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor.tagName === 'DETAILS' && !ancestor.open && !ancestor.querySelector(':scope > summary')?.contains(element)) return false
      }
      return true
    })
    const deadline = performance.now() + 3000
    let stableFrames = 0
    while (stableFrames < 3) {
      await new Promise(done => requestAnimationFrame(done))
      const modalTransition = document.querySelector('.modal-enter-active, .modal-leave-active')
      if (pending().length || modalTransition) stableFrames = 0
      else stableFrames++
      if (performance.now() > deadline) throw new Error(`Painted finite animations did not settle: ${JSON.stringify({ modal: modalTransition?.className, animations: pending().map(animation => ({ property: animation.transitionProperty || animation.animationName, state: animation.playState, timing: animation.effect?.getComputedTiming(), target: animation.effect?.target?.className })) })}`)
    }
  })
}

async function capture(name, target = page) {
  await settled(target)
  await target.screenshot({ path: resolve(output, `${name}.png`), animations: 'disabled' })
  report.screenshots.push(`${name}.png`)
}

async function openSettings(target = page) {
  if (await panel(target).isVisible()) return
  const direct = button('设置', target)
  if (await direct.count()) await direct.click()
  else {
    await button('打开更多导航', target).click()
    await visible(target.getByRole('dialog')).getByRole('button', { name: '设置', exact: true }).click()
  }
  await panel(target).waitFor()
  await settled(target)
}

async function section(name, target = page) {
  await openSettings(target)
  const dialog = panel(target)
  const nav = dialog.getByRole('navigation', { name: '设置分类', exact: true })
  if (!await nav.isVisible()) {
    const back = dialog.getByRole('button', { name: '返回设置分类', exact: true })
    if (await back.isVisible()) await back.click()
  }
  await navButton(name, target).click()
  await visible(dialog.locator('.settings-content')).waitFor()
  await visible(dialog.locator('[aria-busy="true"]')).waitFor({ state: 'hidden' })
  await settled(target)
  assert.equal(await visible(dialog.getByRole('alert')).count(), 0, `${name} loads without error`)
}

async function appearance(category = '颜色与显示') {
  await section('外观')
  await panel().getByRole('navigation', { name: '外观设置内容', exact: true }).getByRole('button', { name: category, exact: true }).click()
  await settled()
}

async function chooseStyle(style, mode) {
  await appearance('界面风格')
  await panel().getByRole('group', { name: '筛选界面风格', exact: true }).getByRole('button', { name: '全部', exact: true }).click()
  await panel().getByRole('group', { name: '界面风格', exact: true }).getByRole('button', { name: styleNames[style], exact: true }).click()
  const recommend = panel().getByRole('button', { name: '应用推荐配色', exact: true })
  if (await recommend.isVisible()) await recommend.click()
  await appearance()
  await panel().getByRole('button', { name: mode === 'light' ? '浅色' : '深色', exact: true }).click()
  await page.waitForFunction(([style, mode]) => document.documentElement.dataset.interface === style && document.documentElement.dataset.theme === mode, [style, mode])
  await settled()
}

async function closeSettings(target = page) {
  await panel(target).getByRole('button', { name: '关闭设置', exact: true }).click()
  await panel(target).waitFor({ state: 'hidden' })
  await settled(target)
}

async function scrollSection(bottom) {
  await panel().evaluate((dialog, bottom) => {
    const content = dialog.querySelector('.settings-content')
    for (let node = content; node && node !== dialog; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (/auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) node.scrollTop = bottom ? node.scrollHeight : 0
    }
  }, bottom)
  await settled()
}

async function inspectLayout(label) {
  const result = await panel().evaluate(dialog => {
    const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom } }
    const shown = element => {
      if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor.tagName !== 'DETAILS' || ancestor.open) continue
        const summary = ancestor.querySelector(':scope > summary')
        if (!summary || !summary.contains(element)) return false
      }
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }
    const clipped = element => {
      let left = 0, top = 0, right = innerWidth, bottom = innerHeight
      for (let node = element.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node), rect = node.getBoundingClientRect()
        if (/auto|scroll|hidden|clip/.test(style.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right) }
        if (/auto|scroll|hidden|clip/.test(style.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom) }
      }
      const rect = element.getBoundingClientRect()
      return rect.left < left - 1 || rect.right > right + 1 || rect.top < top - 1 || rect.bottom > bottom + 1
    }
    const controls = [...dialog.querySelectorAll('button, summary, input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]), select, textarea')].filter(element => shown(element) && !element.disabled && !clipped(element)).map(element => {
      const rect = box(element), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return { label: element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.textContent.trim().slice(0, 65), tag: element.tagName, ...rect, reachable: element === hit || element.contains(hit) }
    })
    const sections = [...dialog.querySelectorAll('.settings-content, .appearance-studio, .settings-card, .appearance-setting-group, .style-selection-summary')].filter(shown).map(element => ({ className: element.className, width: element.clientWidth, scrollWidth: element.scrollWidth }))
    const close = dialog.querySelector('[aria-label="关闭设置"]'), closeRect = box(close), hit = document.elementFromPoint(closeRect.x + closeRect.width / 2, closeRect.y + closeRect.height / 2)
    const headings = [...dialog.querySelectorAll('h2, h3, h4')].filter(shown).map(element => element.textContent.trim())
    const nested = [...dialog.querySelectorAll('button button, button input, button a, label button')].filter(shown).map(element => element.outerHTML.slice(0, 180))
    const nav = dialog.querySelector('nav[aria-label="设置分类"]')
    return { width: innerWidth, height: innerHeight, documentOverflow: document.documentElement.scrollWidth > innerWidth + 1, dialog: box(dialog), close: { ...closeRect, reachable: close === hit || close.contains(hit) }, controls, sections, headings, nested, navVisible: Boolean(nav && shown(nav)), text: dialog.innerText.slice(0, 1800) }
  })
  check(!result.documentOverflow, `${label}: document has no horizontal overflow`, result.width)
  check(result.dialog.x >= -1 && result.dialog.right <= result.width + 1 && result.dialog.y >= -1 && result.dialog.bottom <= result.height + 1, `${label}: settings stays in viewport`, result.dialog)
  check(result.close.reachable && result.close.y >= 0 && result.close.bottom <= result.height, `${label}: close control stays reachable`, result.close)
  check(result.controls.length > 0, `${label}: visible controls are present`, result.controls.length)
  check(result.controls.every(control => control.width >= 43 && control.height >= 43 && control.reachable), `${label}: visible controls have 44px targets and are unobstructed`, result.controls.filter(control => control.width < 43 || control.height < 43 || !control.reachable))
  check(result.sections.every(item => item.scrollWidth <= item.width + 1), `${label}: settings content fits its column`, result.sections.filter(item => item.scrollWidth > item.width + 1))
  check(result.nested.length === 0, `${label}: no nested interactive controls`, result.nested)
  check(!/新增设计|原有风格|全新设计|10 款全新/.test(result.text), `${label}: user facing catalog labels`, result.text)
  report.layouts.push({ label, ...result })
  return result
}

async function inspectContrast(label, scope = panel()) {
  const result = await scope.evaluate(dialog => {
    const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    const rgba = value => { canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = value; canvas.fillRect(0, 0, 1, 1); return [...canvas.getImageData(0, 0, 1, 1).data].map((v, i) => i === 3 ? v / 255 : v) }
    const over = (foreground, background) => [...foreground.slice(0, 3).map((value, index) => value * foreground[3] + background[index] * (1 - foreground[3])), 1]
    const luminance = values => values.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
    const samples = new Map()
    const candidates = dialog.querySelectorAll('.settings-window-title h2, .settings-product-name, .settings-style-label, .settings-group-label, .settings-nav-item strong, .settings-nav-item small, .settings-page-title, .settings-page-eyebrow, .settings-page-description, .settings-section-title, .settings-description, .appearance-section-heading p, .appearance-help, .appearance-note, .appearance-tabs > button, .appearance-mode, .appearance-accent, .style-selection-summary, .style-collection-filters button, .ui-secondary-button, .ui-danger-button, [role="option"]')
    for (const candidate of candidates) {
      if (candidate.disabled) continue
      const walker = document.createTreeWalker(candidate, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue
        const element = node.parentElement, rect = element.getBoundingClientRect(), style = getComputedStyle(element)
        if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) || rect.width <= 0 || rect.height <= 0 || rect.y < 0 || rect.bottom > innerHeight || element.closest('[aria-hidden="true"], .style-preview, .wallpaper-preview, button:disabled')) continue
        let hiddenByDisclosure = false
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          if (ancestor.tagName === 'DETAILS' && !ancestor.open && !ancestor.querySelector(':scope > summary')?.contains(element)) hiddenByDisclosure = true
        }
        if (hiddenByDisclosure) continue
        const hit = document.elementFromPoint(rect.x + Math.min(rect.width / 2, 12), rect.y + rect.height / 2)
        if (!hit || !(element === hit || element.contains(hit) || hit.contains(element))) continue
        const chain = []; for (let current = element; current; current = current.parentElement) chain.unshift(current)
        const background = chain.reduce((color, current) => over(rgba(getComputedStyle(current).backgroundColor), color), [255, 255, 255, 1])
        const foreground = over(rgba(style.color), background), a = luminance(foreground), b = luminance(background)
        const fontSize = parseFloat(style.fontSize), fontWeight = parseInt(style.fontWeight, 10), text = node.textContent.trim().slice(0, 90)
        const target = fontSize >= 24 || fontSize >= 18.66 && fontWeight >= 700 ? 3 : 4.5
        const key = `${text}/${style.color}/${background}`
        samples.set(key, { text, source: candidate.className || candidate.getAttribute('role') || candidate.tagName, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), target, fontSize, fontWeight })
      }
    }
    const painted = element => element.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })
    const navigation = dialog.querySelector('nav[aria-label="设置分类"]')
    return { samples: [...samples.values()], coverage: {
      settingsPanel: dialog.classList.contains('settings-panel'),
      windowTitles: [...dialog.querySelectorAll('.settings-window-title h2')].filter(painted).length,
      pageTitles: [...dialog.querySelectorAll('.settings-page-title')].filter(painted).length,
      navigationVisible: Boolean(navigation && painted(navigation)),
      navigationTexts: [...dialog.querySelectorAll('.settings-nav-item strong, .settings-nav-item small')].filter(painted).length,
      selectOptions: [...dialog.querySelectorAll('[role="option"]')].filter(painted).length,
    } }
  })
  for (const sample of result.samples) check(sample.ratio >= sample.target - .02, `${label}: normal text contrast`, sample)
  if (result.coverage.settingsPanel) {
    check(result.coverage.windowTitles > 0, `${label}: actual window title is included in contrast coverage`, result.coverage)
    if (result.coverage.navigationVisible) check(result.coverage.navigationTexts > 0, `${label}: actual visible navigation labels are included in contrast coverage`, result.coverage)
  }
  report.contrast.push({ label, ...result })
}

async function inspectSelectPopup(label, mobileEscape = false) {
  const trigger = panel().getByRole('combobox', { name: '自动锁定', exact: true })
  await trigger.scrollIntoViewIfNeeded()
  await trigger.focus()
  await page.keyboard.press('ArrowDown')
  const popup = page.getByRole('listbox')
  await popup.waitFor()
  await settled()
  const expectedStyle = await trigger.evaluate(element => ({ radius: getComputedStyle(element).borderRadius, controlRadius: getComputedStyle(element).getPropertyValue('--settings-control-radius').trim(), style: document.documentElement.dataset.interface, mode: document.documentElement.dataset.theme }))
  const result = await popup.evaluate(element => {
    const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom } }
    const options = [...element.querySelectorAll('[role="option"]')].map(option => {
      const rect = box(option), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return { text: option.textContent.trim(), ...rect, painted: option.checkVisibility({ opacityProperty: true, visibilityProperty: true }), reachable: option === hit || option.contains(hit), radius: getComputedStyle(option).borderRadius }
    })
    return { ...box(element), viewport: { width: innerWidth, height: innerHeight }, outsideSettings: !document.querySelector('.settings-panel').contains(element), settingsContext: element.classList.contains('settings-select-popup'), radius: getComputedStyle(element).borderRadius, controlRadius: getComputedStyle(element).getPropertyValue('--settings-control-radius').trim(), style: document.documentElement.dataset.interface, mode: document.documentElement.dataset.theme, options }
  })
  check(result.outsideSettings && result.settingsContext, `${label}: teleported listbox preserves settings context`, result)
  check(result.style === expectedStyle.style && result.mode === expectedStyle.mode && result.controlRadius === expectedStyle.controlRadius && result.radius === expectedStyle.radius, `${label}: teleported listbox follows the current style`, { actual: result, expected: expectedStyle })
  check(result.x >= 0 && result.y >= 0 && result.right <= result.viewport.width && result.bottom <= result.viewport.height, `${label}: teleported listbox stays in viewport`, result)
  check(result.options.length === 5 && result.options.every(option => option.painted && option.reachable && option.width >= 43 && option.height >= 43 && option.radius === result.radius), `${label}: every option is visible, styled, reachable and at least 44px`, result.options)
  await inspectContrast(`${label}/select-popup`, popup)
  await page.keyboard.press('End')
  assert.equal(await popup.getAttribute('aria-activedescendant'), await popup.getByRole('option').last().getAttribute('id'), 'End focuses the last option')
  await page.keyboard.press('Home')
  assert.equal(await popup.getAttribute('aria-activedescendant'), await popup.getByRole('option').first().getAttribute('id'), 'Home focuses the first option')
  await page.keyboard.press('Escape')
  await popup.waitFor({ state: 'hidden' })
  assert(await panel().isVisible(), 'First Escape preserves settings')
  assert(await trigger.evaluate(element => document.activeElement === element), 'Closing the dropdown restores its trigger focus')
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
  if (mobileEscape) {
    assert(await panel().getByRole('button', { name: '返回设置分类', exact: true }).isVisible(), 'First Escape preserves the mobile detail view')
    await page.keyboard.press('Escape')
    await settled()
    assert(await panel().isVisible(), 'Second Escape preserves the settings window')
    assert(await panel().getByRole('navigation', { name: '设置分类', exact: true }).isVisible(), 'Second Escape returns to mobile categories')
    await page.keyboard.press('Escape')
    await panel().waitFor({ state: 'hidden' })
  }
  report.selectPopups.push({ label, expected: expectedStyle, actual: result, mobileEscape })
}

async function inspectCloseIconContrast(label) {
  const close = panel().getByRole('button', { name: '关闭设置', exact: true })
  const samples = []
  for (const state of ['normal', 'hover', 'after-hover']) {
    if (state === 'hover') await close.hover()
    else await page.mouse.move(0, 0)
    await settled()
    const sample = await close.evaluate(button => {
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
      const rgba = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].map((value, index) => index === 3 ? value / 255 : value) }
      const over = (foreground, background) => [...foreground.slice(0, 3).map((value, index) => value * foreground[3] + background[index] * (1 - foreground[3])), 1]
      const luminance = rgb => rgb.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
      const icon = button.querySelector('svg'), chain = []
      for (let element = icon; element; element = element.parentElement) chain.unshift(element)
      const background = chain.reduce((color, element) => over(rgba(getComputedStyle(element).backgroundColor), color), [255, 255, 255, 1])
      const foreground = over(rgba(getComputedStyle(icon).color), background), a = luminance(foreground), b = luminance(background)
      return { text: '关闭设置图标', foreground, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), target: 3 }
    })
    check(sample.ratio >= 2.98, `${label}/${state}: close icon contrast`, sample)
    samples.push({ state, ...sample })
  }
  report.contrast.push({ label: `${label}/close-icon`, samples })
}

async function seedAccount() {
  await page.goto(origin)
  await button('仅在本机使用 / 旧版设备加入').click()
  await page.getByPlaceholder('例如：我的工作台').fill('设置产品化隔离验收')
  await page.getByPlaceholder('创建主密码', { exact: true }).fill(password)
  await page.getByPlaceholder('再次输入主密码', { exact: true }).fill(password)
  await button('下一步：保存恢复密钥').click()
  const recovery = await page.locator('textarea[readonly]').inputValue()
  await page.getByLabel('确认密钥最后 8 位').fill(recovery.slice(-8))
  await page.getByRole('checkbox', { name: '我已在应用之外保存完整密钥' }).check()
  await button('确认保存并启用').click()
  await page.locator('.hub-shell').waitFor()
  const quick = page.getByRole('form', { name: '快速添加今日任务' }).getByRole('textbox')
  await quick.fill(taskTitle)
  await quick.press('Enter')
  await page.locator('.today-task-row').filter({ hasText: taskTitle }).waitFor()
}

async function keyboardAndSearch() {
  await page.setViewportSize({ width: 1440, height: 960 })
  await button('设置').focus()
  await page.keyboard.press('Enter')
  await panel().waitFor()
  await settled()
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press(i < 15 ? 'Tab' : 'Shift+Tab')
    assert(await panel().evaluate(dialog => dialog.contains(document.activeElement)), 'Keyboard focus stays within settings')
  }
  await page.keyboard.press('Escape')
  await panel().waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent.trim()), '设置', 'Closing restores the settings trigger focus')
  await page.setViewportSize({ width: 375, height: 812 })
  await openSettings()
  const nav = panel().getByRole('navigation', { name: '设置分类', exact: true })
  assert(await nav.isVisible(), 'Mobile opens the category list')
  await section('外观')
  assert(!await nav.isVisible(), 'Mobile detail does not retain duplicate category navigation')
  await panel().getByRole('button', { name: '返回设置分类', exact: true }).click()
  assert(await nav.isVisible(), 'Mobile category back button restores the list')
  await section('隐私与锁定')
  await inspectSelectPopup('mobile/escape-stack', true)
  await openSettings()
  const search = panel().getByRole('searchbox', { name: '搜索设置', exact: true })
  await search.fill('不存在的设置 xyz')
  await settled()
  assert.equal(await visible(panel().locator('.settings-search-result')).count(), 0, 'An unmatched query does not show unrelated results')
  assert.match(await panel().innerText(), /未找到|没有找到|无匹配/, 'Empty search has explanatory text')
  await search.fill('背景 图片')
  await navButton('背景图片').click()
  await panel().getByRole('heading', { name: '背景图片', exact: true }).waitFor()
  assert(await panel().locator('.wallpaper-gallery').isVisible(), 'Multiple keyword search opens the exact wallpaper subsection')
  await inspectLayout('mobile/search-wallpapers')
  await capture('mobile-search-wallpapers')
  await panel().getByRole('button', { name: '返回设置分类', exact: true }).click()
  await search.fill('')
  await closeSettings()
  recordFlow('keyboard-mobile-search', ['Tab and Shift+Tab containment', 'Escape restores trigger focus', 'mobile list/detail/back', 'teleported select options', 'mobile Escape closes dropdown then detail then settings', 'empty search', 'multiple keywords', 'wallpaper deep link'])
}

async function mobileDisclosureFocus() {
  await page.setViewportSize({ width: 375, height: 812 })
  for (const [name, summaryName] of [['关于与帮助', '存储与加密详情'], ['同步与离线', '高级与诊断']]) {
    await section(name)
    const lastSummary = panel().locator('summary').filter({ hasText: new RegExp(`^${summaryName}$`) })
    const disclosure = lastSummary.locator('..')
    if (await disclosure.getAttribute('open') !== null) await lastSummary.click()
    await lastSummary.focus()
    await page.keyboard.press('Tab')
    const back = panel().getByRole('button', { name: '返回设置分类', exact: true })
    assert(await back.evaluate(element => document.activeElement === element), `${name}: Tab from the last collapsed summary wraps to the back control`)
    await page.keyboard.press('Shift+Tab')
    assert(await lastSummary.evaluate(element => document.activeElement === element), `${name}: Shift+Tab wraps back to the last summary`)
    await lastSummary.click()
    for (let index = 0; index < 10; index++) {
      await page.keyboard.press('Tab')
      const focused = await panel().evaluate(dialog => {
        const element = document.activeElement
        return { contained: dialog.contains(element), painted: element.checkVisibility({ opacityProperty: true, visibilityProperty: true }), tag: element.tagName, label: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 70) }
      })
      assert(focused.contained && focused.painted, `${name}: expanded content keeps keyboard focus inside painted settings controls: ${JSON.stringify(focused)}`)
    }
    await lastSummary.click()
    if (name === '同步与离线') {
      const manual = panel().locator('summary').filter({ hasText: /^手动设置连接$/ })
      await manual.click()
      await panel().getByLabel('访问令牌', { exact: true }).focus()
      for (let index = 0; index < 12; index++) {
        await page.keyboard.press('Tab')
        assert(await panel().evaluate(dialog => dialog.contains(document.activeElement) && document.activeElement.checkVisibility({ opacityProperty: true, visibilityProperty: true })), 'Expanded manual connection retains painted, trapped focus')
      }
      await manual.click()
      await lastSummary.focus()
      await page.keyboard.press('Tab')
      assert(await back.evaluate(element => document.activeElement === element), 'Collapsed manual inputs do not become the last focus target')
    }
  }
  await closeSettings()
  recordFlow('mobile-disclosure-focus', ['about summary wraps Tab and Shift+Tab', 'sync summary wraps Tab and Shift+Tab', 'expanded diagnostics remain focus trapped', 'expanded manual connection fields remain focus trapped', 'collapsed inputs are excluded'])
}

async function appearanceFlows() {
  await page.setViewportSize({ width: 1440, height: 960 })
  await chooseStyle('classic', 'light')
  await panel().getByRole('button', { name: '玫红', exact: true }).click()
  await appearance('背景图片')
  await panel().getByRole('button', { name: '使用壁纸：雾隐松湖', exact: true }).click()
  await settled()
  const before = await preferenceSnapshot()
  await appearance('界面风格')
  const swiss = panel().getByRole('group', { name: '界面风格', exact: true }).getByRole('button', { name: '瑞士编辑', exact: true })
  await swiss.focus()
  await page.keyboard.press('Space')
  await settled()
  let current = await preferenceSnapshot()
  assert.equal(current.theme.style, 'swiss')
  assert.equal(current.theme.mode, before.theme.mode)
  assert.equal(current.theme.accent, before.theme.accent)
  assert.deepEqual(current.wallpaper, before.wallpaper)
  const beforeRecommendation = current
  await panel().getByRole('button', { name: '应用推荐配色', exact: true }).click()
  await settled()
  current = await preferenceSnapshot()
  assert.notEqual(current.theme.accent, beforeRecommendation.theme.accent)
  assert.deepEqual(current.wallpaper, beforeRecommendation.wallpaper)
  await appearance()
  await appearance('界面风格')
  await panel().getByRole('button', { name: '撤销更改', exact: true }).click()
  await settled()
  assert.deepEqual(await preferenceSnapshot(), beforeRecommendation, 'Recommended palette can be undone after leaving its subsection')
  const group = panel().getByRole('group', { name: '筛选界面风格', exact: true })
  const expected = [['简约专注', 3], ['自然纸感', 3], ['科技工作台', 3], ['复古趣味', 2], ['编辑艺术', 3], ['全部', 14]]
  for (const [category, count] of expected) {
    await group.getByRole('button', { name: category, exact: true }).click()
    assert.equal(await panel().locator('.interface-style-option').count(), count, `${category} has its intended catalog members`)
  }
  await appearance()
  await panel().getByRole('button', { name: '跟随系统', exact: true }).click()
  for (const colorScheme of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme })
    await page.waitForFunction(mode => document.documentElement.dataset.theme === mode, colorScheme)
  }
  await appearance('背景图片')
  await panel().locator('.wallpaper-adjustments > summary').click()
  const transparent = panel().getByRole('checkbox', { name: /透明信息框/ })
  await transparent.check()
  const range = panel().getByRole('slider', { name: '信息框透明度', exact: true })
  await range.focus()
  await page.keyboard.press('Home')
  for (let step = 0; step < 7; step++) await page.keyboard.press('ArrowRight')
  await settled()
  current = await preferenceSnapshot()
  assert.equal(current.wallpaper.transparentPanels, true)
  assert.equal(current.wallpaper.panelTransparency, 35)
  await panel().getByRole('button', { name: '手机构图', exact: true }).click()
  assert(await panel().locator('.wallpaper-preview.is-portrait').isVisible())
  await panel().getByRole('button', { name: '放大壁纸预览', exact: true }).click()
  await button('关闭壁纸预览').waitFor()
  await page.keyboard.press('Escape')
  await button('关闭壁纸预览').waitFor({ state: 'hidden' })
  assert(await panel().isVisible(), 'Escape closes the nested preview while preserving settings')
  const beforeScene = await preferenceSnapshot()
  await appearance('推荐搭配')
  await panel().getByRole('button', { name: '应用深海指挥台', exact: true }).click()
  await settled()
  assert.notDeepEqual(await preferenceSnapshot(), beforeScene)
  await appearance()
  await appearance('推荐搭配')
  await panel().getByRole('button', { name: '撤销搭配', exact: true }).click()
  await settled()
  assert.deepEqual(await preferenceSnapshot(), beforeScene, 'Scene undo restores theme and wallpaper adjustments across subsections')
  await appearance('背景图片')
  await panel().getByRole('button', { name: /不使用图片/ }).click()
  await settled()
  assert.equal((await preferenceSnapshot()).wallpaper.builtin, null)
  await closeSettings()
  recordFlow('appearance-actions', ['keyboard style selection preserves color/mode/wallpaper', 'recommended palette and cross-subsection undo', 'five aesthetic filters', 'system appearance responds to media', 'wallpaper selection and transparency', 'portrait preview', 'nested Escape', 'scene apply and cross-subsection undo', 'remove background'])
}

async function draftsAndSafety() {
  await section('隐私与锁定')
  await panel().getByRole('button', { name: '修改密码', exact: true }).click()
  const currentPassword = panel().getByPlaceholder('输入当前密码', { exact: true })
  await currentPassword.fill('unsaved-current-password')
  await panel().getByPlaceholder('8–256 个字符', { exact: true }).fill('unsaved-next-password')
  await panel().getByPlaceholder('再次输入新密码', { exact: true }).fill('unsaved-next-password')
  await section('关于与帮助')
  await section('隐私与锁定')
  assert.equal(await currentPassword.inputValue(), 'unsaved-current-password', 'Section switching preserves unsaved password drafts')
  await closeSettings()
  await section('隐私与锁定')
  const change = panel().getByRole('button', { name: '修改密码', exact: true })
  if (await change.isVisible()) await change.click()
  assert.equal(await currentPassword.inputValue(), '', 'Closing settings clears sensitive drafts')
  assert.equal(await panel().getByPlaceholder('8–256 个字符', { exact: true }).inputValue(), '')
  assert(await panel().getByRole('button', { name: '保存密码', exact: true }).isDisabled(), 'An empty password form cannot submit')
  await section('账户与恢复')
  await panel().getByRole('button', { name: '管理恢复密钥', exact: true }).click()
  assert(await panel().getByRole('button', { name: '重新生成恢复密钥', exact: true }).isDisabled(), 'Recovery replacement requires verification')
  await closeSettings()
  await page.reload()
  await page.getByPlaceholder('主密码', { exact: true }).fill(password)
  await button('登录').click()
  await page.locator('.hub-shell').waitFor()
  await page.locator('.today-task-row').filter({ hasText: taskTitle }).waitFor()
  assert.equal(report.confirmations.length, 0, 'Browsing and draft entry cause no destructive confirmations')
  recordFlow('drafts-and-safety', ['draft preserved between sections', 'sensitive draft cleared when closed', 'disabled empty password submission', 'recovery replacement protected', 'original password still works', 'synthetic task survives reload'])
}

async function lazyFailure() {
  const asset = readdirSync(resolve(dist, 'assets')).find(name => /^AboutSection-.*\.js$/.test(name))
  assert(asset, 'About settings remains independently loadable')
  const failurePage = await context.newPage()
  failurePage.setDefaultTimeout(20000)
  failurePage.on('pageerror', error => report.expectedLoadErrors.push(error.message))
  let denied = 0, confirmationSeen = false
  await failurePage.route(`**/assets/${asset}`, route => { denied++; return route.abort('failed') })
  failurePage.on('dialog', async dialog => {
    confirmationSeen = true
    report.confirmations.push({ expected: true, type: dialog.type(), message: dialog.message() })
    assert.match(dialog.message(), /丢弃|未保存|重新解锁/)
    await dialog.dismiss()
  })
  try {
    await failurePage.goto(origin)
    await failurePage.getByPlaceholder('主密码', { exact: true }).fill(password)
    await button('登录', failurePage).click()
    await failurePage.locator('.hub-shell').waitFor()
    await openSettings(failurePage)
    const nav = panel(failurePage).getByRole('navigation', { name: '设置分类', exact: true })
    await navButton('关于与帮助', failurePage).click()
    await panel(failurePage).getByRole('alert').waitFor()
    assert.match(await panel(failurePage).getByRole('alert').innerText(), /无法加载/)
    await panel(failurePage).getByRole('button', { name: '重新加载应用', exact: true }).click()
    assert(confirmationSeen, 'Reload requires confirmation that drafts will be discarded')
    assert(await panel(failurePage).getByRole('alert').isVisible(), 'Canceling reload preserves the error and current session')
    await navButton('外观', failurePage).click()
    await panel(failurePage).getByRole('navigation', { name: '外观设置内容', exact: true }).waitFor()
    assert(denied > 0, 'The intended lazy chunk was actually denied')
    await capture('lazy-load-error-recovered-navigation', failurePage)
    recordFlow('lazy-load-failure', ['denied one local lazy chunk', 'visible actionable error', 'reload confirmation cancel', 'other sections remain usable'])
  } finally { await failurePage.close() }
}

async function inspectExpandedSettings(name, label) {
  const specification = name === '同步与离线'
    ? { disclosure: '手动设置连接', fields: ['服务地址', '访问令牌'], action: '连接同步服务' }
    : name === '备份与迁移'
      ? { disclosure: '迁移到其他设备', fields: ['本机密码'], action: '生成设备加入文件' }
      : null
  if (!specification) return
  console.log(`settings expanded check: ${label}`)
  const summary = panel().locator('summary').filter({ hasText: new RegExp(`^${specification.disclosure}$`) })
  assert.equal(await summary.count(), 1, `${label}: the advanced disclosure is available`)
  const disclosure = summary.locator('..')
  if (await disclosure.getAttribute('open') === null) await summary.click()
  await settled()
  for (const name of specification.fields) {
    const field = disclosure.getByLabel(name, { exact: true })
    assert.equal(await field.count(), 1, `${label}: ${name} has one associated label`)
    await field.scrollIntoViewIfNeeded()
    await field.focus()
    await settled()
    const accessible = await field.evaluate(element => ({
      painted: element.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }),
      focused: document.activeElement === element,
      labels: [...element.labels || []].map(label => label.textContent.trim()).filter(Boolean),
      type: element.type,
    }))
    check(accessible.painted && accessible.focused && accessible.labels.length > 0, `${label}: expanded ${name} is painted, labeled, and focusable`, accessible)
    await inspectLayout(`${label}/expanded/${name}`)
  }
  const action = disclosure.getByRole('button', { name: specification.action, exact: true })
  await action.scrollIntoViewIfNeeded()
  await settled()
  const actionBox = await action.boundingBox()
  check(Boolean(actionBox && actionBox.width >= 43 && actionBox.height >= 43), `${label}: advanced action keeps its 44px target`, actionBox)
  assert(await action.isDisabled(), `${label}: advanced action remains disabled without credentials`)
  await inspectLayout(`${label}/expanded/action`)
  await inspectContrast(`${label}/expanded`)
  if (/^(classic|terminal)\/light\/(1440|320)\//.test(label)) await capture(`${label.split('/').slice(0, 3).join('-')}-${name === '同步与离线' ? 'manual-sync' : 'device-migration'}`)
  await summary.click()
  await settled()
  check(await disclosure.getAttribute('open') === null, `${label}: advanced disclosure closes again`)
  if (name === '同步与离线') {
    console.log(`settings diagnostics check: ${label}`)
    const diagnostics = panel().locator('summary').filter({ hasText: /^高级与诊断$/ })
    await diagnostics.click()
    await scrollSection(true)
    await inspectLayout(`${label}/diagnostics`)
    await inspectContrast(`${label}/diagnostics`)
    await diagnostics.click()
  }
}

async function runMatrix() {
  const screenshotStyles = new Set(['classic', 'terminal', 'brutalist', 'botanical', 'retro', 'gallery'])
  for (const style of styles) {
    for (const mode of ['light', 'dark']) {
      await page.setViewportSize({ width: 1440, height: 960 })
      await chooseStyle(style, mode)
      await inspectCloseIconContrast(`${style}/${mode}`)
      const fingerprint = await panel().evaluate(dialog => ['.settings-layout', '.settings-sidebar', '.settings-content', '.appearance-setting-group', '.appearance-mode'].map(selector => {
        const element = dialog.querySelector(selector)
        if (!element) return [selector, null]
        const style = getComputedStyle(element)
        return [selector, ...['borderRadius', 'borderTopWidth', 'borderLeftWidth', 'borderTopStyle', 'boxShadow', 'fontFamily', 'padding', 'backgroundImage'].map(key => style[key])]
      }))
      report.appearances.push({ style, mode, fingerprint })
      for (const width of widths) {
        await closeSettings()
        await page.setViewportSize({ width, height: width < 800 ? 812 : 960 })
        await openSettings()
        if (width < 800) await inspectLayout(`${style}/${mode}/${width}/categories`)
        for (const name of sections) {
          await section(name)
          if (name === '外观') await appearance()
          await scrollSection(false)
          const label = `${style}/${mode}/${width}/${name}`
          await inspectLayout(`${label}/top`)
          if (width === widths[0]) await inspectContrast(label)
          if (name === '外观' && screenshotStyles.has(style) && (width === 1440 || width === 375)) await capture(`${style}-${mode}-${width}-display`)
          await scrollSection(true)
          await inspectLayout(`${label}/bottom`)
          await inspectExpandedSettings(name, label)
          if (name === '隐私与锁定') await inspectSelectPopup(label)
        }
        await appearance('界面风格')
        await scrollSection(false)
        await inspectLayout(`${style}/${mode}/${width}/style-catalog`)
        if (width === widths[0]) await inspectContrast(`${style}/${mode}/style-catalog`)
        if (screenshotStyles.has(style) && width === 375 && mode === 'light') await capture(`${style}-mobile-style-catalog`)
      }
      await closeSettings()
    }
    console.log(`settings matrix checked: ${style}`)
  }
}

try {
  await seedAccount()
  if (!matrixOnly) {
    await keyboardAndSearch()
    await mobileDisclosureFocus()
    await appearanceFlows()
    await draftsAndSafety()
    await lazyFailure()
  }
  if (!flowsOnly) await runMatrix()
  check(report.errors.length === 0, 'No unexpected page errors', report.errors)
  check(report.blockedExternal.every(request => request.method === 'GET' || request.method === 'HEAD'), 'No external mutation was attempted', report.blockedExternal)
  report.passed = report.failures.length === 0
  assert.equal(report.passed, true, `${report.failures.length} settings issues`)
} catch (error) {
  report.failures.push({ message: String(error) })
  await capture('failure').catch(() => {})
  process.exitCode = 1
} finally {
  report.finishedAt = new Date().toISOString()
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ passed: report.passed, flows: report.flows.length, layouts: report.layouts.length, contrastGroups: report.contrast.length, failures: report.failures.length, output }))
  await browser.close()
  await new Promise(done => server.close(done))
}
