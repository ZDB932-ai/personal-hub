export const estimatedMinutes = (value?: number): number => Number.isInteger(value) && value! > 0 && value! <= 1440 ? value! : 30

export interface CapacityDay { date: string; capacity: number; load: number; preferred: boolean; energy: number }

export function scheduleWithinCapacity(days: CapacityDay[], count: number, minutes: number): string[] {
  const remaining = days.map(day => ({ ...day }))
  const result: string[] = []
  const duration = estimatedMinutes(minutes)
  for (let index = 0; index < count; index++) {
    const candidates = remaining.filter(day => day.capacity > 0 && day.load + duration <= day.capacity)
    candidates.sort((a, b) => a.load / a.capacity - b.load / b.capacity || Number(b.preferred) - Number(a.preferred) || a.energy - b.energy || a.date.localeCompare(b.date))
    const day = candidates[0]
    if (!day) break
    result.push(day.date)
    day.load += duration
  }
  return result
}
