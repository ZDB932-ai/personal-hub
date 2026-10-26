import { AnimationMixer, LoopOnce, LoopRepeat, PropertyBinding, type AnimationAction, type AnimationClip, type Object3D } from 'three'

import { motionForMood, type PetMotion } from './mood'
export { motionForMood, type PetMotion } from './mood'

export interface PresetMotionBinding {
  clip: string
  loop: boolean
  source: 'tripo-preset'
  preset: string
  taskId: string
  inPlace: boolean
  speed?: number
  groundSpeed?: number
  groundSpeedEvidence?: string
}

export type PresetMotionBindings = Partial<Record<PetMotion, PresetMotionBinding>>

function trackTarget(node: object, parsed: ReturnType<typeof PropertyBinding.parseTrackName>): Record<string, unknown> | undefined {
  let target: unknown = node
  if (parsed.objectName) {
    const object = node as unknown as Record<string, unknown>
    if (parsed.objectName === 'bones') {
      const skeleton = object.skeleton as { bones?: Object3D[] } | undefined
      const bones = skeleton?.bones
      if (!bones || parsed.objectIndex === undefined) return undefined
      target = bones.find(bone => bone.name === parsed.objectIndex) ?? (bones as unknown as Record<string, Object3D>)[parsed.objectIndex]
    } else {
      const material = object.material as Record<string, unknown> | undefined
      target = parsed.objectName === 'materials' ? material?.materials
        : parsed.objectName === 'map' ? object.map ?? material?.map : object[parsed.objectName]
      if (parsed.objectIndex !== undefined && target !== null && typeof target === 'object') {
        target = (target as Record<string, unknown>)[parsed.objectIndex]
      }
    }
  }
  return target !== null && typeof target === 'object' ? target as Record<string, unknown> : undefined
}

export function validatePresetBindings(clips: readonly AnimationClip[], bindings: PresetMotionBindings, root?: Object3D): string[] {
  const errors: string[] = []
  const names = clips.map(clip => clip.name)
  for (const [motion, binding] of Object.entries(bindings)) {
    const matching = clips.filter(clip => clip.name === binding.clip)
    if (!names.includes(binding.clip)) errors.push(`${motion}: 缺少动作 ${binding.clip}`)
    if (matching.length > 1) errors.push(`${motion}: 动作名不唯一 ${binding.clip}`)
    if (matching.some(clip => !Number.isFinite(clip.duration) || clip.duration <= 0 || !clip.tracks.length)) errors.push(`${motion}: 动作无有效时长或轨道`)
    for (const clip of matching) for (const track of clip.tracks) {
      const cubic = (track as unknown as { createInterpolant?: { isInterpolantFactoryMethodGLTFCubicSpline?: boolean } }).createInterpolant?.isInterpolantFactoryMethodGLTFCubicSpline === true
      const width = track.getValueSize() / (cubic ? 3 : 1)
      if (!Number.isInteger(width) || width <= 0) errors.push(`${motion}: 动作轨道分量数量无效 ${track.name}`)
      if (!track.times.length || !track.values.length || Array.from(track.times).some((time, i) => !Number.isFinite(time) || time < 0 || (i > 0 && time < track.times[i - 1]!)) || Array.from(track.values).some(value => typeof value === 'number' && !Number.isFinite(value))) {
        errors.push(`${motion}: 动作轨道数据无效 ${track.name}`)
      }
      if (root) {
        try {
          const parsed = PropertyBinding.parseTrackName(track.name)
          const node = PropertyBinding.findNode(root, parsed.nodeName)
          if (!node) errors.push(`${motion}: 动作目标不存在 ${track.name}`)
          else {
            const properties = trackTarget(node, parsed)
            if (!properties) {
              errors.push(`${motion}: 动作子目标不存在 ${track.name}`)
              continue
            }
            const value = properties[parsed.propertyName]
            if (value === undefined) errors.push(`${motion}: 动作属性不存在 ${track.name}`)
            else if (['position', 'scale', 'quaternion', 'rotation'].includes(parsed.propertyName)) {
              const expected = parsed.propertyIndex === undefined ? parsed.propertyName === 'quaternion' ? 4 : 3 : 1
              const components = parsed.propertyName === 'quaternion' ? ['x', 'y', 'z', 'w'] : ['x', 'y', 'z']
              if (width !== expected || (parsed.propertyIndex !== undefined && !components.includes(parsed.propertyIndex))) {
                errors.push(`${motion}: 骨骼变换通道不匹配 ${track.name}`)
              }
            }
            else if (parsed.propertyName === 'morphTargetInfluences') {
              const dictionary = properties.morphTargetDictionary as Record<string, number> | undefined
              const key = parsed.propertyIndex
              const index = key === undefined ? undefined : dictionary && Object.hasOwn(dictionary, key) ? dictionary[key] : /^(0|[1-9]\d*)$/.test(key) ? Number(key) : NaN
              if (!Array.isArray(value) || !value.length || (key !== undefined && (index === undefined || !Number.isInteger(index) || index < 0 || index >= value.length || width !== 1)) || (key === undefined && width !== value.length)) {
                errors.push(`${motion}: 面部形态通道不匹配 ${track.name}`)
              }
            }
          }
        } catch {
          errors.push(`${motion}: 动作轨道路径无效 ${track.name}`)
        }
      }
    }
    if (binding.source !== 'tripo-preset' || !binding.taskId.trim() || !binding.preset.trim()) errors.push(`${motion}: 缺少 Tripo 预设来源`)
    if (binding.speed !== undefined && (!Number.isFinite(binding.speed) || binding.speed <= 0 || binding.speed > 4)) errors.push(`${motion}: 播放速度超出范围`)
    if (binding.groundSpeed !== undefined && (!Number.isFinite(binding.groundSpeed) || binding.groundSpeed <= 0 || !binding.groundSpeedEvidence?.trim())) errors.push(`${motion}: 缺少有效移动速度校准`)
    if ((motion === 'walk' || motion === 'run') && binding.groundSpeed !== undefined && (!binding.inPlace || !binding.loop)) errors.push(`${motion}: 桌面移动要求原地循环动作`)
  }
  return errors
}

