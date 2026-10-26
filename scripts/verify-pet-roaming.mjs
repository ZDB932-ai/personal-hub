import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve('.visual-qa', `pet-roaming-${Date.now()}`)
const scale = Number(process.env.PHUB_PET_TEST_SCALE ?? 1)
assert.ok(Number.isFinite(scale) && scale > 0)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 800, height: 700 } })
await context.addInitScript(({ scale }) => {
  let callback = 0
  let position = { x: -300 * scale, y: 200 * scale }
  let size = { width: 280 * scale, height: 340 * scale }
  const callbacks = new Map()
  const listeners = new Map()
  window.petTest = {
    moves: [], unknown: [], delayPosition: false,
    snapshot: () => ({ position: { ...position }, size: { ...size } }),
    reset: () => {
      position = { x: -300 * scale, y: 600 * scale }
      callbacks.get(listeners.get('pet://position-reset'))?.({ event: 'pet://position-reset', payload: null })
    },
  }
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'pet' }, currentWebview: { label: 'pet' } },
    transformCallback: handler => { callbacks.set(++callback, handler); return callback },
    unregisterCallback: () => {},
    invoke: async (command, args) => {
      if (command === 'pet_preferences') return { enabled: true, background: false, reminders: false, character: 'nailong' }
      if (command === 'plugin:event|listen') { listeners.set(args.event, args.handler); return ++callback }
      if (command === 'plugin:event|unlisten') return
      if (command === 'plugin:window|scale_factor') return scale
      if (command === 'plugin:window|current_monitor') return { name: 'test', position: { x: -1920 * scale, y: 0 }, size: { width: 1920 * scale, height: 1080 * scale }, workArea: { position: { x: -1920 * scale, y: 0 }, size: { width: 1920 * scale, height: 1040 * scale } }, scaleFactor: scale }
      if (command === 'plugin:window|outer_size') return size
      if (command === 'plugin:window|outer_position') {
        const snapshot = { ...position }
        if (window.petTest.delayPosition) await new Promise(resolve => setTimeout(resolve, 350))
        return snapshot
      }
      if (command === 'plugin:window|is_visible') return true
      if (command === 'plugin:window|set_size') {
        const logical = args.value.toJSON().Logical
        size = { width: logical.width * scale, height: logical.height * scale }
        return
      }
      if (command === 'plugin:window|set_position') {
        position = args.value.toJSON().Physical
        window.petTest.moves.push({ ...position })
        return
      }
      window.petTest.unknown.push(command)
      throw new Error(`Unexpected IPC: ${command}`)
    },
  }
}, { scale })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(`${process.env.PHUB_PET_REVIEW_URL ?? 'http://127.0.0.1:4197'}/?pet=1`)
  const initial = await page.evaluate(() => window.petTest.snapshot())
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.getByRole('button', { name: '玩偶互动菜单' }).click()
    await page.waitForFunction(scale => window.petTest.snapshot().position.x === -492 * scale, scale)
    assert.equal((await page.evaluate(() => window.petTest.snapshot())).size.width, 472 * scale)
    await page.getByRole('button', { name: '玩偶互动菜单' }).click()
    await page.waitForFunction(scale => window.petTest.snapshot().size.width === 280 * scale, scale)
    assert.deepEqual(await page.evaluate(() => window.petTest.snapshot()), initial, '负坐标显示器右边缘菜单反复开关后位置和尺寸不漂移')
  }
  await page.evaluate(() => { window.petTest.moves.length = 0 })
  await page.getByRole('button', { name: '玩偶互动菜单' }).click()
  await page.getByRole('button', { name: '开始自主走动', exact: true }).click()
  await page.mouse.move(790, 690)
  await page.waitForFunction(() => window.petTest.moves.length >= 5)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(200)
  const paused = await page.evaluate(() => window.petTest.moves.length)
  await page.waitForTimeout(500)
  assert.equal(await page.evaluate(() => window.petTest.moves.length), paused, '减少动态效果时停止窗口位移')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.waitForFunction(count => window.petTest.moves.length > count + 3, paused)
  await page.locator('.pet-character').hover()
  await page.waitForTimeout(150)
  const hovered = await page.evaluate(() => window.petTest.moves.length)
  await page.waitForTimeout(400)
  assert.equal(await page.evaluate(() => window.petTest.moves.length), hovered, '指针停留时暂停巡游')
  await page.mouse.move(790, 690)
  await page.waitForFunction(count => window.petTest.moves.length > count + 3, hovered)
  await page.evaluate(() => window.petTest.reset())
  await page.waitForTimeout(150)
  const resetCount = await page.evaluate(() => window.petTest.moves.length)
  await page.waitForTimeout(400)
  assert.equal(await page.evaluate(() => window.petTest.moves.length), resetCount, '找回位置后停止巡游，不沿用旧坐标')
  await page.evaluate(() => { window.petTest.delayPosition = true })
  const pet = page.locator('.pet-character')
  const box = await pet.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 50)
  await page.mouse.up()
  await page.waitForTimeout(500)
  assert.equal(await page.evaluate(() => window.petTest.moves.length), resetCount, '松手后丢弃迟到的拖动位置读取')
  assert.deepEqual(errors, [])
  assert.deepEqual(await page.evaluate(() => window.petTest.unknown), [])
  await page.screenshot({ path: resolve(output, 'roaming.png') })
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ passed: true, scale, scope: 'Actual built Vue desktop component with mocked Tauri IPC; not native Windows acceptance', checks: ['negative-monitor menu expansion', 'three menu cycles without drift', 'movement', 'reduced-motion pause', 'resume', 'hover pause', 'hover resume', 'reset stops roaming', 'late drag discarded'], errors }, null, 2))
  console.log(output)
} finally {
  await browser.close()
}
