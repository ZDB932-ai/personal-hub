export type PetMood = 'idle' | 'happy' | 'dance' | 'eat' | 'sleep' | 'wave' | 'drag' | 'belly' | 'run' | 'peek' | 'shy' | 'spin'

const durations: Record<PetMood, number> = { idle: 0, happy: 2.8, dance: 6, eat: 4.6, sleep: Infinity, wave: 2.8, drag: Infinity, belly: 2.8, run: Infinity, peek:3.6, shy:3.6, spin:3.6 }

export class PetActionBlend {
  mood: PetMood = 'idle'
  elapsed = 0
  readonly weights = Object.fromEntries(Object.keys(durations).map(key => [key, new Spring(0, 70, 18)])) as Record<PetMood, Spring>
  trigger(value: string) {
    this.mood = Object.hasOwn(durations, value) ? value as PetMood : 'idle'
    this.elapsed = 0
  }
  step(seconds: number): Record<PetMood, number> {
    this.elapsed += Math.min(Math.max(seconds, 0), .05)
    const result = {} as Record<PetMood, number>
    for (const key of Object.keys(durations) as PetMood[]) {
      const target = key === this.mood ? actionEnvelope(this.elapsed, durations[key]) : 0
      result[key] = this.weights[key].step(target, seconds)
    }
    return result
  }
}

export class Spring {
  value: number
  velocity = 0
  constructor(value = 0, public stiffness = 150, public damping = 20) { this.value = value }
  step(target: number, seconds: number): number {
    const dt = Math.min(Math.max(seconds, 0), .05)
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      this.velocity += ((target - this.value) * this.stiffness - this.velocity * this.damping) * h
      this.value += this.velocity * h
    }
    return this.value
  }
}

export function actionEnvelope(time: number, duration: number): number {
  if (time <= 0 || time >= duration) return 0
  const enter = Math.min(time / .3, 1)
  const exit = Math.min((duration - time) / .6, 1)
  const smooth = (x: number) => x * x * (3 - 2 * x)
  return smooth(enter) * smooth(exit)
}
