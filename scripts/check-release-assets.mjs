import { readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

const model = readFileSync('public/pets/nailong-animated.glb')
assert.equal(model.toString('ascii', 0, 4), 'glTF')
assert.equal(model.readUInt32LE(4), 2)
assert.equal(model.readUInt32LE(8), model.length)
const gltf = JSON.parse(model.toString('utf8', 20, 20 + model.readUInt32LE(12)))
const animations = gltf.animations.map(item => item.name)
for (const name of ['Idle', 'Walk', 'Run', 'Wave', 'Eat', 'Shy', 'Dance', 'Peek']) assert.ok(animations.includes(name), `缺少动作 ${name}`)
assert.ok(gltf.skins.length > 0)
assert.ok(gltf.images.length > 0)
for (const image of gltf.images) assert.ok(image.bufferView !== undefined, '发布模型图片须内嵌')
for (const buffer of gltf.buffers) assert.ok(!buffer.uri, '发布模型缓冲须内嵌')
const candidates = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const forbidden = candidates.filter(path => /(?:^|\/)(?:keystore\.properties|\.env|phone-[^/]+\.bin|qa-windows-save-[^/]+\.bin)$|\.(?:keystore|jks|phub|phub-device|blend1|log)$/.test(path))
assert.deepEqual(forbidden, [], '候选文件包含本机或敏感材料')
const secret = /ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
const hits = []
let bytes = 0
for (const path of candidates) {
  const size = statSync(path).size
  bytes += size
  if (/\.(?:ts|vue|js|mjs|json|md|yml|yaml|toml|properties|ps1|py|rs)$/.test(path) && size < 2 * 1024 * 1024 && secret.test(readFileSync(path, 'utf8'))) hits.push(path)
}
assert.deepEqual(hits, [], '检测到疑似凭据，报告仅列文件名')
console.log(JSON.stringify({ passed: true, modelSha256: createHash('sha256').update(model).digest('hex'), modelBytes: model.length, animations, candidateFiles: candidates.length, candidateMiB: Number((bytes / 1024 / 1024).toFixed(2)) }, null, 2))
