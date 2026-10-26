import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: ['three', 'three/addons/loaders/GLTFLoader.js'] }, server: { host: '127.0.0.1', port: 0, watch: null } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 640 } })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'log') console.log(message.text()) })
  await page.route('**/pet-check', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }))
  await page.goto(new URL('pet-check', server.resolvedUrls.local[0]).href)
  const report = await page.evaluate(async () => {
    const { createPresetPet } = await import('/src/lib/pet/preset3d.ts')
    const { petCatalog, selectedPet } = await import('/src/lib/pet/catalog.ts')
    document.body.replaceChildren()
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:400px;height:400px'
    document.body.append(canvas)
    const results = []
    for (const entry of petCatalog.filter(item => item.renderer === 'preset')) {
      console.log(`Loading ${entry.id}`)
      if (selectedPet(entry.id).id !== entry.id) throw new Error(`无法选择 ${entry.id}`)
      const controller = new AbortController()
      const pet = await createPresetPet(canvas, entry.asset, controller.signal)
      const actions = []
      pet.setMood('idle')
      await new Promise(resolve => setTimeout(resolve, 200))
      for (const action of entry.actions) {
        if (!pet.setMood(action.mood)) throw new Error(`动作不可用 ${entry.id}/${action.mood}`)
        await new Promise(resolve => setTimeout(resolve, 200))
        actions.push({ mood: action.mood, current: pet.current })
      }
      results.push({ id: entry.id, stats: pet.stats, actions })
      pet.dispose()
      controller.abort()
    }
    return results
  })
  assert.equal(report.length, 4)
  for (const result of report) assert.ok(result.stats.triangles > 0, result.id)
  assert.deepEqual(errors, [])
  await mkdir('.visual-qa/pet-preview-library', { recursive: true })
  await writeFile('.visual-qa/pet-preview-library/report.json', JSON.stringify({ report, errors }, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
  await server.close()
}
