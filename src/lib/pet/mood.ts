export type PetMotion = 'idle' | 'walk' | 'run' | 'wave' | 'celebrate' | 'dance' | 'sleep' | 'eat' | 'jump'

export function motionForMood(mood: string): PetMotion | undefined {
  return ({ idle: 'idle', run: 'run', walk: 'walk', wave: 'wave', happy: 'celebrate', dance: 'dance', sleep: 'sleep', eat: 'eat', jump: 'jump' } as Record<string, PetMotion>)[mood]
}
