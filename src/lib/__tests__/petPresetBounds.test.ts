import { describe, expect, it } from 'vitest'
import { AnimationClip, Box3, BoxGeometry, Mesh, NumberKeyframeTrack, Vector3 } from 'three'
import { measurePresetBounds, presetFramingExtent } from '../pet/presetBounds'
import type { PresetMotionBinding } from '../pet/presetMotion'

const binding: PresetMotionBinding = { clip: 'Jump', loop: false, source: 'tripo-preset', preset: 'jump', taskId: 'fixture', inPlace: true }
const track = (name: string, times: number[], values: number[]) => new AnimationClip(name, 1, [new NumberKeyframeTrack('.position[y]', times, values)])

describe('pet enabled-action framing', () => {
  it('keeps every horizontal corner inside the normalized frame at all yaw angles', () => {
    const bounds = new Box3(new Vector3(3, -1, 5), new Vector3(5, 0, 7))
    const center = bounds.getCenter(new Vector3())
    const extent = presetFramingExtent(bounds)
    expect(extent).toBeCloseTo(Math.sqrt(8))
    for (let degrees = 0; degrees < 360; degrees += 5) {
      for (const x of [bounds.min.x, bounds.max.x]) for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new Vector3(x, 0, z).sub(center).divideScalar(extent).applyAxisAngle(new Vector3(0, 1, 0), degrees * Math.PI / 180)
        expect(Math.abs(corner.x)).toBeLessThanOrEqual(.5 + 1e-12)
        expect(Math.abs(corner.z)).toBeLessThanOrEqual(.5 + 1e-12)
      }
    }
  })

  it('preserves height-based scale for tall characters and rejects invalid bounds', () => {
    expect(presetFramingExtent(new Box3(new Vector3(-.2, 0, -.2), new Vector3(.2, 2, .2)))).toBe(2)
    expect(() => presetFramingExtent(new Box3())).toThrow('角色尺寸无效')
    expect(() => presetFramingExtent(new Box3(new Vector3(), new Vector3()))).toThrow('角色尺寸无效')
    expect(() => presetFramingExtent(new Box3(new Vector3(), new Vector3(Infinity, 1, 1)))).toThrow('角色尺寸无效')
    expect(() => presetFramingExtent(new Box3(new Vector3(NaN, 0, 0), new Vector3(1, 1, 1)))).toThrow('角色尺寸无效')
  })

  it('includes the terminal pose without looping it to the start and restores the source', () => {
    const root = new Mesh(new BoxGeometry(1, 1, 1))
    root.position.y = 2
    const bounds = measurePresetBounds(root, [track('Jump', [0, 1], [0, 10])], { jump: binding })
    expect(bounds.max.y).toBeCloseTo(10.5)
    expect(root.position.y).toBe(2)
    expect(root.matrixWorld.elements[13]).toBe(2)
    root.geometry.dispose()
  })

  it('samples brief keyed extremes and ignores unbound greeting or rejected clips', () => {
    const root = new Mesh(new BoxGeometry(1, 1, 1))
    const bounds = measurePresetBounds(root, [track('Jump', [0, .031, .032, 1], [0, 5, 0, 0]), track('ExcludedGreeting', [0, 1], [0, 100])], { jump: binding })
    expect(bounds.max.y).toBeCloseTo(5.5)
    expect(root.position.y).toBe(0)
    root.geometry.dispose()
  })

  it('rejects invalid bound clips before any sampling mutation', () => {
    const root = new Mesh(new BoxGeometry(1, 1, 1))
    root.position.y = 7
    const invalid = new AnimationClip('Jump', 1, [new NumberKeyframeTrack('Missing.position[y]', [0, 1], [0, 2])])
    expect(() => measurePresetBounds(root, [invalid], { jump: binding })).toThrow('动作目标不存在')
    expect(root.position.y).toBe(7)
    root.geometry.dispose()
  })
})
