import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnimationClip, Box3, BoxGeometry, Mesh, NumberKeyframeTrack } from 'three'
import { createPresetPet } from '../pet/preset3d'

const fixture = vi.hoisted(() => ({ gltf: undefined as unknown, render: vi.fn(), dispose: vi.fn() }))

vi.mock('three', async importOriginal => {
  const original = await importOriginal<typeof import('three')>()
  return {
    ...original,
    WebGLRenderer: class {
      info = { render: { triangles: 12, calls: 1 }, memory: { textures: 0 } }
      setPixelRatio() {}
      setSize() {}
      render = fixture.render
      dispose = fixture.dispose
    },
  }
})

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    register() {}
    async parseAsync() { return fixture.gltf }
  },
}))

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('preset renderer rotation', () => {
  async function setup(reduced = false, wide = false) {
    const mesh = new Mesh(new BoxGeometry(wide ? 2 : 1, 1, wide ? 2 : 1))
    fixture.gltf = {
      scene: mesh,
      animations: [new AnimationClip('Idle', 2, [new NumberKeyframeTrack('.position[x]', [0, 2], [0, wide ? 0 : 2])])],
    }
    const callbacks = new Map<number, FrameRequestCallback>()
    let sequence = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++sequence, callback); return sequence })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id))
    vi.stubGlobal('location', { href: 'http://localhost/' })
    vi.stubGlobal('devicePixelRatio', 1)
    vi.stubGlobal('document', { hidden: false, addEventListener() {}, removeEventListener() {} })
    vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }))
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }))
    const canvas = Object.assign(new EventTarget(), { getBoundingClientRect: () => ({ width: 256, height: 256 }) }) as unknown as HTMLCanvasElement
    const pet = await createPresetPet(canvas, {
      url: '/fixture.glb', name: '测试角色',
      bindings: { idle: { clip: 'Idle', loop: true, inPlace: true, source: 'tripo-preset', preset: 'idle', taskId: 'fixture' } },
    }, new AbortController().signal)
    const frame = (time: number) => {
      const pending = [...callbacks.values()]
      callbacks.clear()
      pending.forEach(callback => callback(time))
    }
    return { pet, mesh, frame, callbacks, canvas }
  }

  it('pauses on context loss and restores without advancing through the outage', async () => {
    const { pet, mesh, frame, callbacks, canvas } = await setup()
    try {
      frame(1000)
      frame(1050)
      const position = mesh.position.x
      const loss = new Event('webglcontextlost', { cancelable: true })
      canvas.dispatchEvent(loss)
      expect(loss.defaultPrevented).toBe(true)
      expect(callbacks.size).toBe(0)
      fixture.render.mockClear()
      pet.setRotation(45)
      pet.setMood('idle')
      frame(10000)
      expect(fixture.render).not.toHaveBeenCalled()
      expect(mesh.position.x).toBe(position)
      canvas.dispatchEvent(new Event('webglcontextrestored'))
      expect(callbacks.size).toBe(1)
      frame(20000)
      expect(mesh.position.x).toBe(position)
      frame(20050)
      expect(mesh.position.x).toBeCloseTo(position + .05)
    } finally { pet.dispose() }
  })

  it('restores a single static frame with reduced motion and removes context listeners on disposal', async () => {
    const { pet, frame, callbacks, canvas } = await setup(true)
    frame(1000)
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    fixture.render.mockClear()
    frame(2000)
    expect(fixture.render).toHaveBeenCalledTimes(1)
    expect(callbacks.size).toBe(0)
    pet.dispose()
    const loss = new Event('webglcontextlost', { cancelable: true })
    canvas.dispatchEvent(loss)
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(loss.defaultPrevented).toBe(false)
    expect(callbacks.size).toBe(0)
  })

  it('keeps animation time advancing while direction changes every frame', async () => {
    const { pet, mesh, frame, callbacks } = await setup()
    try {
      frame(1000)
      for (let i = 1; i <= 6; i++) {
        pet.setRotation(i * 10)
        frame(1000 + i * 50)
      }
      expect(mesh.position.x).toBeCloseTo(.3)
      expect(callbacks.size).toBe(1)
    } finally { pet.dispose() }
  })

  it('uses rotation-safe framing for a broad character at a diagonal angle', async () => {
    const { pet, mesh, frame } = await setup(false, true)
    try {
      frame(1000)
      pet.setRotation(45)
      mesh.updateWorldMatrix(true, true)
      const bounds = new Box3().setFromObject(mesh, true)
      expect(bounds.min.x).toBeCloseTo(-.5)
      expect(bounds.max.x).toBeCloseTo(.5)
      expect(mesh.parent?.parent?.scale.x).toBeCloseTo(1 / Math.sqrt(8))
    } finally { pet.dispose() }
  })

  it('coalesces repeated turns into the pending animation render', async () => {
    const { pet, frame, callbacks } = await setup()
    try {
      frame(1000)
      fixture.render.mockClear()
      pet.setRotation(10)
      pet.setRotation(20)
      pet.setRotation(30)
      expect(fixture.render).not.toHaveBeenCalled()
      expect(callbacks.size).toBe(1)
      frame(1050)
      expect(fixture.render).toHaveBeenCalledTimes(1)
      expect(callbacks.size).toBe(1)
    } finally { pet.dispose() }
  })

  it('does not restart a disposed renderer through a late mood update', async () => {
    const { pet, callbacks } = await setup()
    pet.dispose()
    expect(pet.setMood('idle')).toBe(false)
    expect(callbacks.size).toBe(0)
  })

  it('renders turning while reduced motion is paused without restarting the animation loop', async () => {
    const { pet, mesh, frame, callbacks } = await setup(true)
    frame(1000)
    expect(callbacks.size).toBe(0)
    fixture.render.mockClear()
    pet.setRotation(90)
    expect(fixture.render).toHaveBeenCalledTimes(1)
    expect(mesh.position.x).toBe(0)
    expect(callbacks.size).toBe(0)
    pet.dispose()
    fixture.render.mockClear()
    pet.setRotation(180)
    expect(fixture.render).not.toHaveBeenCalled()
  })
})
