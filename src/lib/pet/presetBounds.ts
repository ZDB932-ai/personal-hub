import { AnimationMixer, Box3, LoopOnce, Vector3, type AnimationClip, type Object3D } from 'three'
import { validatePresetBindings, type PresetMotionBindings } from './presetMotion'

export function presetFramingExtent(bounds: Box3) {
  const coordinates = [...bounds.min.toArray(), ...bounds.max.toArray()]
  if (bounds.isEmpty() || coordinates.some(value => !Number.isFinite(value))) throw new Error('角色尺寸无效')
  const size = bounds.getSize(new Vector3())
  const extent = Math.max(size.y, Math.hypot(size.x, size.z))
  if (!Number.isFinite(extent) || extent <= 0) throw new Error('角色尺寸无效')
  return extent
}

export function measurePresetBounds(root: Object3D, clips: AnimationClip[], bindings: PresetMotionBindings) {
  const errors = validatePresetBindings(clips, bindings, root)
  if (errors.length) throw new Error(errors.join('\n'))
  root.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(root, true)
  const mixer = new AnimationMixer(root)
  const enabled = new Set(Object.values(bindings).map(binding => binding.clip))
  try {
    for (const clip of clips.filter(item => enabled.has(item.name))) {
      const action = mixer.clipAction(clip).reset().setLoop(LoopOnce, 1)
      action.clampWhenFinished = true
      action.play()
      const times = new Set(Array.from({ length: 17 }, (_, i) => clip.duration * i / 16))
      for (const track of clip.tracks) for (const time of track.times) if (time >= 0 && time <= clip.duration) times.add(time)
      for (const time of [...times].sort((a, b) => a - b)) {
        mixer.setTime(time)
        root.updateMatrixWorld(true)
        bounds.union(new Box3().setFromObject(root, true))
      }
      action.stop()
    }
    return bounds
  } finally {
    mixer.stopAllAction()
    mixer.uncacheRoot(root)
    root.updateMatrixWorld(true)
  }
}
