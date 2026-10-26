import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve, extname, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output = resolve(process.env.QA_OUTPUT || '.visual-qa/interface-personalities')
const root = resolve(process.env.QA_DIST || 'dist')
const originalStyles = ['classic', 'sunrise', 'aurora', 'precision']
const addedStyles = ['swiss', 'terminal', 'brutalist', 'retro', 'botanical', 'orbital', 'atelier', 'blueprint', 'gallery', 'arcade']
const styles = [...originalStyles, ...addedStyles]
const selectedStyles = process.env.QA_STYLE_FILTER ? styles.filter(style => process.env.QA_STYLE_FILTER.split(',').includes(style)) : styles
const captureOnly = process.env.QA_CAPTURE_ONLY === '1'
const finalPass = process.env.QA_FINAL_PASS === '1'
const formsOnly = process.env.QA_FORMS_ONLY === '1'
const modes = [['light', '浅色'], ['dark', '深色']]
const routes = [
  { path: '/', name: 'today', ready: '.today-workspace' },
  { path: '/today', name: 'plan', ready: '.planning-workspace' },
  { path: '/calendar', name: 'calendar', ready: '.calendar-workspace' },
  { path: '/docs', name: 'docs', ready: '.docs-workspace' },
  { path: '/vault', name: 'vault', ready: '.page-header:has-text("密码库")' },
]
const password = 'QA-Interface-Gallery-Only-2026'
const taskName = '核对界面设计与交付清单'
const report = { passed: false, scope: 'production web build; isolated synthetic local account; structural diversity plus functional regressions', captureOnly, finalPass, formsOnly, selectedStyles, styles: [], recommendations: [], personalities: [], journeys: [], checks: [], contrast: [], controlContrast: [], baselineWarnings: [], failures: [], pageErrors: [], resourceFailures: [], reloads: [], blockedExternalRequests: [], screenshots: [] }
mkdirSync(output, { recursive: true })
let server
let browser
let page

async function serveBuild() {
  assert.ok(statSync(resolve(root, 'index.html')).isFile(), 'Run npm run build before this script')
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' }
  server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
      if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw new Error('not found')
      response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream')
      response.setHeader('Cache-Control', 'no-store')
      createReadStream(file).pipe(response)
    } catch { response.writeHead(404); response.end() }
  })
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept) })
  return `http://127.0.0.1:${server.address().port}`
}

const button = name => page.getByRole('button', { name, exact: true }).filter({ visible: true })
const desktopNavigation = () => page.locator('.desktop-sidebar:visible, .style-desktop-navigation:visible')
const styleButton = key => page.locator('.interface-style-option').filter({ has: page.locator(`[data-preview="${key}"]`) })
const preferences = () => page.evaluate(() => ({ theme: JSON.parse(localStorage.getItem('xk.theme.v1') || '{}'), wallpaper: JSON.parse(localStorage.getItem('xk.wallpaper.v1') || 'null') }))
const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const check = (condition, message, details) => {
  if (!condition) report.failures.push({ message, details })
}

async function screenshot(name) {
  const settings = name.includes('settings')
  if (settings) {
    await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))))
    await settled()
    await inspectSettings(`${name}/before-capture`)
  }
  else {
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      window.scrollTo(0, 0)
      const main = document.querySelector('#main-content')
      if (main) main.scrollTop = 0
    })
    await settled()
  }
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: false, animations: 'disabled' })
  if (settings) await inspectSettings(`${name}/after-capture`)
  report.screenshots.push(`${name}.png`)
}

async function inspectSettings(label) {
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector('.settings-panel')
    const rect = panel.getBoundingClientRect()
    const close = panel.querySelector('[aria-label="关闭设置"]').getBoundingClientRect()
    const header = panel.querySelector('.modal-region-header').getBoundingClientRect()
    return { scrollTop: panel.scrollTop, panelTop: rect.top, panelBottom: rect.bottom, headerTop: header.top, closeTop: close.top, closeBottom: close.bottom, viewport: innerHeight }
  })
  const passed = geometry.scrollTop === 0 && geometry.headerTop >= geometry.panelTop - 1 && geometry.closeTop >= Math.max(0, geometry.panelTop) && geometry.closeBottom <= Math.min(geometry.viewport, geometry.panelBottom)
  check(passed, `settings header and close remain visible: ${label}`, geometry)
  report.checks.push({ type: 'settings-geometry', label, passed, ...geometry })
}

async function openSettings() {
  if (page.viewportSize().width < 768) {
    await button('打开更多导航').click()
    await page.getByRole('dialog').getByRole('button', { name: '设置', exact: true }).click()
    await page.locator('.mobile-more-groups').waitFor({ state: 'hidden' })
  } else await button('设置').click()
  await page.locator('.settings-panel').waitFor()
  await button('界面风格').click()
  await page.getByRole('group', { name: '界面风格', exact: true }).waitFor()
  await page.waitForFunction(() => !document.querySelector('.modal-enter-active, .modal-leave-active'))
}

async function closeSettings() {
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
}

async function go(route) {
  await page.evaluate(path => { location.hash = `#${path}` }, route.path)
  await page.waitForFunction(path => location.hash === `#${path}`, route.path)
  await page.locator(route.ready).first().waitFor()
  await page.evaluate(() => window.scrollTo(0, 0))
  await settled()
}

