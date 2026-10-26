import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspectGlb } from './pet-pipeline-audit.mjs'

function glb(document) {
  const json = Buffer.from(JSON.stringify(document).padEnd(Math.ceil(JSON.stringify(document).length / 4) * 4, ' '))
  const buffer = Buffer.alloc(20 + json.length)
  buffer.writeUInt32LE(0x46546c67, 0)
  buffer.writeUInt32LE(2, 4)
  buffer.writeUInt32LE(buffer.length, 8)
  buffer.writeUInt32LE(json.length, 12)
  buffer.writeUInt32LE(0x4e4f534a, 16)
  json.copy(buffer, 20)
  return buffer
}

test('读取真实动作名称、时长和外部依赖，不从需求推断已存在动作', () => {
  const result = inspectGlb(glb({ skins: [{}], accessors: [{ max: [11.39] }], animations: [{ name: 'OfficialClap', channels: [{}], samplers: [{ input: 0 }] }], images: [{ uri: 'texture.png' }, { uri: 'data:image/png;base64,AA==' }] }))
  assert.deepEqual(result.animations, [{ name: 'OfficialClap', channels: 1, duration: 11.39 }])
  assert.deepEqual(result.externalDependencies, ['texture.png'])
  assert.equal(result.skins, 1)
})

test('拒绝截断、伪造头和越界 JSON', () => {
  assert.throws(() => inspectGlb(Buffer.alloc(8)))
  const buffer = glb({})
  buffer.writeUInt32LE(10000, 12)
  assert.throws(() => inspectGlb(buffer))
  assert.throws(() => inspectGlb(Buffer.alloc(20)))
})

test('静态模型不凭空补出动画', () => {
  assert.deepEqual(inspectGlb(glb({})).animations, [])
})

test('区分法线贴图与彩色贴图，列出实际骨骼及图元属性', () => {
  const result = inspectGlb(glb({
    skins: [{ joints: [1, 2, 3] }],
    accessors: [{ count: 12 }, { count: 30 }],
    meshes: [{ primitives: [{ indices: 1, material: 0, attributes: { POSITION: 0, NORMAL: 2, TEXCOORD_0: 3, JOINTS_0: 4, WEIGHTS_0: 5 } }] }],
    materials: [{ normalTexture: { index: 0 } }], textures: [{ source: 0 }], images: [{ bufferView: 0 }],
  }))
  assert.equal(result.materials[0].baseColor, null)
  assert.equal(result.materials[0].normal.embedded, true)
  assert.deepEqual(result.jointsPerSkin, [3])
  assert.deepEqual(result.primitives[0], { mesh: 0, material: 0, mode: 4, vertices: 12, triangles: 10, uvSets: ['TEXCOORD_0'], hasNormals: true, hasSkinAttributes: true })
})

test('不把缺失图片引用、无 UV 或非三角图元推断为合格素材', () => {
  const result = inspectGlb(glb({
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 2 } } }],
    meshes: [{ primitives: [{ mode: 1, attributes: { POSITION: 0 } }] }], accessors: [{ count: 6 }],
  }))
  assert.equal(result.materials[0].baseColor.imageDeclared, false)
  assert.equal(result.materials[0].baseColor.embedded, false)
  assert.equal(result.primitives[0].triangles, null)
  assert.deepEqual(result.primitives[0].uvSets, [])
})

test('读取扩展图片源与纹理变换指定的 UV 集', () => {
  const result = inspectGlb(glb({ materials: [{ emissiveTexture: { index: 0, extensions: { KHR_texture_transform: { texCoord: 1 } } } }], textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }], images: [{ uri: 'data:image/ktx2;base64,AA==' }] }))
  assert.deepEqual(result.materials[0].emissive, { texture: 0, image: 0, texCoord: 1, imageDeclared: true, embedded: true })
})
