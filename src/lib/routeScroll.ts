let transitioning = false
const pending = new Set<() => void>()

export function beginRouteTransition(): void {
  transitioning = true
}

export function finishRouteTransition(): void {
  transitioning = false
  for (const resolve of pending) resolve()
  pending.clear()
}

export function waitForRouteTransition(): Promise<void> {
  if (!transitioning) return Promise.resolve()
  return new Promise(resolve => pending.add(resolve))
}