async function inspectNavigation(label) {
  const result = await page.evaluate(() => {
    const rect = element => {
      const bounds = element.getBoundingClientRect()
      return Object.fromEntries(['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left'].map(key => [key, Math.round(bounds[key] * 10) / 10]))
    }
    const nav = [...document.querySelectorAll(innerWidth < 768 ? '.hub-mobile-nav' : '.desktop-sidebar, .style-desktop-navigation')].find(element => getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0)
    const main = document.querySelector('#main-content')
    const workspace = main.querySelector('.today-workspace, .planning-workspace, .calendar-workspace, .docs-workspace, .page-header')
    const navBox = rect(nav)
    const sampleSelectors = '.page-header button, .page-header a, .style-dashboard-header button, .style-dashboard-header a, .today-task-content, .today-task-start, .today-agenda-link, .today-quick-add input, .calendar-workspace button, .docs-workspace button'
    const obscured = [...main.querySelectorAll(sampleSelectors)].filter(element => {
      const box = element.getBoundingClientRect()
      if (!box.width || !box.height || box.top < 0 || box.bottom > innerHeight) return false
      const x = box.left + box.width / 2
      const y = box.top + box.height / 2
      for (let ancestor = element.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
        const css = getComputedStyle(ancestor)
        const clip = ancestor.getBoundingClientRect()
        if ((css.overflowX !== 'visible' && (x < clip.left || x > clip.right)) || (css.overflowY !== 'visible' && (y < clip.top || y > clip.bottom))) return false
      }
      const target = document.elementFromPoint(x, y)
      return target && nav.contains(target)
    }).map(element => ({ text: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 60), bounds: rect(element) }))
    const layout = nav.dataset.navigationLayout || nav.dataset.layout || document.querySelector('.hub-shell')?.dataset.navigationLayout || ''
    let physicalPosition = 'left'
    if (navBox.width > navBox.height * 2) physicalPosition = navBox.top > innerHeight / 2 ? 'bottom' : 'top'
    else if (navBox.left > innerWidth / 2) physicalPosition = 'right'
    const visible = getComputedStyle(nav).display !== 'none' && navBox.width > 0 && navBox.height > 0
    const style = document.documentElement.dataset.interface
    const expectedPosition = innerWidth < 768 ? 'bottom' : innerWidth < 1100 ? 'left' : ({ swiss: 'top', gallery: 'top', sunrise: 'top', retro: 'bottom', orbital: 'bottom', botanical: 'right', atelier: 'right' }[style] || 'left')
    const workspaceBox = workspace ? rect(workspace) : null
    const contentSeparated = !workspaceBox || physicalPosition === 'bottom' || (physicalPosition === 'left' ? workspaceBox.left >= navBox.right - 1 : physicalPosition === 'right' ? workspaceBox.right <= navBox.left + 1 : scrollY > 1 || workspaceBox.top >= navBox.bottom - 1)
    return { style, width: innerWidth, height: innerHeight, layout, physicalPosition, expectedPosition, nav: navBox, main: rect(main), workspace: workspaceBox, contentSeparated, visible, obscured, collapsed: nav.classList.contains('is-collapsed') }
  })
  const inViewport = result.nav.left >= -1 && result.nav.right <= result.width + 1 && result.nav.top >= -1 && result.nav.bottom <= result.height + 1
  const isScrollableUnderVerticalNavigation = ['bottom', 'top'].includes(result.physicalPosition) && !label.includes('scrolled-bottom')
  const passed = result.visible && inViewport && result.contentSeparated && (isScrollableUnderVerticalNavigation || result.obscured.length === 0) && result.physicalPosition === result.expectedPosition
  check(passed, `navigation visible and does not cover main controls: ${label}`, result)
  report.checks.push({ type: 'navigation-geometry', label, passed, ...result })
}

async function inspectPersonality(key) {
  const result = await page.evaluate(() => {
    const measure = selector => {
      const element = [...document.querySelectorAll(selector)].find(element => getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const css = getComputedStyle(element)
      const properties = ['display', 'gridTemplateColumns', 'gridTemplateAreas', 'flexDirection', 'gap', 'padding', 'borderRadius', 'borderWidth', 'borderStyle', 'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'boxShadow', 'clipPath', 'transform']
      return { selector, tag: element.tagName, bounds: Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Math.round(rect[key] * 10) / 10])), css: Object.fromEntries(properties.map(key => [key, key === 'boxShadow' ? css[key].replace(/(?:rgba?|color|oklch)\([^)]*\)/g, 'COLOR') : css[key]])), before: getComputedStyle(element, '::before').content, after: getComputedStyle(element, '::after').content }
    }
    const selectors = ['.desktop-sidebar, .style-desktop-navigation', '.page-header', '.style-dashboard-header', '.style-dashboard-header h1', '.dashboard-hero-actions', '.today-columns', '.today-task-panel', '.today-agenda', '.today-task-list', '.today-task-row', '.today-task-check > span', '.today-task-start', '.dashboard-create', '.today-quick-add', '.today-workspace form']
    return { style: document.documentElement.dataset.interface, mode: document.documentElement.dataset.theme, width: innerWidth, elements: selectors.map(measure).filter(Boolean), visibleText: document.querySelector('.today-workspace').innerText.slice(0, 1400) }
  })
  report.personalities.push(result)
  await screenshot(`${key}-recommended`)
  await button('新建任务').click()
  await page.getByPlaceholder('要做什么？').waitFor()
  await page.waitForFunction(() => !document.querySelector('.modal-enter-active, .modal-leave-active'))
  result.controls = await page.getByRole('dialog').evaluate(dialog => {
    const selectors = ['.ui-primary-button', '.ui-secondary-button', 'input[placeholder="要做什么？"]', '.ui-icon-button']
    return selectors.map(selector => {
      const element = dialog.querySelector(selector)
      const css = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return { selector, width: Math.round(rect.width), height: Math.round(rect.height), borderRadius: css.borderRadius, borderWidth: css.borderWidth, borderStyle: css.borderStyle, fontFamily: css.fontFamily, fontWeight: css.fontWeight, letterSpacing: css.letterSpacing, textTransform: css.textTransform, boxShadow: css.boxShadow.replace(/(?:rgba?|color|oklch)\([^)]*\)/g, 'COLOR'), clipPath: css.clipPath, before: getComputedStyle(element, '::before').content, after: getComputedStyle(element, '::after').content }
    })
  })
  await page.screenshot({ path: resolve(output, `${key}-controls.png`), animations: 'disabled' })
  report.screenshots.push(`${key}-controls.png`)
  await button('取消').click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  const skeleton = result.elements.map(element => ({ selector: element.selector, tag: element.tag, bounds: element.bounds, css: element.css, before: element.before, after: element.after }))
  result.silhouetteFingerprint = JSON.stringify({ skeleton, controls: result.controls })
}

