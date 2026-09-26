export async function captureNativeDownload(page) {
  await page.evaluate(() => {
    if (window.qaNativeCaptureInstalled) return
    window.qaNativeCaptureInstalled = true
    const capture = async (name, bytes) => {
      if (name.endsWith('.phub-device')) {
        window.qaTransfer = Promise.resolve(new TextDecoder().decode(bytes))
      } else if (name.endsWith('.phub')) {
        window.qaBackup = new TextDecoder().decode(bytes)
      } else {
        window.qaDownloaded = Promise.resolve({ bytes: bytes.byteLength, hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('') })
      }
    }
    if (window.Capacitor?.getPlatform() === 'android') {
      const original = window.Capacitor.nativePromise.bind(window.Capacitor)
      let name, chunks
      window.Capacitor.nativePromise = async (plugin, method, args) => {
        if (plugin !== 'DocumentSaver') return original(plugin, method, args)
        if (method === 'begin') { name = args.name; chunks = []; return { cancelled: false, id: 'qa-capture' } }
        if (method === 'append') { chunks.push(Uint8Array.from(atob(args.data), c => c.charCodeAt(0))); return }
        if (method === 'finish') { await capture(name, await new Blob(chunks).arrayBuffer()); chunks = []; return }
        if (method === 'abort') { chunks = []; return }
        throw new Error(`Unexpected DocumentSaver call: ${method}`)
      }
    }
    if (window.__TAURI_INTERNALS__) {
      const internals = window.__TAURI_INTERNALS__
      const original = window.fetch.bind(window)
      const saveUrl = internals.convertFileSrc('plugin:dialog|save', 'ipc')
      const writeUrl = internals.convertFileSrc('plugin:fs|write_file', 'ipc')
      let name
      window.fetch = async (input, options) => {
        const url = typeof input === 'string' ? input : input.url
        const reply = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', 'Tauri-Response': 'ok' } })
        if (url === saveUrl) { name = JSON.parse(options.body).options.defaultPath; return reply(`C:\\QA\\${name}`) }
        if (url === writeUrl) { await capture(name, await new Blob([options.body]).arrayBuffer()); return reply(null) }
        return original(input, options)
      }
    }
  })
}
