import { _android } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const serial = process.env.PHUB_ANDROID_SERIAL
if (!serial) throw new Error('请指定 PHUB_ANDROID_SERIAL，仅测试独立 mobileqa 包')
const pkg = 'com.zdb.personalhub.mobileqa'
const device = (await _android.devices({ omitDriverInstall: true })).find(item => item.serial() === serial)
if (!device) throw new Error('指定手机未连接')
const directory = resolve('.visual-qa/android-polish')
mkdirSync(directory, { recursive: true })
const results = [], errors = [], measurements = []
const pass = message => { results.push(message); console.log(`PASS: ${message}`) }
const taskTitle = `手机验收任务-${Date.now()}`
const fileName = `mobile-preview-${Date.now()}.txt`
let page
try {
  await device.shell(`am start -n ${pkg}/com.zdb.personalhub.MainActivity`)
  page = await (await device.webView({ pkg })).page()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))
  const b = name => page.getByRole('button', { name, exact: true })
  const nav = name => page.getByRole('navigation', { name: '移动端主导航' }).getByRole('link', { name, exact: true })
  const back = () => device.shell('input keyevent KEYCODE_BACK')
  const shot = async name => {
    await page.waitForTimeout(500)
    writeFileSync(resolve(directory, `${name}.png`), await device.screenshot())
  }
  const bounds = async name => {
    const data = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth }))
    assert.ok(data.scrollWidth <= data.width + 1, `${name} 不应横向溢出`)
    measurements.push({ name, ...data })
  }
  await page.getByText('手机效果验收', { exact: true }).waitFor()
  await page.getByPlaceholder('主密码', { exact: true }).fill(process.env.PHUB_MOBILE_QA_PASSWORD ?? 'Mobile-QA-2026')
  await b('登录').click()
  await page.getByRole('heading', { name: '今天', exact: true }).waitFor()
  await bounds('今天')
  await shot('today-after')
  await b('打开更多导航').click()
  await page.getByRole('heading', { name: '更多功能', exact: true }).waitFor()
  await shot('more-after')
  await back()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => document.visibilityState), 'visible')
  pass('系统返回关闭更多菜单，不退出应用')

  await b('新建任务').click()
  const field = page.getByPlaceholder('要做什么？', { exact: true })
  await field.fill(taskTitle)
  const fullHeight = await page.evaluate(() => innerHeight)
  const box = await field.boundingBox()
  const session = await page.context().newCDPSession(page)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForFunction(height => innerHeight < height - 100, fullHeight)
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector('.modal-panel')
    const rect = panel.getBoundingClientRect()
    const date = document.querySelector('.date-picker-trigger').getBoundingClientRect()
    const time = document.querySelector('input[type=time]').getBoundingClientRect()
    const active = document.activeElement.getBoundingClientRect()
    const footer = panel.querySelector('.modal-region-footer').getBoundingClientRect()
    return { height: innerHeight, bottom: rect.bottom, footerTop: footer.top, footerBottom: footer.bottom, dateBottom: date.bottom, timeTop: time.top, inputVisible: active.top >= rect.top && active.bottom <= footer.top, panelOnTop: panel.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.bottom - 8)) }
  })
  assert.ok(geometry.bottom <= geometry.height + 1 && geometry.inputVisible && geometry.panelOnTop, JSON.stringify(geometry))
  assert.ok(geometry.dateBottom < geometry.timeTop)
  assert.ok(geometry.footerBottom <= geometry.height + 1 && geometry.footerTop > 44)
  for (const button of await page.locator('.modal-region-footer button,.modal-region-header button').all()) {
    const box = await button.boundingBox()
    assert.ok(box.width >= 44 && box.height >= 44)
  }
  measurements.push({ name: '真实软键盘', ...geometry })
  await shot('task-keyboard-after')
  await back()
  await page.waitForFunction(height => innerHeight >= height - 2, fullHeight)
  assert.equal(await field.inputValue(), taskTitle)
  assert.equal(await page.locator('.modal-panel').count(), 1)
  pass('真实软键盘缩小视口；弹窗在导航上层，日期时间分行；首次返回仅收键盘且保留输入')

  await page.locator('.date-picker-trigger').click()
  await page.getByRole('dialog', { name: '选择日期', exact: true }).waitFor()
  await back()
  await page.getByRole('dialog', { name: '选择日期', exact: true }).waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.modal-panel').count(), 1)
  await page.getByRole('combobox').first().click()
  await page.getByRole('listbox').waitFor()
  await back()
  await page.getByRole('listbox').waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.modal-panel').count(), 1)
  await b('添加任务').click()
  await page.locator('.modal-panel').waitFor({ state: 'hidden' })
  pass('日期和下拉选择逐层返回，表单仍可保存')

  await nav('日历').click()
  await page.locator('.calendar-page-frame').waitFor()
  await bounds('日历')
  await shot('calendar-after')
  await back()
  await page.getByRole('heading', { name: '今天', exact: true }).waitFor()
  pass('日历无页面横向溢出，系统返回上一页面')

  await b('打开更多导航').click()
  await page.getByRole('dialog').getByRole('button', { name: '设置', exact: true }).click()
  await b('安全').click()
  await page.getByText('修改主密码', { exact: true }).waitFor()
  await b('关于').click()
  await page.getByText(`Personal Hub v${JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version}`, { exact: true }).waitFor()
  await bounds('设置')
  await shot('settings-after')
  await back()
  await page.locator('.modal-panel').waitFor({ state: 'hidden' })
  pass('手机设置分区按需加载，系统返回关闭设置')

  await b('打开更多导航').click()
  await page.getByRole('dialog').getByRole('link', { name: '资料库', exact: true }).click()
  await page.getByRole('heading', { name: '资料库', exact: true }).waitFor()
  await page.locator('input[type=file]').evaluate((input, name) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['手机端真机预览验收\n换行、中文与本地加密文件。'], name, { type: 'text/plain' }))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, fileName)
  await b(fileName).click()
  await page.getByText('手机端真机预览验收', { exact: false }).waitFor()
  await shot('document-preview-after')
  await back()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await bounds('资料库')
  pass('测试文本加密入库、中文预览和系统返回关闭预览')

  await page.evaluate(() => {
    const original = window.Capacitor.nativePromise.bind(window.Capacitor)
    window.qaMobileSaveEvents = []
    window.Capacitor.nativePromise = async (plugin, method, options) => {
      const result = await original(plugin, method, options)
      if (plugin === 'DocumentSaver') window.qaMobileSaveEvents.push({ method, cancelled: !!result?.cancelled })
      return result
    }
  })
  await page.locator('article').filter({ has: b(fileName) }).getByRole('button', { name: '下载', exact: true }).click()
  let saveActivity = ''
  for (let attempt = 0; attempt < 20; attempt++) {
    saveActivity = (await device.shell('dumpsys activity activities')).toString().split('\n').find(line => line.includes('topResumedActivity')) ?? ''
    if (/filemanager|documentsui/i.test(saveActivity)) break
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  assert.match(saveActivity, /filemanager|documentsui/i)
  await back()
  await page.waitForFunction(() => window.qaMobileSaveEvents.some(event => event.method === 'begin' && event.cancelled))
  assert.equal(await page.evaluate(() => window.qaMobileSaveEvents.some(event => event.method === 'append')), false)
  pass('取消原生文件保存后不写文件，应用恢复可用')

  await nav('今天').click()
  await page.getByRole('heading', { name: '今天', exact: true }).waitFor()
  await back()
  let backgroundActivity = ''
  for (let attempt = 0; attempt < 20; attempt++) {
    backgroundActivity = (await device.shell('dumpsys activity activities')).toString().split('\n').find(line => line.includes('topResumedActivity')) ?? ''
    if (backgroundActivity && !backgroundActivity.includes(pkg)) break
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  assert.ok(backgroundActivity && !backgroundActivity.includes(pkg))
  await device.shell(`am start -n ${pkg}/com.zdb.personalhub.MainActivity`)
  await page.waitForFunction(() => document.visibilityState === 'visible')
  await page.getByRole('heading', { name: '今天', exact: true }).waitFor()
  pass('首页返回将应用放入后台，重新进入保留当前会话')
  assert.deepEqual(errors, [])
  writeFileSync(resolve(directory, 'report.json'), JSON.stringify({ passed: true, results, measurements, errors, taskTitle, fileName, boundary: '仅独立 mobileqa 合成数据；不等同正式版升级或长时间后台验收' }, null, 2))
} catch (error) {
  writeFileSync(resolve(directory, 'report.json'), JSON.stringify({ passed: false, results, measurements, errors, failure: String(error), taskTitle, fileName }, null, 2))
  if (page && !page.isClosed()) writeFileSync(resolve(directory, 'failure.png'), await device.screenshot())
  throw error
} finally {
  await device.close()
}