async function navigationJourney(key) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await go(routes[0])
  await openSettings()
  await selectStyle(key)
  await closeSettings()
  await inspectNavigation(`${key}/expanded`)
  const collapse = button('收起主导航')
  if (await collapse.isVisible()) {
    await collapse.click()
    await settled()
    await inspectNavigation(`${key}/collapsed`)
    await openSettings()
    await closeSettings()
    await button('展开主导航').click()
    await settled()
    await inspectNavigation(`${key}/restored`)
  }
  const desktop = desktopNavigation()
  await desktop.getByRole('link', { name: '日历', exact: true }).click()
  await page.locator('.calendar-workspace').waitFor()
  await desktop.getByRole('link', { name: '今天', exact: true }).click()
  await page.locator('.today-workspace').waitFor()
  const more = desktop.getByRole('button', { name: '打开更多导航', exact: true })
  if (await more.isVisible()) {
    await more.click()
    await page.getByRole('dialog').getByRole('link', { name: '密码库', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await page.locator('.page-header').filter({ hasText: '密码库' }).waitFor()
    await desktop.getByRole('link', { name: '今天', exact: true }).click()
    await page.locator('.today-workspace').waitFor()
  }
  await button('收起今日时间安排').click()
  await page.locator('#today-agenda-body').waitFor({ state: 'hidden' })
  await button('展开今日时间安排').click()
  await page.locator('#today-agenda-body').waitFor({ state: 'visible' })
  report.checks.push({ type: 'navigation-journey', style: key, passed: true, checks: ['open settings', 'close settings', 'collapse when available', 'settings while collapsed', 'restore', 'calendar via navigation', 'return via navigation'] })
}

async function taskJourney(key) {
  await go(routes[0])
  await openSettings()
  await selectStyle(key)
  await closeSettings()
  const name = `${key} 风格交互验收`
  const edited = `${name} · 已编辑`
  await button('新建任务').click()
  await page.getByPlaceholder('要做什么？').fill(name)
  await button('添加任务').click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  let row = page.locator('.today-task-row').filter({ hasText: name })
  await row.locator('.today-task-content').click()
  await page.getByPlaceholder('要做什么？').fill(edited)
  await button('保存修改').click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  row = page.locator('.today-task-row').filter({ hasText: edited })
  await row.getByRole('link', { name: `开始：${edited}`, exact: true }).click()
  await page.locator('.attention-title').filter({ hasText: edited }).waitFor()
  await page.getByRole('link', { name: '返回工作区', exact: true }).click()
  await page.locator('.today-workspace').waitFor()
  await page.getByRole('link', { name: '到日历安排时间', exact: true }).click()
  await page.locator('.calendar-workspace').waitFor()
  await desktopNavigation().getByRole('link', { name: '今天', exact: true }).click()
  await page.locator('.today-workspace').waitFor()
  await button(`完成：${edited}`).click()
  await button('确认完成').click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.locator('.today-completed summary').click()
  await button(`取消完成：${edited}`).waitFor()
  const quick = page.getByRole('form', { name: '快速添加今日任务' })
  await quick.getByRole('textbox').fill(`${key} 快速添加保留任务`)
  await quick.getByRole('textbox').press('Enter')
  await page.locator('.today-task-row').filter({ hasText: `${key} 快速添加保留任务` }).waitFor()
  report.journeys.push({ style: key, task: edited, retained: `${key} 快速添加保留任务`, passed: true, checks: ['new task modal', 'save new task', 'edit task', 'focus selected task', 'return to today', 'calendar schedule link', 'return via navigation', 'complete task', 'completed list', 'quick add'] })
  await screenshot(`${key}-journey`)
}

async function noOverflow(label) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
  check(dimensions.scroll <= dimensions.width + 1, `horizontal overflow: ${label}`, dimensions)
  report.checks.push({ type: 'responsive', label, ...dimensions })
}

async function inspectStartIcons(label) {
  const icons = await page.locator('.today-task-start svg').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }))
  const passed = icons.length > 0 && icons.every(icon => icon.width >= 14 && icon.height >= 14)
  check(passed, `task start icons visible: ${label}`, icons)
  report.checks.push({ type: 'start-icons', label, passed, icons })
}

async function inspectCalendar(label) {
  await page.waitForFunction(() => !document.querySelector('.route-enter-active, .route-leave-active'))
  await settled()
  const geometry = await page.evaluate(() => {
    const rect = element => {
      const bounds = element.getBoundingClientRect()
      return Object.fromEntries(['left', 'right', 'top', 'bottom', 'width', 'height'].map(key => [key, bounds[key]]))
    }
    const calendar = rect(document.querySelector('.calendar-workspace'))
    const nav = [...document.querySelectorAll('.desktop-sidebar, .style-desktop-navigation')].find(element => getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0)
    const navBox = rect(nav)
    const position = nav.dataset.navigationLayout
    const separated = position === 'top' ? calendar.top >= navBox.bottom - 1 : calendar.bottom <= navBox.top + 1
    return { calendar, navigation: navBox, position, separated, width: innerWidth, height: innerHeight, pageHeight: document.documentElement.scrollHeight, wallpaper: Boolean(document.querySelector('.wallpaper-layer')) }
  })
  const passed = geometry.separated && geometry.calendar.top >= 0 && geometry.calendar.bottom <= geometry.height + 1 && geometry.pageHeight <= geometry.height + 1
  check(passed, `calendar fits viewport around navigation: ${label}`, geometry)
  report.checks.push({ type: 'calendar-viewport', label, passed, ...geometry })
}

async function inspectPreview(key) {
  const geometry = await page.locator(`[data-preview="${key}"]`).evaluate(preview => {
    const bounds = element => {
      const rect = element.getBoundingClientRect()
      return Object.fromEntries(['left', 'right', 'top', 'bottom', 'width', 'height'].map(key => [key, rect[key]]))
    }
    return { display: getComputedStyle(preview).display, layout: preview.dataset.navigation, preview: bounds(preview), nav: bounds(preview.querySelector('.style-preview-nav')), main: bounds(preview.querySelector('.style-preview-main')) }
  })
  const position = geometry.layout
  const separated = position === 'top' ? geometry.nav.bottom <= geometry.main.top + 1 : ['bottom', 'dock'].includes(position) ? geometry.nav.top >= geometry.main.bottom - 1 : position === 'right' ? geometry.nav.left >= geometry.main.right - 1 : geometry.nav.right <= geometry.main.left + 1
  const passed = geometry.display === 'grid' && separated
  check(passed, `preview reflects navigation placement: ${key}`, geometry)
  report.checks.push({ type: 'preview-layout', style: key, passed, ...geometry })
}

