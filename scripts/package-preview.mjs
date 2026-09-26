import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const output = resolve('release', `${pkg.version}-preview`)
mkdirSync(output, { recursive: true })
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean).sort()
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const source = files.map(path => ({ path, sha256: hash(path) }))
writeFileSync(join(output, 'source-manifest.json'), JSON.stringify({ version: pkg.version, baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), committed: false, files: source }, null, 2))
const list = join(output, 'source-files.txt')
writeFileSync(list, files.join('\n') + '\n')
const archive = join(output, `Personal-Hub-${pkg.version}-source.zip`)
execFileSync('tar', ['-a', '-cf', archive, '-T', list])
const artifacts = [
  [`src-tauri/target/release/bundle/nsis/Personal Hub_${pkg.version}_x64-setup.exe`, `Personal-Hub-${pkg.version}-windows-x64-setup.exe`],
  ['android/app/build/outputs/apk/release/app-release.apk', `Personal-Hub-${pkg.version}-android.apk`],
  ['android/app/build/outputs/apk/debug/app-debug.apk', `Personal-Hub-${pkg.version}-android-debug.apk`],
  ['docs/PREVIEW-RELEASE.md', 'RELEASE-NOTES.md'],
]
for (const [from, name] of artifacts) {
  if (!existsSync(from)) throw new Error(`缺少产物：${from}`)
  copyFileSync(from, join(output, name))
}
const names = [...artifacts.map(([, name]) => name), `Personal-Hub-${pkg.version}-source.zip`, 'source-manifest.json']
writeFileSync(join(output, 'SHA256SUMS.txt'), names.map(name => `${hash(join(output, name))}  ${name}`).join('\n') + '\n')
console.log(`候选包已整理：${output}`)
console.log('源码快照未提交；GitHub由所有者自行上传，已知验收边界见发布记录。')
