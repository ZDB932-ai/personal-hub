import { _android } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const serial = process.env.PHUB_ANDROID_SERIAL
if (!serial) throw new Error('需要指定 QA 手机 PHUB_ANDROID_SERIAL')
const device = (await _android.devices({ omitDriverInstall: true })).find(item => item.serial() === serial)
if (!device) throw new Error('QA 手机未连接')
const dir = resolve('.visual-qa', `android-preview-${Date.now()}`)
mkdirSync(dir, { recursive: true })
const results = [], errors = []
const title = `QA预览提醒-${Date.now()}`
try {
  const page = await (await device.webView({ pkg: 'com.zdb.personalhub.debug' })).page()
  page.setDefaultTimeout(20000)
  page.on('pageerror', error => errors.push(error.message))
  const button = name => page.getByRole('button', { name, exact: true })
  if (await button('解锁').isVisible()) {
    await page.getByPlaceholder('主密码', { exact: true }).fill('QA-Device-B-Password')
    await button('解锁').click()
  }
  await button('打开设置').waitFor()
  results.push('旧测试版密码在覆盖升级后解锁成功')
  await button('打开设置').click()
  await button('关于').click()
  await page.getByText('Personal Hub v1.1.1', { exact: true }).waitFor()
  results.push('关于页版本1.1.1')
  await page.keyboard.press('Escape')
  await page.evaluate(() => { location.hash = '#/today' })
  await button('新建任务').click()
  await page.getByPlaceholder('要做什么？', { exact: true }).fill(title)
  const time = await page.evaluate(() => {
    const due = new Date(Date.now() + 100000)
    due.setSeconds(0, 0)
    return `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`
  })
  await page.locator('input[type=time]').fill(time)
  await button('添加任务').click()
  await page.waitForFunction(async time => (await window.Capacitor.nativePromise('LocalNotifications', 'getPending', {})).notifications.some(item => item.body === '有任务到时间啦，请解锁 Personal Hub 查看。' && new Date(item.schedule.at).getHours() === Number(time.split(':')[0]) && new Date(item.schedule.at).getMinutes() === Number(time.split(':')[1])), time)
  const item = await page.evaluate(async time => (await window.Capacitor.nativePromise('LocalNotifications', 'getPending', {})).notifications.find(item => item.body === '有任务到时间啦，请解锁 Personal Hub 查看。' && new Date(item.schedule.at).getHours() === Number(time.split(':')[0]) && new Date(item.schedule.at).getMinutes() === Number(time.split(':')[1])), time)
  assert.ok(item, '新增提醒须真实进入系统队列')
  results.push('新增任务进入原生提醒队列，通知不含任务正文')
  await button('锁定应用').click()
  await button('解锁').waitFor()
  await page.waitForTimeout(1500)
  assert.ok(await page.evaluate(async id => (await window.Capacitor.nativePromise('LocalNotifications', 'getPending', {})).notifications.some(item => item.id === id), item.id))
  results.push('锁定清空内存后原生提醒仍保留')
  await device.shell('input keyevent KEYCODE_HOME')
  console.log('WAIT: 应用已锁定并进入后台，等待系统提醒送达')
  const remaining = await device.shell('date +%s')
  const due = new Date(item.schedule.at).getTime()
  const wait = Math.max(0, due - Number(remaining.toString().trim()) * 1000 + 10000)
  for (let elapsed = 0; elapsed < wait; elapsed += 5000) await new Promise(resolve => setTimeout(resolve, Math.min(5000, wait - elapsed)))
  await device.shell('am start -n com.zdb.personalhub.debug/com.zdb.personalhub.MainActivity')
  let delivered = false
  for (let i = 0; i < 30; i++) {
    delivered = await page.evaluate(async id => (await window.Capacitor.nativePromise('LocalNotifications', 'getDeliveredNotifications', {})).notifications.some(item => item.id === id), item.id)
    if (delivered) break
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  assert.ok(delivered, '后台锁定后须实际送达系统通知')
  results.push('应用锁定且处于后台时，系统已送达通知')
  await device.shell('am start -n com.zdb.personalhub.debug/com.zdb.personalhub.MainActivity')
  await page.getByPlaceholder('主密码', { exact: true }).fill('QA-Device-B-Password')
  await button('解锁').click()
  await button('打开设置').waitFor()
  await page.evaluate(() => { location.hash = '#/today' })
  await page.getByText(title, { exact: true }).waitFor()
  results.push('重新解锁后测试任务保留')
  await page.evaluate(async id => window.Capacitor.nativePromise('LocalNotifications', 'removeDeliveredNotifications', { notifications: [{ id }] }), item.id)
  assert.deepEqual(errors, [])
  console.log(`PASS: ${results.join('；')}`)
} finally {
  writeFileSync(resolve(dir, 'report.json'), JSON.stringify({ results, errors, testTask: title, boundary: '独立Debug覆盖升级；未覆盖正式版安装、重启系统与厂商长时间省电限制' }, null, 2))
  console.log(`REPORT: ${dir}`)
  await device.close()
}
