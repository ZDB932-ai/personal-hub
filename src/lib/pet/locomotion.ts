import type { PresetMotionBindings } from './presetMotion'

export function calibratedMotion(bindings: PresetMotionBindings): 'walk' | 'run' | undefined {
  return (['walk', 'run'] as const).find(name => {
    const binding = bindings[name]
    return binding?.loop && binding.inPlace && Number.isFinite(binding.groundSpeed) && binding.groundSpeed! > 0 && !!binding.groundSpeedEvidence?.trim()
  })
}

export function travelRate(cssSpeed: number, groundSpeed: number, extent: number, cssHeight: number, cameraHeight: number): number {
  if (![groundSpeed, extent, cssHeight, cameraHeight].every(value => Number.isFinite(value) && value > 0) || !Number.isFinite(cssSpeed)) return 0
  const pixelsPerUnit = cssHeight / cameraHeight / extent
  return Math.max(0, Math.min(4, Math.abs(cssSpeed) / (groundSpeed * pixelsPerUnit)))
}
