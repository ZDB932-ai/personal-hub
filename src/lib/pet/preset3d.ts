import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createPresetMotion, type PresetMotionBindings } from './presetMotion'
import { measurePresetBounds, presetFramingExtent } from './presetBounds'
import { travelRate } from './locomotion'

export interface PresetPetAsset {
  url: string
  name: string
  bindings: PresetMotionBindings
  facing?: number
}

function release(root: T.Object3D) {
  const geometry = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(), textures = new Set<T.Texture>(), skeletons = new Set<T.Skeleton>()
  root.traverse(object => {
    if (object instanceof T.Mesh) {
      geometry.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
    }
    if (object instanceof T.SkinnedMesh) skeletons.add(object.skeleton)
  })
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value)
    material.dispose()
  }
  textures.forEach(texture => texture.dispose())
  geometry.forEach(item => item.dispose())
  skeletons.forEach(skeleton => skeleton.dispose())
}

export async function createPresetPet(canvas: HTMLCanvasElement, asset: PresetPetAsset, signal: AbortSignal) {
  const loader = new GLTFLoader()
  loader.register(parser => {
    parser.textureLoader = new T.TextureLoader(loader.manager)
    return { name: 'PetImageTextures' }
  })
  const response = await fetch(asset.url, { signal })
  if (!response.ok) throw new Error('角色文件加载失败')
  const gltf = await loader.parseAsync(await response.arrayBuffer(), new URL('.', new URL(asset.url, location.href)).href)
  let renderer: T.WebGLRenderer | undefined
  let motion: ReturnType<typeof createPresetMotion> | undefined
  try {
    signal.throwIfAborted()
    const bounds = measurePresetBounds(gltf.scene, gltf.animations, asset.bindings)
    motion = createPresetMotion(gltf.scene, gltf.animations, asset.bindings)
    const extent = presetFramingExtent(bounds)
    const center = bounds.getCenter(new T.Vector3())
    const normalized = new T.Group()
    normalized.scale.setScalar(1 / extent)
    const centered = new T.Group()
    centered.position.copy(center).negate()
    centered.add(gltf.scene)
    normalized.add(centered)
    const root = new T.Group()
    root.add(normalized)
    root.rotation.y = (asset.facing ?? 0) * Math.PI / 180
    gltf.scene.traverse(object => { if (object instanceof T.SkinnedMesh) object.frustumCulled = false })
    const scene = new T.Scene()
    scene.add(root, new T.HemisphereLight(0xffffff, 0xffffff, 2))
    const key = new T.DirectionalLight(0xffffff, 2.5)
    key.position.set(-3, 4, 5)
    scene.add(key)
    renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = T.SRGBColorSpace
    renderer.toneMapping = T.NeutralToneMapping
    const camera = new T.OrthographicCamera(-.7, .7, .7, -.7, .01, 10)
    camera.position.set(0, 0, 3)
    let travelSpeed: number | undefined
    let contextLost = false
    const render = () => { if (!contextLost) renderer!.render(scene, camera) }
    const resize = new ResizeObserver(() => {
      const { width, height } = canvas.getBoundingClientRect()
      const ratio = Math.max(1, width) / Math.max(1, height)
      const half = .7 / Math.min(1, ratio)
      camera.left = -half * ratio; camera.right = half * ratio
      camera.top = half; camera.bottom = -half
      camera.updateProjectionMatrix()
      renderer!.setSize(Math.max(1, width), Math.max(1, height), false)
      render()
    })
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0, previous = 0, visible = true, disposed = false
    const tick = (now: number) => {
      frame = 0
      if (disposed || contextLost || !visible || document.hidden) return
      const binding = motion!.current ? asset.bindings[motion!.current] : undefined
      motion!.setTravelRate(travelSpeed === undefined ? undefined : travelRate(travelSpeed, binding?.groundSpeed ?? 0, extent, canvas.getBoundingClientRect().height, camera.top - camera.bottom))
      motion!.update(previous ? (now - previous) / 1000 : 0)
      previous = now
      render()
      if (motion!.current && !reduced.matches) frame = requestAnimationFrame(tick)
      else previous = 0
    }
    const schedule = () => {
      cancelAnimationFrame(frame); frame = 0; previous = 0
      motion!.setReducedMotion(reduced.matches)
      if (!disposed && !contextLost && visible && !document.hidden) frame = requestAnimationFrame(tick)
    }
    const loseContext = (event: Event) => {
      event.preventDefault()
      contextLost = true
      cancelAnimationFrame(frame); frame = 0; previous = 0
    }
    const restoreContext = () => {
      if (disposed) return
      contextLost = false
      schedule()
    }
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; schedule() })
    resize.observe(canvas)
    observer.observe(canvas)
    document.addEventListener('visibilitychange', schedule)
    reduced.addEventListener('change', schedule)
    canvas.addEventListener('webglcontextlost', loseContext)
    canvas.addEventListener('webglcontextrestored', restoreContext)
    const dispose = () => {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(frame)
      resize.disconnect(); observer.disconnect()
      document.removeEventListener('visibilitychange', schedule)
      reduced.removeEventListener('change', schedule)
      canvas.removeEventListener('webglcontextlost', loseContext)
      canvas.removeEventListener('webglcontextrestored', restoreContext)
      signal.removeEventListener('abort', dispose)
      motion!.dispose(); release(gltf.scene); renderer!.dispose()
    }
    signal.addEventListener('abort', dispose, { once: true })
    schedule()
    return {
      setMood(mood: string) { if (disposed) return false; const supported = motion!.setMood(mood); schedule(); return supported },
      setRotation(degrees: number) {
        if (disposed || !Number.isFinite(degrees)) return
        root.rotation.y = ((asset.facing ?? 0) + degrees) * Math.PI / 180
        if (!frame && visible && !document.hidden) render()
      },
      setTravelSpeed(speed: number | undefined) { travelSpeed = speed },
      get current() { return motion!.current },
      get stats() { return { triangles: renderer!.info.render.triangles, calls: renderer!.info.render.calls, textures: renderer!.info.memory.textures, clips: gltf.animations.map(clip => ({ name: clip.name, duration: clip.duration })) } },
      dispose,
    }
  } catch (error) {
    motion?.dispose(); release(gltf.scene); renderer?.dispose()
    throw error
  }
}