async function inspectTaskForm(style, mode, width, closeHover = false) {
  await button('新建任务').click()
  await page.getByPlaceholder('要做什么？').waitFor()
  await page.waitForFunction(() => !document.querySelector('.modal-enter-active, .modal-leave-active'))
  const finishTransitions = () => page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))))
  if (closeHover) { await page.mouse.move(0, 0); await finishTransitions() }
  const measure = () => page.getByRole('dialog').evaluate(dialog => {
    const box = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const rgba = color => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data] }
    const controls = [...dialog.querySelectorAll('.ui-primary-button, .ui-secondary-button, input[placeholder="要做什么？"], [aria-label="关闭"]')].map(element => {
      const layers = []
      for (let current = element; current; current = current.parentElement) layers.unshift(rgba(getComputedStyle(current).backgroundColor))
      const background = layers.reduce((under, over) => over.slice(0, 3).map((value, index) => value * over[3] / 255 + under[index] * (1 - over[3] / 255)), [255, 255, 255])
      const icon = element.getAttribute('aria-label') === '关闭'
      const ink = getComputedStyle(icon ? element.querySelector('svg') || element : element)
      const color = icon && ink.stroke !== 'none' && ink.stroke !== 'currentcolor' ? ink.stroke : ink.color
      return { bounds: box(element), text: rgba(color), background, type: element.tagName, icon }
    })
    return { bounds: box(dialog), close: box(dialog.querySelector('[aria-label="关闭"]')), controls, viewport: { width: innerWidth, height: innerHeight } }
  })
  const result = await measure()
  const ratio = control => { const v = [luminance(control.text), luminance(control.background)].sort((a, b) => b - a); return (v[0] + 0.05) / (v[1] + 0.05) }
  const passed = result.bounds.left >= 0 && result.bounds.right <= width + 1 && result.close.top >= 0 && result.close.bottom <= result.viewport.height && result.controls.every(control => control.bounds.height >= 44 && ratio(control) >= (control.icon ? 3 : 4.5))
  check(passed, `task form visible and readable: ${style}/${mode}/${width}`, result)
  report.checks.push({ type: 'task-form', style, mode, width, passed, ...result })
  if (closeHover) {
    const checkClose = (state, measurements) => {
      const control = measurements.controls.find(control => control.icon)
      const contrast = ratio(control)
      const passed = contrast >= 3
      const details = { style, mode, width, state, ratio: Math.round(contrast * 1000) / 1000, passed, ...control }
      check(passed, `task form close icon contrast below 3: ${style}/${mode}/${width}/${state}`, details)
      report.checks.push({ ...details, elementType: control.type, type: 'task-form-close-contrast' })
    }
    checkClose('normal', result)
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).hover()
    await finishTransitions()
    checkClose('hover', await measure())
    await page.mouse.move(0, 0)
    await finishTransitions()
    checkClose('after-hover', await measure())
  }
  await screenshot(`${style}-${mode}-form-${width}`)
  await button('取消').click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
}

async function taskFormSupplement() {
  for (const key of selectedStyles) {
    for (const [mode, label] of modes) {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await go(routes[0])
      await openSettings()
      await selectStyle(key)
      await button(label).click()
      await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, mode)
      await closeSettings()
      for (const width of [1440, 375]) {
        await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 })
        await inspectTaskForm(key, mode, width, true)
      }
      writeFileSync(resolve(output, 'results.json'), JSON.stringify(report, null, 2))
      console.log(`FORMS ${key}/${mode}: desktop/mobile geometry, text contrast, close icon normal/hover/after-hover`)
    }
  }
}

