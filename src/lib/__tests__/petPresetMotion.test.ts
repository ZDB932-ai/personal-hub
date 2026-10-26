import { describe, expect, it, vi } from 'vitest'
import { AnimationClip, AnimationMixer, NumberKeyframeTrack, Object3D, Mesh, BufferGeometry, Float32BufferAttribute, Bone, Skeleton, SkinnedMesh } from 'three'
import { createPresetMotion, validatePresetBindings, type PresetMotionBinding } from '../pet/presetMotion'

const binding: PresetMotionBinding = { clip: 'OfficialClap', loop: false, source: 'tripo-preset', preset: 'clap', taskId: 'verified-task', inPlace: true }
const clip = () => new AnimationClip('OfficialClap', 1, [new NumberKeyframeTrack('.position[x]', [0, .5, 1], [0, 1, 0])])

describe('Tripo preset playback', () => {
  it('validates nested skeleton targets and their transform components before playback', () => {
    const root = new SkinnedMesh()
    root.name = 'Robot'
    const bone = new Bone()
    bone.name = 'Spine'
    root.add(bone)
    root.bind(new Skeleton([bone]))
    const check = (name: string, values = [0, 1]) => validatePresetBindings([
      new AnimationClip('OfficialClap', 1, [new NumberKeyframeTrack(name, [0, 1], values)]),
    ], { celebrate: binding }, root)
    expect(check('Robot.bones[Spine].position[x]')).toEqual([])
    expect(check('Robot.bones[0].position[x]')).toEqual([])
    expect(check('Robot.bones[Missing].position[x]')).not.toHaveLength(0)
    expect(check('Robot.bones[8].position[x]')).not.toHaveLength(0)
    expect(check('Robot.bones[00].position[x]')).not.toHaveLength(0)
    expect(check('Robot.bones[0e0].position[x]')).not.toHaveLength(0)
    expect(check('Robot.bones[Spine].missing')).not.toHaveLength(0)
    expect(check('Robot.bones[Spine].position[w]')).not.toHaveLength(0)
    expect(check('Robot.bones[Spine].quaternion', [0, 0, 0, 0, 0, 0])).not.toHaveLength(0)
    const motion = createPresetMotion(root, [new AnimationClip('OfficialClap', 1, [
      new NumberKeyframeTrack('Robot.bones[Spine].position[x]', [0, 1], [0, 1]),
    ])], { celebrate: binding })
    motion.play('celebrate')
    motion.update(.1)
    expect(bone.position.x).toBeCloseTo(.1)
    motion.dispose()
    expect(bone.position.x).toBe(0)
    root.skeleton.dispose()
    root.geometry.dispose()
  })

  it('rejects skeletal tracks on a node without a skeleton', () => {
    const root = new Object3D()
    const invalid = new AnimationClip('OfficialClap', 1, [new NumberKeyframeTrack('.bones[Spine].position[x]', [0, 1], [0, 1])])
    expect(validatePresetBindings([invalid], { celebrate: binding }, root)).not.toHaveLength(0)
    expect(() => createPresetMotion(root, [invalid], { celebrate: binding })).toThrow('动作子目标不存在')
  })

  function face() {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3))
    geometry.morphAttributes.position = [new Float32BufferAttribute([0, 1, 0], 3)]
    const mesh = new Mesh(geometry)
    mesh.name = 'Face'
    mesh.morphTargetDictionary = { Close: 0 }
    return mesh
  }

  it('plays exported morph weights, pauses them and restores the original value on completion', () => {
    const root = face()
    root.morphTargetInfluences![0] = .15
    const facial = new AnimationClip('OfficialClap', .4, [new NumberKeyframeTrack('Face.morphTargetInfluences', [0, .2, .4], [0, 1, 0])])
    const motion = createPresetMotion(root, [facial], { celebrate: binding })
    motion.play('celebrate')
    motion.update(.1)
    expect(root.morphTargetInfluences![0]).toBeCloseTo(.5)
    motion.setReducedMotion(true)
    motion.update(3)
    expect(root.morphTargetInfluences![0]).toBeCloseTo(.5)
    motion.setReducedMotion(false)
    for (let i = 0; i < 5; i++) motion.update(.1)
    expect(root.morphTargetInfluences![0]).toBeCloseTo(.15)
    motion.dispose()
    root.geometry.dispose()
  })

  it('rejects missing animation targets, lost morphs and mismatched morph widths before playback', () => {
    const root = face()
    const check = (name: string, values: number[]) => validatePresetBindings([new AnimationClip('OfficialClap', 1, [new NumberKeyframeTrack(name, [0, 1], values)])], { celebrate: binding }, root)
    expect(check('Missing.morphTargetInfluences', [0, 1])).not.toHaveLength(0)
    expect(check('Face.morphTargetInfluences[Missing]', [0, 1])).not.toHaveLength(0)
    expect(check('Face.morphTargetInfluences', [0, 0, 1, 1])).not.toHaveLength(0)
    expect(check('Face.morphTargetInfluences[Close]', [0, 1])).toHaveLength(0)
    expect(check('Face.morphTargetInfluences[Close]', [0, 0, 1, 1])).not.toHaveLength(0)
    expect(check('Face.morphTargetInfluences[0]', [0, 0, 1, 1])).not.toHaveLength(0)
    expect(check('Face.morphTargetInfluences[00]', [0, 1])).not.toHaveLength(0)
    expect(check('Face.morphTargetInfluences[0e0]', [0, 1])).not.toHaveLength(0)
    expect(check('Face.morphTargetInfluences[0]', [0, 1])).toHaveLength(0)
    expect(check('Face.morphTargetInfluences', [0, 1])).toHaveLength(0)
    root.geometry.dispose()
  })

  it('rejects non-finite values and reversed time samples', () => {
    const invalid = new AnimationClip('OfficialClap', 1, [new NumberKeyframeTrack('.position[x]', [0, 1, .5], [0, NaN, 1])])
    expect(validatePresetBindings([invalid], { celebrate: binding })).not.toHaveLength(0)
  })

  it('rejects truncated transform tracks and invalid component names', () => {
    const root = new Object3D()
    const check = (name: string, values: number[]) => validatePresetBindings([new AnimationClip('OfficialClap', 1, [new NumberKeyframeTrack(name, [0, 1], values)])], { celebrate: binding }, root)
    expect(check('.position', [0, 0, 0, 1, 1])).not.toHaveLength(0)
    expect(check('.quaternion', [0, 0, 0, 0, 0, 0])).not.toHaveLength(0)
    expect(check('.scale[w]', [1, 1])).not.toHaveLength(0)
    expect(check('.position[x]', [0, 1])).toHaveLength(0)
    expect(check('.position', [0, 0, 0, 1, 1, 1])).toHaveLength(0)
    expect(check('.quaternion', [0, 0, 0, 1, 0, 0, 0, 1])).toHaveLength(0)
  })

  it('accepts cubic skeletal transforms with three tangent/value blocks', () => {
    const root = new Object3D()
    const track = new NumberKeyframeTrack('.position', [0, 1], Array(18).fill(0))
    Object.assign(track, { createInterpolant: Object.assign(() => undefined, { isInterpolantFactoryMethodGLTFCubicSpline: true }) })
    expect(validatePresetBindings([new AnimationClip('OfficialClap', 1, [track])], { celebrate: binding }, root)).toHaveLength(0)
  })

  it('accepts glTF cubic morph tracks with tangent triplets', () => {
    const root = face()
    const track = new NumberKeyframeTrack('Face.morphTargetInfluences', [0, 1], [0, 0, 0, 0, 1, 0])
    Object.assign(track, { createInterpolant: Object.assign(() => undefined, { isInterpolantFactoryMethodGLTFCubicSpline: true }) })
    const cubic = new AnimationClip('OfficialClap', 1, [track])
    expect(validatePresetBindings([cubic], { celebrate: binding }, root)).toHaveLength(0)
    root.geometry.dispose()
  })

  it('releases facial weights when interrupted by a skeletal-only action', () => {
    const root = face()
    root.morphTargetInfluences![0] = .2
    const facial = new AnimationClip('FaceOnly', 1, [new NumberKeyframeTrack('Face.morphTargetInfluences', [0, 1], [1, 1])])
    const body = new AnimationClip('BodyOnly', 1, [new NumberKeyframeTrack('Face.position[x]', [0, 1], [0, 1])])
    const motion = createPresetMotion(root, [facial, body], { celebrate: { ...binding, clip: 'FaceOnly' }, jump: { ...binding, clip: 'BodyOnly' } })
    motion.play('celebrate')
    motion.update(.1)
    expect(root.morphTargetInfluences![0]).toBe(1)
    motion.play('jump')
    for (let i = 0; i < 3; i++) motion.update(.1)
    expect(motion.current).toBe('jump')
    expect(root.morphTargetInfluences![0]).toBeCloseTo(.2)
    motion.dispose()
    expect(root.position.x).toBe(0)
    root.geometry.dispose()
  })

  it('reconfigures loop and speed when two moods share the same exported clip', () => {
    const root = new Object3D()
    const motion = createPresetMotion(root, [clip()], { idle: { ...binding, loop: true }, celebrate: { ...binding, speed: 2 } })
    motion.play('celebrate')
    for (let i = 0; i < 6; i++) motion.update(.1)
    expect(motion.current).toBe('idle')
    for (let i = 0; i < 25; i++) motion.update(.1)
    expect(motion.current).toBe('idle')
    motion.dispose()
  })
  it('unschedules faded actions and does not retire a replayed action', () => {
    const spy = vi.spyOn(AnimationMixer.prototype, 'clipAction')
    const idle = new AnimationClip('Rest', 2, [new NumberKeyframeTrack('.position[x]', [0, 2], [0, 0])])
    const motion = createPresetMotion(new Object3D(), [clip(), idle], { celebrate: binding, idle: { ...binding, clip: 'Rest', loop: true } })
    const [clapAction, idleAction] = spy.mock.results.map(result => result.value)
    try {
      motion.play('celebrate')
      motion.update(.1)
      motion.update(.1)
      expect(idleAction.isScheduled()).toBe(false)
      motion.play('idle')
      motion.update(.1)
      motion.play('celebrate')
      motion.update(.1)
      motion.update(.1)
      expect(clapAction.isScheduled()).toBe(true)
      expect(idleAction.isScheduled()).toBe(false)
      motion.play('idle')
      motion.setReducedMotion(true)
      expect(clapAction.isScheduled()).toBe(false)
      expect(idleAction.getEffectiveWeight()).toBe(1)
    } finally {
      motion.dispose()
      spy.mockRestore()
    }
  })
  it('restores the rest pose after completion rather than retaining the final keyframe', () => {
    const root = new Object3D()
    root.position.x = 3
    const endingAway = new AnimationClip('OfficialClap', .2, [new NumberKeyframeTrack('.position[x]', [0, .2], [3, 9])])
    const motion = createPresetMotion(root, [endingAway], { celebrate: binding })
    motion.play('celebrate')
    motion.update(.1)
    motion.update(.1)
    expect(motion.current).toBeUndefined()
    expect(root.position.x).toBe(3)
    motion.update(.1)
    expect(root.position.x).toBe(3)
    motion.dispose()
  })

  it('does not let an interrupted action completion cancel its replacement', () => {
    const root = new Object3D()
    const short = new AnimationClip('Short', .05, [new NumberKeyframeTrack('.position[x]', [0, .05], [0, 1])])
    const motion = createPresetMotion(root, [clip(), short], { celebrate: binding, wave: { ...binding, clip: 'Short' } })
    motion.play('wave')
    motion.play('celebrate')
    motion.update(.1)
    expect(motion.current).toBe('celebrate')
    motion.dispose()
  })
  it('plays actual clip tracks without character-specific bone names', () => {
    const root = new Object3D()
    const motion = createPresetMotion(root, [clip()], { celebrate: binding })
    expect(motion.setMood('happy')).toBe(true)
    motion.update(.1)
    expect(root.position.x).toBeCloseTo(.2)
    motion.dispose()
  })
  it('does not pretend a clap-only asset can walk, wave or eat', () => {
    const motion = createPresetMotion(new Object3D(), [clip()], { celebrate: binding })
    expect(motion.supports('walk')).toBe(false)
    expect(motion.setMood('wave')).toBe(false)
    expect(motion.setMood('eat')).toBe(false)
    expect(motion.current).toBeUndefined()
    motion.dispose()
  })
  it('does not enable an excluded greeting even when its clip remains in the asset', () => {
    const root = new Object3D()
    const idle = new AnimationClip('Idle', 1, [new NumberKeyframeTrack('.position[x]', [0, 1], [0, 0])])
    const greeting = new AnimationClip('Greeting', 1, [new NumberKeyframeTrack('.position[x]', [0, 1], [0, 10])])
    const motion = createPresetMotion(root, [idle, greeting], { idle: { ...binding, clip: 'Idle', loop: true } })
    expect(motion.supports('wave')).toBe(false)
    expect(motion.setMood('wave')).toBe(false)
    motion.update(.1)
    expect(motion.current).toBe('idle')
    expect(root.position.x).toBe(0)
    motion.dispose()
  })
  it('returns to a real idle clip after a one-shot finishes', () => {
    const idle = new AnimationClip('Rest', 2, [new NumberKeyframeTrack('.position[x]', [0, 2], [0, 0])])
    const motion = createPresetMotion(new Object3D(), [clip(), idle], { celebrate: binding, idle: { ...binding, clip: 'Rest', loop: true } })
    motion.play('celebrate')
    for (let i = 0; i < 15; i++) motion.update(.1)
    expect(motion.current).toBe('idle')
    motion.dispose()
  })
  it('honors reduced motion and resumes without advancing hidden time', () => {
    const root = new Object3D()
    const motion = createPresetMotion(root, [clip()], { celebrate: binding })
    motion.play('celebrate')
    motion.update(.1)
    motion.setReducedMotion(true)
    motion.update(60)
    expect(root.position.x).toBeCloseTo(.2)
    motion.setReducedMotion(false)
    motion.update(.1)
    expect(root.position.x).toBeCloseTo(.4)
    motion.dispose()
    expect(motion.play('celebrate')).toBe(false)
  })
  it('rejects missing clips, ambiguous names, absent provenance and root-moving locomotion', () => {
    expect(validatePresetBindings([], { celebrate: binding })).not.toHaveLength(0)
    expect(validatePresetBindings([clip(), clip()], { celebrate: binding })).not.toHaveLength(0)
    expect(validatePresetBindings([clip()], { celebrate: { ...binding, taskId: '' } })).not.toHaveLength(0)
    expect(validatePresetBindings([clip()], { run: { ...binding, loop: true, inPlace: false } })).toHaveLength(0)
    expect(validatePresetBindings([clip()], { run: { ...binding, loop: true, inPlace: false, groundSpeed: 1, groundSpeedEvidence: 'test' } })).not.toHaveLength(0)
    expect(validatePresetBindings([clip()], { walk: binding })).toHaveLength(0)
    expect(validatePresetBindings([clip()], { walk: { ...binding, groundSpeed: 1, groundSpeedEvidence: 'test' } })).not.toHaveLength(0)
  })
})
