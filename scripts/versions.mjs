import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')
const pkg = JSON.parse(read('package.json'))
if (!/^\d+\.\d+\.\d+$/.test(pkg.version) || !Number.isSafeInteger(pkg.androidVersionCode) || pkg.androidVersionCode < 1) throw new Error('版本必须为 x.y.z，androidVersionCode 必须为正整数')
const files = [
  ['src-tauri/tauri.conf.json', text => text.replace(/"version": "[^"]+"/, `"version": "${pkg.version}"`)],
  ['src-tauri/Cargo.toml', text => text.replace(/^version = "[^"]+"/m, `version = "${pkg.version}"`)],
  ['android/app/build.gradle', text => text.replace(/versionCode \d+/, `versionCode ${pkg.androidVersionCode}`).replace(/versionName "[^"]+"/, `versionName "${pkg.version}"`)],
  ['package-lock.json', text => {
    const lock = JSON.parse(text)
    lock.version = pkg.version
    lock.packages[''].version = pkg.version
    return JSON.stringify(lock, null, 2) + '\n'
  }],
]
const mismatches = []
for (const [path, update] of files) {
  const original = read(path), next = update(original)
  if (original.replaceAll('\r\n', '\n') === next.replaceAll('\r\n', '\n')) continue
  if (process.argv.includes('--write')) writeFileSync(resolve(root, path), next)
  else mismatches.push(path)
}
if (mismatches.length) throw new Error(`版本不一致：${mismatches.join('、')}；运行 npm run version:sync`)
console.log(`版本一致：${pkg.version} / Android ${pkg.androidVersionCode}`)