async function finalSupplement() {
  for (const key of selectedStyles) {
    for (const [mode, label] of modes) {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await go(routes[0])
      await openSettings()
      await selectStyle(key)
      await button(label).click()
      await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, mode)
      await contrast(key, mode)
      await styleButton(key).scrollIntoViewIfNeeded()
      await inspectPreview(key)
      await screenshot(`${key}-${mode}-settings`)
      await closeSettings()
      await inspectNavigation(`${key}/${mode}/final/1440`)
      await inspectStartIcons(`${key}/${mode}/1440`)
      await screenshot(`${key}-${mode}-desktop`)
      await inspectTaskForm(key, mode, 1440)
      await page.setViewportSize({ width: 375, height: 812 })
      await go(routes[0])
      await inspectStartIcons(`${key}/${mode}/375`)
      await noOverflow(`${key}/${mode}/final/375`)
      await screenshot(`${key}-${mode}-mobile`)
      await inspectTaskForm(key, mode, 375)
      console.log(`FINAL ${key}/${mode}: contrast, preview, viewport desktop/mobile, start icons`)
    }
  }
  for (const wallpaper of [false, true]) {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await openSettings()
    await button('背景设置').click()
    if (wallpaper) await button('使用壁纸：深海流光').click()
    else await page.getByRole('group', { name: '壁纸资源', exact: true }).getByRole('button', { name: /纯色空间/ }).click()
    await closeSettings()
    for (const key of ['sunrise', 'swiss', 'gallery', 'retro', 'orbital']) {
      for (const [mode, label] of modes) {
        await openSettings()
        await selectStyle(key)
        await button(label).click()
        await closeSettings()
        for (const width of [1440, 1920]) {
          await page.setViewportSize({ width, height: 1000 })
          await go(routes.find(route => route.name === 'calendar'))
          await inspectCalendar(`${key}/${mode}/${width}/wallpaper=${wallpaper}`)
          if (mode === 'light' && width === 1440) await screenshot(`${key}-calendar-wallpaper-${wallpaper}`)
        }
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await go(routes[0])
  await openSettings()
  await button('背景设置').click()
  await page.getByRole('group', { name: '壁纸资源', exact: true }).getByRole('button', { name: /纯色空间/ }).click()
  await closeSettings()
}

async function unlock() {
  await page.getByPlaceholder('主密码', { exact: true }).fill(password)
  await button('登录').click()
  await page.locator('.hub-shell').waitFor()
}

async function selectStyle(key, keyboard = false) {
  const option = styleButton(key)
  await option.scrollIntoViewIfNeeded()
  if (keyboard) { await option.focus(); await page.keyboard.press(keyboard) }
  else await option.click()
  await page.waitForFunction(style => document.documentElement.dataset.interface === style, key)
  assert.equal(await option.getAttribute('aria-pressed'), 'true', `${key}: selected button state`)
}

function luminance(rgb) {
  return rgb.slice(0, 3).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
}

async function contrast(style, mode) {
  await settled()
  await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {}))))
  const colors = await page.evaluate(() => {
    const element = document.createElement('span')
    document.body.append(element)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const result = {}
    for (const name of ['t1', 't2', 't3', 't4', 'body', 'surface', 'surface-2', 'chrome', 'inset', 'elevated']) {
      element.style.color = `var(--tk-${name})`
      const css = getComputedStyle(element).color
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = css
      context.fillRect(0, 0, 1, 1)
      result[name] = { css, rgba: Array.from(context.getImageData(0, 0, 1, 1).data) }
    }
    element.remove()
    return result
  })
  for (const text of ['t1', 't2', 't3', 't4']) {
    for (const background of ['body', 'surface', 'surface-2', 'chrome', 'inset', 'elevated']) {
      const values = [luminance(colors[text].rgba), luminance(colors[background].rgba)].sort((a, b) => b - a)
      const ratio = (values[0] + 0.05) / (values[1] + 0.05)
      const result = { style, mode, text, background, ratio: Math.round(ratio * 1000) / 1000, passed: ratio >= 4.5 }
      report.contrast.push(result)
      if (!result.passed) {
        if (originalStyles.includes(style)) report.baselineWarnings.push(result)
        else report.failures.push({ message: `contrast below 4.5: ${style}/${mode}/${text} on ${background}`, details: result })
      }
    }
  }
  const controls = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const rgba = value => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data]
    }
    return ['.today-task-start', '.dashboard-create'].flatMap(selector => {
      const element = document.querySelector(selector)
      if (!element) return []
      const backgroundImages = []
      const layers = []
      for (let current = element; current; current = current.parentElement) {
        const css = getComputedStyle(current)
        layers.unshift(rgba(css.backgroundColor))
        if (css.backgroundImage !== 'none') backgroundImages.push(css.backgroundImage)
      }
      const background = layers.reduce((under, over) => over.slice(0, 3).map((value, index) => value * over[3] / 255 + under[index] * (1 - over[3] / 255)), [255, 255, 255])
      const textElement = element.querySelector('span') || element
      return [{ selector, text: rgba(getComputedStyle(textElement).color), background, backgroundImages }]
    })
  })
  for (const control of controls) {
    const values = [luminance(control.text), luminance(control.background)].sort((a, b) => b - a)
    const ratio = (values[0] + 0.05) / (values[1] + 0.05)
    const result = { style, mode, ...control, ratio: Math.round(ratio * 1000) / 1000, passed: ratio >= 4.5 }
    report.controlContrast.push(result)
    check(result.passed, `rendered task control contrast below 4.5: ${style}/${mode}/${control.selector}`, result)
  }
}

async function seed() {
  await button('仅在本机使用 / 旧版设备加入').click()
  await page.getByPlaceholder('例如：我的工作台').fill('界面风格验收账户')
  await page.getByPlaceholder('创建主密码', { exact: true }).fill(password)
  await page.getByPlaceholder('再次输入主密码', { exact: true }).fill(password)
  await button('下一步：保存恢复密钥').click()
  const recovery = await page.locator('textarea[readonly]').inputValue()
  await page.getByLabel('确认密钥最后 8 位').fill(recovery.slice(-8))
  await page.getByRole('checkbox', { name: '我已在应用之外保存完整密钥' }).check()
  await button('确认保存并启用').click()
  await page.locator('.hub-shell').waitFor()
  const quick = page.getByRole('form', { name: '快速添加今日任务' })
  for (const name of [taskName, '整理本周项目资料', '阅读交互设计笔记']) {
    await quick.getByRole('textbox').fill(name)
    await quick.getByRole('textbox').press('Enter')
    await quick.getByText('已添加到今天', { exact: true }).waitFor()
    await page.locator('.today-task-row').filter({ hasText: name }).waitFor()
  }
  await button('新建任务').click()
  await page.getByPlaceholder('要做什么？').fill('界面评审与计划安排')
  await page.getByRole('dialog').locator('input[type=number]').fill('45')
  await page.getByRole('dialog').locator('input[type=time]').fill('10:30')
  await button('添加任务').click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await go(routes.find(route => route.name === 'vault'))
  await button('添加账号').first().click()
  await page.getByPlaceholder('如：GitHub').fill('界面演示账号')
  await page.getByPlaceholder('账号 / 邮箱 / 手机号').fill('interface-qa@example.test')
  await page.getByPlaceholder('输入或生成密码').fill('Synthetic-Only-2026')
  await button('添加').click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await go(routes.find(route => route.name === 'docs'))
  await page.locator('input[type=file]').setInputFiles({ name: '界面风格验收说明.txt', mimeType: 'text/plain', buffer: Buffer.from('此资料仅用于隔离浏览器内的合成界面验证。') })
  await button('界面风格验收说明.txt').waitFor()
  await go(routes[0])
}

