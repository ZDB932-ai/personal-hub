export function advanceRoam(x: number, direction: number, seconds: number, speed: number, min: number, max: number) {
  if (max <= min) return { x: min, direction: 1, moving: false }
  const step = Math.max(0,Math.min(seconds,.05))*Math.max(0,speed)
  const next = Math.max(min,Math.min(max,x))+direction*step
  if (next >= max) return { x: max, direction: -1, moving: true }
  if (next <= min) return { x: min, direction: 1, moving: true }
  return { x: next, direction, moving: step > 0 }
}
