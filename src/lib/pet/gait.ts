export function footCycle(phase: number) {
  const p = ((phase % 1)+1)%1
  if (p < .6) return { forward: .025*(1-2*p/.6), lift: 0 }
  const t = (p-.6)/.4
  const eased = t*t*(3-2*t)
  return { forward: -.025+.05*eased, lift: Math.sin(Math.PI*t)**2*.022 }
}

export function approachSpeed(current: number, target: number, seconds: number) {
  const change = Math.max(0,Math.min(seconds,.05))*2.8
  return current+Math.max(-change,Math.min(change,target-current))
}

export const stridePixels = (240/1.3)*(.05/.6)*Math.sin(1.25)

export function distancePhase(distance: number, sprint = 0, canvasHeight = 240) {
  const stride = stridePixels*(1+.4*Math.max(0,Math.min(1,sprint)))*Math.max(1,canvasHeight)/240
  return Math.max(0,distance)/stride
}