try {
  const url = process.env.QA_URL || await serveBuild()
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'QA_URL must be a loopback address')
  browser = await chromium.launch({ channel: process.env.PHUB_BROWSER_CHANNEL || 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai', locale: 'zh-CN', permissions: ['notifications'] })
  await context.route('**/*', route => {
    const requested = route.request().url()
    if (/^https?:/.test(requested) && new URL(requested).origin !== new URL(url).origin) {
      report.blockedExternalRequests.push(new URL(requested).origin)
      return route.abort()
    }
    return route.continue()
  })
  page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', error => report.pageErrors.push(error.message))
  page.on('response', response => { if (response.status() >= 400) report.resourceFailures.push({ url: response.url(), status: response.status() }) })
  page.on('requestfailed', request => { if (new URL(request.url()).origin === new URL(url).origin) report.resourceFailures.push({ url: request.url(), failure: request.failure()?.errorText }) })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await seed()
  await openSettings()
  assert.equal(await page.locator('.interface-style-option').count(), styles.length, 'four original plus ten new style choices')
  report.styles = await page.locator('.interface-style-option').evaluateAll(options => options.map(option => ({ key: option.querySelector('[data-preview]')?.getAttribute('data-preview'), label: option.getAttribute('aria-label') })))
  assert.deepEqual(report.styles.map(style => style.key).sort(), [...styles].sort())
  await closeSettings()

  if (formsOnly) await taskFormSupplement()
  else {
  if (finalPass) await finalSupplement()
  for (const key of captureOnly ? [] : selectedStyles) {
    for (const [mode, label] of modes) {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await go(routes[0])
      await openSettings()
      await selectStyle(key)
      await button(label).click()
      await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, mode)
      await contrast(key, mode)
      await styleButton(key).scrollIntoViewIfNeeded()
      await screenshot(`${key}-${mode}-settings`)
      await closeSettings()
      for (const width of [1920, 1440, 1024, 768, 375]) {
        await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 })
        for (const route of routes) {
          await go(route)
          await noOverflow(`${key}/${mode}/${route.name}/${width}`)
          await inspectNavigation(`${key}/${mode}/${route.name}/${width}`)
          if ([1440, 375].includes(width) && route.name === 'today') await screenshot(`${key}-${mode}-${width === 1440 ? 'desktop' : 'mobile'}`)
          if ([1440, 375].includes(width) && ['swiss', 'orbital', 'gallery'].includes(key) && ['calendar', 'docs', 'vault'].includes(route.name)) await screenshot(`${key}-${mode}-${route.name}-${width}`)
          if (route.name === 'today' && await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1)) {
            await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
            await settled()
            await inspectNavigation(`${key}/${mode}/${route.name}/${width}/scrolled-bottom`)
          }
        }
      }
      await go(routes[0])
      await openSettings()
      await styleButton(key).scrollIntoViewIfNeeded()
      await noOverflow(`${key}/${mode}/settings/375`)
      if (mode === 'light') await screenshot(`${key}-${mode}-settings-mobile`)
      const before = await preferences()
      await page.reload()
      report.reloads.push({ style: key, mode, ...(await page.evaluate(() => ({ url: location.href, title: document.title, readyState: document.readyState, text: document.body.innerText.slice(0, 1400), placeholders: [...document.querySelectorAll('input')].map(input => input.getAttribute('placeholder')) }))) })
      await page.getByPlaceholder('主密码', { exact: true }).waitFor()
      assert.deepEqual(await preferences(), before, `${key}/${mode}: persisted preferences`)
      assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.interface, document.documentElement.dataset.theme]), [key, mode], `${key}/${mode}: locked refresh appearance`)
      assert.equal(await page.locator('.wallpaper-layer').count(), 0, 'lock screen hides wallpaper')
      await unlock()
      await page.getByText(taskName, { exact: true }).first().waitFor()
      report.checks.push({ type: 'persistence', style: key, mode, passed: true })
      writeFileSync(resolve(output, 'results.json'), JSON.stringify(report, null, 2))
      console.log(`CHECKED ${key}/${mode}: 5 routes × 5 widths, navigation geometry, settings, preference reload, task retained`)
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 })
  await openSettings()
  await button('背景设置').click()
  await button('使用壁纸：深海流光').click()
  await page.getByRole('checkbox', { name: /透明信息框/ }).check()
  await page.getByRole('slider', { name: '信息框透明度', exact: true }).fill('60')
  await button('界面风格').click()
  await button('玫红').click()
  await button('深色').click()
  const retained = await preferences()
  for (const [index, key] of styles.entries()) {
    await selectStyle(key, index % 2 === 0 ? 'Enter' : 'Space')
    const current = await preferences()
    assert.equal(current.theme.accent, 'rose', `${key}: keyboard selection preserves accent`)
    assert.equal(current.theme.mode, 'dark', `${key}: keyboard selection preserves mode`)
    assert.deepEqual(current.wallpaper, retained.wallpaper, `${key}: keyboard selection preserves wallpaper`)
    const panels = await page.evaluate(added => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const context = canvas.getContext('2d', { willReadFrequently: true })
      const selector = '.desktop-sidebar, .style-desktop-navigation, .desktop-main .page-header, .style-dashboard-header, .dashboard-aurora > :not(.dashboard-hero-actions)' + (added ? ', .today-columns > section, .today-agenda' : '')
      return [...document.querySelectorAll(selector)].filter(element => getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0).map(element => {
        const css = getComputedStyle(element)
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = css.backgroundColor
        context.fillRect(0, 0, 1, 1)
        return { selector: element.className, openHeader: element.matches('.dashboard-sunrise, .dashboard-swiss, .dashboard-botanical, .dashboard-gallery, .dashboard-aurora'), alpha: context.getImageData(0, 0, 1, 1).data[3] / 255, opacity: css.opacity }
      })
    }, addedStyles.includes(key))
    check(panels.length >= 2 && panels.every(panel => Math.abs(panel.alpha - (panel.openHeader ? 0 : 0.4)) < 0.01 && panel.opacity === '1'), `${key}: transparent panel backgrounds preserve opaque content`, panels)
  }
  await selectStyle('swiss')
  const beforeRecommendation = await preferences()
  await button('应用推荐配色').click()
  await settled()
  const recommended = await preferences()
  assert.notDeepEqual(recommended.theme, beforeRecommendation.theme, 'recommended appearance changes mode or accent')
  assert.equal(recommended.theme.style, 'swiss')
  assert.deepEqual(recommended.wallpaper, beforeRecommendation.wallpaper, 'recommendation preserves wallpaper')
  await closeSettings()
  await openSettings()
  await button('撤销更改').click()
  await settled()
  assert.deepEqual(await preferences(), beforeRecommendation, 'undo restores previous mode and accent')
  await selectStyle('gallery')
  await button('背景设置').click()
  await button('界面风格').click()
  await button('撤销更改').click()
  await settled()
  assert.deepEqual(await preferences(), beforeRecommendation, 'undo style selection restores previous appearance')
  await button('新增设计').click()
  assert.equal(await page.locator('.interface-style-option').count(), 10)
  await button('原有风格').click()
  assert.equal(await page.locator('.interface-style-option').count(), 4)
  await button('全部风格').click()
  assert.equal(await page.locator('.interface-style-option').count(), 14)
  await button('跟随系统').click()
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme })
    await page.waitForFunction(mode => document.documentElement.dataset.theme === mode, colorScheme)
  }
  const persisted = await preferences()
  await page.reload()
  await page.getByPlaceholder('主密码', { exact: true }).waitFor()
  assert.deepEqual(await preferences(), persisted)
  assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.interface, document.documentElement.dataset.theme, document.documentElement.dataset.accent]), ['swiss', 'dark', 'rose'])
  await unlock()
  await page.locator('.wallpaper-layer').waitFor()
  await openSettings()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const duration = await styleButton('classic').evaluate(element => getComputedStyle(element).transitionDuration)
  assert.ok(duration.split(',').every(value => parseFloat(value) <= 0.001), 'reduced motion disables picker transition')
  await selectStyle('classic')
  assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-card-radius'))), 0.75)
  await closeSettings()
  report.checks.push({ type: 'appearance-controls', passed: true, checks: ['all 14 keyboard selections with Enter and Space', 'accent/mode/wallpaper preserved', 'transparent panel background alpha without text opacity', 'recommended appearance', 'undo recommendation and style', '10/4/14 filters', 'system mode', 'wallpaper reload and lock privacy', 'reduced motion', 'classic restoration'] })

  await openSettings()
  await button('背景设置').click()
  await page.getByRole('checkbox', { name: /透明信息框/ }).uncheck()
  await page.getByRole('group', { name: '壁纸资源', exact: true }).getByRole('button', { name: /纯色空间/ }).click()
  await closeSettings()
  if (!captureOnly) for (const key of selectedStyles) await navigationJourney(key)
  for (const key of addedStyles.filter(key => selectedStyles.includes(key))) {
    await openSettings()
    await selectStyle(key)
    if (await button('应用推荐配色').count()) await button('应用推荐配色').click()
    await settled()
    report.recommendations.push({ ...report.styles.find(style => style.key === key), ...(await preferences()).theme })
    await styleButton(key).scrollIntoViewIfNeeded()
    await screenshot(`${key}-recommended-settings`)
    await closeSettings()
    await inspectPersonality(key)
  }
  const uniqueSilhouettes = new Set(report.personalities.map(item => item.silhouetteFingerprint)).size
  const uniqueControls = new Set(report.personalities.map(item => JSON.stringify(item.controls))).size
  check(uniqueSilhouettes === report.personalities.length, 'each new style has a distinct measured layout and control silhouette', { uniqueSilhouettes, count: report.personalities.length })
  check(uniqueControls === report.personalities.length, 'each new style has distinct control geometry or typography without color', { uniqueControls, count: report.personalities.length })
  report.checks.push({ type: 'structural-diversity', uniqueSilhouettes, uniqueControls, count: report.personalities.length, note: 'Measured uniqueness supports the screenshot review; it does not alone prove visually meaningful diversity.' })
  const accentLabels = { teal: '青碧', indigo: '靛蓝', blue: '湛蓝', violet: '紫罗兰', rose: '玫红', amber: '琥珀', coral: '珊瑚', cobalt: '钴蓝', orchid: '兰紫' }
  const overviewCards = report.recommendations.map(style => `<article><img src="${style.key}-recommended.png" alt="${style.label}" /><h2>${style.label}</h2><p>${style.mode === 'dark' ? '深色' : '浅色'} · ${accentLabels[style.accent]}</p></article>`).join('')
  writeFileSync(resolve(output, 'recommended-overview.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Personal Hub 十种界面个性</title><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#edece8;color:#17201d;font:16px/1.5 system-ui,sans-serif}h1{margin:0;font-size:30px}header p{margin:6px 0 22px;color:#535c55}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}article{margin:0;padding:10px;background:white;border:1px solid #d4d7d2;border-radius:12px}img{width:100%;display:block;border-radius:5px}h2{margin:10px 0 2px;font-size:18px}article p{margin:0;font-size:12px;color:#535c55}</style><header><h1>Personal Hub · 十种界面个性</h1><p>真实页面截图 · 独立导航、首页构图与控件 · 每款使用推荐明暗和配色</p></header><main>${overviewCards}</main></html>`)
  const overview = await browser.newPage({ viewport: { width: 1920, height: 800 }, deviceScaleFactor: 1 })
  await overview.goto(pathToFileURL(resolve(output, 'recommended-overview.html')).href)
  await overview.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
  await overview.screenshot({ path: resolve(output, 'recommended-overview.png'), fullPage: true })
  report.screenshots.push('recommended-overview.png')
  await overview.close()

  const comparisonCards = report.recommendations.map(style => `<section><h2>${style.label}</h2><div><article><h3>上一轮</h3>${existsSync(resolve('.visual-qa/interface-gallery', `${style.key}-recommended.png`)) ? `<img src="../interface-gallery/${style.key}-recommended.png">` : '<p>无上一轮图片</p>'}</article><article><h3>本轮</h3><a href="${style.key}-recommended.png"><img src="${style.key}-recommended.png"></a></article></div><div><article><h3>本轮灰度：布局与层级</h3><img class="grayscale" src="${style.key}-recommended.png"></article><article><h3>本轮灰度：实际任务表单控件</h3><img class="grayscale" src="${style.key}-controls.png"></article></div></section>`).join('')
  writeFileSync(resolve(output, 'before-after.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>界面个性前后对照</title><style>body{margin:0;padding:30px;background:#efefec;color:#202722;font:16px/1.5 system-ui}main{max-width:1800px;margin:auto}section{margin:36px 0}section>div{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:16px 0}article{padding:12px;background:white;border:1px solid #d4d8d3}h3{margin:0 0 10px}img{width:100%;display:block}.grayscale{filter:grayscale(1)}@media(max-width:700px){section>div{grid-template-columns:1fr}}</style><main><h1>界面个性：前后对照与灰度验收</h1><p>左右均为实际生产构建截图；灰度图只去除颜色，用于独立判断形状、排版、层级与布局。</p>${comparisonCards}</main></html>`)
  const grayscaleCards = report.recommendations.map(style => `<article><h2>${style.label}</h2><img src="${style.key}-recommended.png"><img src="${style.key}-controls.png"></article>`).join('')
  writeFileSync(resolve(output, 'grayscale-overview.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>十种风格灰度验收</title><style>body{margin:0;padding:24px;background:#eee;font:16px system-ui}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}article{padding:10px;background:white}h2{margin:4px 0 12px;font-size:20px}img{display:block;width:100%;filter:grayscale(1);margin:8px 0}</style><h1>十种风格 · 灰度布局与控件</h1><main>${grayscaleCards}</main></html>`)
  const grayscaleOverview = await browser.newPage({ viewport: { width: 1920, height: 1000 }, deviceScaleFactor: 1 })
  await grayscaleOverview.goto(pathToFileURL(resolve(output, 'grayscale-overview.html')).href)
  await grayscaleOverview.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
  await grayscaleOverview.screenshot({ path: resolve(output, 'grayscale-overview.png'), fullPage: true })
  report.screenshots.push('grayscale-overview.png')
  await grayscaleOverview.close()

  if (!captureOnly || finalPass) for (const key of ['terminal', 'retro', 'gallery'].filter(key => selectedStyles.includes(key))) await taskJourney(key)
  for (const key of captureOnly && !finalPass ? [] : selectedStyles) {
    await openSettings()
    await selectStyle(key)
    await closeSettings()
    for (const journey of report.journeys) await page.locator('.today-task-row').filter({ hasText: journey.retained }).waitFor()
    report.checks.push({ type: 'cross-style-task-retention', style: key, tasks: report.journeys.map(item => item.retained), passed: true })
  }

  const fallbackContext = await browser.newContext()
  const fallbackPage = await fallbackContext.newPage()
  await fallbackPage.addInitScript(() => {
    localStorage.setItem('xk.theme.light-baseline.v1', '1')
    localStorage.setItem('xk.theme.v1', JSON.stringify({ style: 'unknown', mode: 'invalid', accent: 'invalid' }))
  })
  await fallbackPage.goto(url)
  await fallbackPage.getByRole('button', { name: '仅在本机使用 / 旧版设备加入', exact: true }).waitFor()
  assert.deepEqual(await fallbackPage.evaluate(() => [document.documentElement.dataset.interface, document.documentElement.dataset.theme, document.documentElement.dataset.accent]), ['classic', 'light', 'teal'])
  await fallbackContext.close()
  report.checks.push({ type: 'invalid-preference-fallback', passed: true })
  }
  check(report.pageErrors.length === 0, 'browser page errors', report.pageErrors)
  report.passed = report.failures.length === 0
} catch (error) {
  report.failures.push({ message: error.message })
  if (page) {
    report.failureState = await page.evaluate(() => ({ url: location.href, title: document.title, readyState: document.readyState, text: document.body.innerText.slice(0, 2000), placeholders: [...document.querySelectorAll('input')].map(input => input.getAttribute('placeholder')) })).catch(() => null)
    await page.screenshot({ path: resolve(output, 'failure.png'), animations: 'disabled' }).catch(() => {})
  }
} finally {
  report.blockedExternalRequests = [...new Set(report.blockedExternalRequests)]
  writeFileSync(resolve(output, 'results.json'), JSON.stringify(report, null, 2))
  const escape = value => String(value).replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value])
  const cards = report.styles.filter(style => !formsOnly || selectedStyles.includes(style.key)).map(style => {
    const images = modes.flatMap(([mode, label]) => formsOnly
      ? [1440, 375].map(width => `<article><a href="${style.key}-${mode}-form-${width}.png"><img loading="lazy" src="${style.key}-${mode}-form-${width}.png" alt="${escape(style.label)} ${label}任务表单 ${width}px" /></a><p>${label} · ${width === 1440 ? '桌面' : '手机'}任务表单 · ${width}px</p></article>`)
      : [`<article><a href="${style.key}-${mode}-desktop.png"><img loading="lazy" src="${style.key}-${mode}-desktop.png" alt="${escape(style.label)} ${label}桌面" /></a><p>${label} · <a href="${style.key}-${mode}-mobile.png">手机</a> · <a href="${style.key}-${mode}-settings.png">设置</a></p></article>`])
    return `<section><h2>${escape(style.label)} <small>${escape(style.key)}</small></h2><div>${images.join('')}</div></section>`
  }).join('')
  writeFileSync(resolve(output, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Personal Hub 界面风格验收</title><style>body{margin:0;padding:32px;background:#f2f1ee;color:#17201d;font:16px/1.5 system-ui,sans-serif}main{max-width:1600px;margin:auto}h1{margin:0}small{font-size:13px;font-weight:400}section{margin-top:32px}section>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}article{background:white;padding:12px;border:1px solid #d5d9d6;border-radius:12px}img{width:100%;display:block}a{color:#245e53}@media(max-width:700px){body{padding:16px}section>div{grid-template-columns:1fr}}</style><main><h1>Personal Hub · 14 种界面风格</h1><p>隔离合成账户 / 生产构建浏览器截图 / ${report.passed ? '自动检查通过' : '存在待修复检查'}。<a href="results.json">详细结果</a></p>${cards}</main></html>`)
  if (browser) await browser.close()
  if (server) await new Promise(resolve => server.close(resolve))
}

console.log(JSON.stringify({ passed: report.passed, formsOnly, formChecks: report.checks.filter(check => check.type === 'task-form').length, closeIconChecks: report.checks.filter(check => check.type === 'task-form-close-contrast').length, responsiveChecks: report.checks.filter(check => check.type === 'responsive').length, navigationChecks: report.checks.filter(check => check.type === 'navigation-geometry').length, persistenceChecks: report.checks.filter(check => check.type === 'persistence').length, contrastChecks: report.contrast.length, personalities: report.personalities.length, journeys: report.journeys.length, structuralDiversity: report.checks.find(check => check.type === 'structural-diversity'), baselineWarnings: report.baselineWarnings.length, failures: report.failures, output }, null, 2))
if (!report.passed) process.exitCode = 1
