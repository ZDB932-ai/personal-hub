import { readFile, readdir, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, relative, isAbsolute, extname } from 'node:path'
import { pathToFileURL } from 'node:url'

export function inspectGlb(buffer) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) throw new Error('无效 GLB 文件头')
  const length = buffer.readUInt32LE(12)
  if (buffer.readUInt32LE(16) !== 0x4e4f534a || length > buffer.length - 20) throw new Error('缺少有效 GLB JSON')
  const document = JSON.parse(buffer.toString('utf8', 20, 20 + length).trim())
  const accessors = document.accessors ?? []
  const textureInfo = info => {
    if (!info) return null
    const texture = document.textures?.[info.index]
    const imageIndex = texture?.extensions?.KHR_texture_basisu?.source ?? texture?.extensions?.EXT_texture_webp?.source ?? texture?.source
    const image = document.images?.[imageIndex]
    return {
      texture: info.index,
      image: imageIndex ?? null,
      texCoord: info.extensions?.KHR_texture_transform?.texCoord ?? info.texCoord ?? 0,
      imageDeclared: !!image,
      embedded: !!image && (Number.isInteger(image.bufferView) || image.uri?.startsWith('data:') === true),
    }
  }
  return {
    meshes: (document.meshes ?? []).length,
    skins: (document.skins ?? []).length,
    jointsPerSkin: (document.skins ?? []).map(skin => (skin.joints ?? []).length),
    materials: (document.materials ?? []).map((material, index) => ({
      name: material.name ?? `未命名材质 ${index + 1}`,
      baseColor: textureInfo(material.pbrMetallicRoughness?.baseColorTexture),
      normal: textureInfo(material.normalTexture),
      metallicRoughness: textureInfo(material.pbrMetallicRoughness?.metallicRoughnessTexture),
      emissive: textureInfo(material.emissiveTexture),
    })),
    primitives: (document.meshes ?? []).flatMap((mesh, meshIndex) => (mesh.primitives ?? []).map(primitive => {
      const attributes = primitive.attributes ?? {}
      const mode = primitive.mode ?? 4
      const vertices = accessors[attributes.POSITION]?.count ?? null
      const elements = primitive.indices === undefined ? vertices : accessors[primitive.indices]?.count ?? null
      return {
        mesh: meshIndex,
        material: primitive.material ?? null,
        mode,
        vertices,
        triangles: mode === 4 && elements !== null ? elements / 3 : null,
        uvSets: Object.keys(attributes).filter(name => /^TEXCOORD_\d+$/.test(name)).sort(),
        hasNormals: attributes.NORMAL !== undefined,
        hasSkinAttributes: attributes.JOINTS_0 !== undefined && attributes.WEIGHTS_0 !== undefined,
      }
    })),
    inspectionScope: '仅读取 GLB 声明；不证明贴图可解码、UV 匹配、动作质量或运行验收。',
    animations: (document.animations ?? []).map((animation, index) => ({
      name: animation.name ?? `未命名动作 ${index + 1}`,
      channels: (animation.channels ?? []).length,
      duration: Math.max(0, ...(animation.samplers ?? []).map(sampler => accessors[sampler.input]?.max?.[0] ?? 0)),
    })),
    externalDependencies: [...(document.buffers ?? []), ...(document.images ?? [])].flatMap(item => item.uri && !item.uri.startsWith('data:') ? [item.uri] : []),
  }
}

async function containedFile(root, file) {
  const path = await realpath(resolve(root, file))
  const rel = relative(root, path)
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) throw new Error('文件路径越出资产目录')
  return path
}

export async function auditPipeline(pipelineRoot, selection = []) {
  const assetsRoot = await realpath(resolve(pipelineRoot, 'assets'))
  const entries = await readdir(assetsRoot, { withFileTypes: true })
  const assets = []
  for (const entry of entries) {
    if (!entry.isDirectory() || (selection.length && !selection.includes(entry.name))) continue
    const root = await realpath(resolve(assetsRoot, entry.name))
    let state
    try { state = JSON.parse(await readFile(await containedFile(root, 'production.json'), 'utf8')) }
    catch (error) {
      assets.push({ asset: entry.name, error: String(error), eligibleForPet: false })
      continue
    }
    const files = []
    for (const artifact of state.artifacts?.final_files ?? []) {
      const record = { path: artifact.path, verified: false }
      try {
        if (typeof artifact.path !== 'string' || !/^[a-f0-9]{64}$/i.test(artifact.sha256 ?? '')) throw new Error('缺少路径或 SHA256')
        const buffer = await readFile(await containedFile(root, artifact.path))
        record.sha256 = createHash('sha256').update(buffer).digest('hex')
        if (record.sha256 !== artifact.sha256.toLowerCase()) throw new Error('文件与生产记录哈希不一致')
        record.bytes = buffer.length
        if (extname(artifact.path).toLowerCase() === '.glb') record.glb = inspectGlb(buffer)
        record.verified = true
      } catch (error) { record.error = String(error) }
      files.push(record)
    }
    assets.push({
      asset: entry.name,
      stage: state.stage,
      status: state.status,
      intent: state.requirements?.intent,
      requestedClips: state.requirements?.clips ?? [],
      files,
      verifiedDelivery: state.stage === 'final' && state.status === 'accepted' && files.length > 0 && files.every(file => file.verified),
      eligibleForPet: false,
      next: '交付验收不等于桌宠验收；仍需核对动作来源、待机/移动能力、体型、方向、性能及应用内播放。',
    })
  }
  for (const name of selection) if (!assets.some(asset => asset.asset === name)) assets.push({ asset: name, error: '未找到资产目录', eligibleForPet: false })
  return { pipelineRoot: await realpath(pipelineRoot), assets }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [root, ...selection] = process.argv.slice(2)
  if (!root) {
    console.error('用法：npm run pet:pipeline:audit -- "E:\\Tripo pipline" [asset-id ...]')
    process.exitCode = 1
  } else {
    try { console.log(JSON.stringify(await auditPipeline(root, selection), null, 2)) }
    catch (error) { console.error(String(error)); process.exitCode = 1 }
  }
}
