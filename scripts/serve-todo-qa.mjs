import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { resolve, sep, extname } from 'node:path'
const root = resolve('.visual-qa/todo-bundle')
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary' }
createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
    if (!path.startsWith(root + sep) || !statSync(path).isFile()) throw new Error('not found')
    response.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream')
    response.setHeader('Cache-Control', 'no-store')
    createReadStream(path).pipe(response)
  } catch { response.writeHead(404); response.end() }
}).listen(5187, '127.0.0.1', () => console.log('Todo QA static server http://127.0.0.1:5187'))
