import { describe, expect, it } from 'vitest'
import { AnimationClip, NumberKeyframeTrack, Object3D } from 'three'
import { calibratedMotion, travelRate } from '../pet/locomotion'
import { createPresetMotion, type PresetMotionBinding } from '../pet/presetMotion'
import { roamingMotion, selectedPet, getPetCatalogEntry } from '../pet/catalog'

const binding: PresetMotionBinding = { clip: 'Walk', loop: true, inPlace: true, source: 'tripo-preset', taskId: 'test', preset: 'walk', groundSpeed: .648, groundSpeedEvidence: 'test-only' }

describe('calibrated preset locomotion', () => {
  it('requires calibration and prefers walk without pretending it is run', () => {
    expect(calibratedMotion({ walk: binding })).toBe('walk')
    expect(calibratedMotion({ run: binding })).toBe('run')
    expect(calibratedMotion({ walk: binding, run: binding })).toBe('walk')
    for (const replacement of [{ groundSpeed: 0 }, { groundSpeed: NaN }, { groundSpeedEvidence: '' }, { inPlace: false }, { loop: false }]) {
      expect(calibratedMotion({ walk: { ...binding, ...replacement } })).toBeUndefined()
    }
    expect(roamingMotion(selectedPet('nailong'))).toBe('run')
    expect(roamingMotion(getPetCatalogEntry('repairer-clap-sample')!)).toBeUndefined()
  })
  it('converts CSS distance using rendered scale, independent of device pixels', () => {
    expect(travelRate(129.6, .648, 1, 280, 1.4)).toBeCloseTo(1)
    expect(travelRate(64.8, .648, 1, 280, 1.4)).toBeCloseTo(.5)
    expect(travelRate(-129.6, .648, 1, 280, 1.4)).toBeCloseTo(1)
    expect(travelRate(129.6, .648, 2, 280, 1.4)).toBeCloseTo(2)
    expect(travelRate(0, .648, 1, 280, 1.4)).toBe(0)
    expect(travelRate(100, 0, 1, 280, 1.4)).toBe(0)
    expect(travelRate(NaN, .648, 1, 280, 1.4)).toBe(0)
  })
  it('changes gait rate without restarting phase and restores preview rate', () => {
    const root = new Object3D()
    const clip = new AnimationClip('Walk', 1, [new NumberKeyframeTrack('.position[x]', [0, 1], [0, 1])])
    const motion = createPresetMotion(root, [clip], { walk: binding })
    motion.play('walk')
    motion.setTravelRate(.5)
    motion.update(.1)
    expect(root.position.x).toBeCloseTo(.05)
    motion.setTravelRate(0)
    motion.update(.1)
    expect(root.position.x).toBeCloseTo(.05)
    motion.setTravelRate(undefined)
    motion.update(.1)
    expect(root.position.x).toBeCloseTo(.15)
    motion.setReducedMotion(true)
    motion.setTravelRate(2)
    motion.update(.1)
    expect(root.position.x).toBeCloseTo(.15)
    motion.dispose()
  })
})