export function createPresetMotion(root: Object3D, clips: AnimationClip[], bindings: PresetMotionBindings) {
  const errors = validatePresetBindings(clips, bindings, root)
  if (errors.length) throw new Error(errors.join('\n'))
  const mixer = new AnimationMixer(root)
  let active: AnimationAction | undefined
  let current: PetMotion | undefined
  let disposed = false
  let reduced = false
  let pendingRest = false
  const actions = new Map<PetMotion, AnimationAction>()
  const retiring = new Map<AnimationAction, number>()
  for (const [motion, binding] of Object.entries(bindings)) {
    const clip = clips.find(clip => clip.name === binding.clip)!
    actions.set(motion as PetMotion, mixer.clipAction(clip))
  }

  function play(motion: PetMotion, restart = true): boolean {
    if (disposed) return false
    const action = actions.get(motion)
    const binding = bindings[motion]
    if (!action || !binding) return false
    if (active === action && current === motion && !restart) return true
    const previous = active
    retiring.delete(action)
    pendingRest = false
    action.stopFading().reset().setEffectiveWeight(1).setEffectiveTimeScale(binding.speed ?? 1)
    action.setLoop(binding.loop ? LoopRepeat : LoopOnce, binding.loop ? Infinity : 1)
    action.clampWhenFinished = !binding.loop
    action.paused = reduced
    action.play()
    if (previous && previous !== action) {
      if (reduced) previous.stop()
      else {
        previous.fadeOut(.2)
        retiring.set(previous, mixer.time + .2)
        action.fadeIn(.2)
      }
    }
    active = action
    current = motion
    mixer.update(0)
    return true
  }

  function rest() {
    if (!play('idle', false)) {
      mixer.stopAllAction()
      retiring.clear()
      active = undefined
      current = undefined
    }
  }

  const finished = (event: { action: AnimationAction }) => {
    if (event.action === active && current !== 'idle') pendingRest = true
  }
  mixer.addEventListener('finished', finished)
  rest()

  return {
    supports(motion: PetMotion) { return !disposed && actions.has(motion) },
    play,
    setTravelRate(rate: number | undefined) {
      if (disposed || !active || (current !== 'walk' && current !== 'run')) return
      active.setEffectiveTimeScale(rate === undefined ? bindings[current]!.speed ?? 1 : Number.isFinite(rate) ? Math.max(0, Math.min(4, rate)) : 0)
    },
    setMood(mood: string) {
      if (disposed) return false
      const motion = motionForMood(mood)
      if (motion && play(motion, motion !== 'idle' && motion !== 'walk' && motion !== 'run')) return true
      rest()
      return false
    },
    setReducedMotion(value: boolean) {
      reduced = value
      if (value) {
        for (const action of retiring.keys()) action.stop()
        retiring.clear()
        active?.stopFading().setEffectiveWeight(1)
        mixer.update(0)
      }
      if (active) active.paused = value
    },
    update(dt: number) {
      if (!disposed && !reduced && Number.isFinite(dt) && dt > 0) {
        mixer.update(Math.min(dt, .1))
        for (const [action, deadline] of retiring) {
          if (mixer.time + Number.EPSILON >= deadline) {
            action.stop()
            retiring.delete(action)
          }
        }
        if (pendingRest) {
          pendingRest = false
          rest()
          mixer.update(0)
        }
      }
    },
    get current() { return current },
    dispose() {
      disposed = true
      pendingRest = false
      mixer.removeEventListener('finished', finished)
      mixer.stopAllAction()
      mixer.uncacheRoot(root)
      actions.clear()
      retiring.clear()
      active = undefined
      current = undefined
    },
  }
}
