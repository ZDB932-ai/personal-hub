export interface TodoWindowBounds { x: number; y: number; width: number; height: number; scale: number }
export type TodoWindowBoundsPatch = { x: number; y: number } | { width: number; height: number }
export type TodoWindowGestureKind = 'move' | 'resize'

export function createTodoWindowGesture(backend: {
  read: () => Promise<TodoWindowBounds>
  write: (bounds: TodoWindowBoundsPatch) => Promise<unknown>
}, onError: (reason: unknown) => void) {
  type Gesture = { pointer: number; x: number; y: number; kind: TodoWindowGestureKind; origin: Promise<TodoWindowBounds>; latest?: { x: number; y: number }; ended: boolean; flushing: boolean; moved: boolean }
  let active: Gesture | undefined, disposed = false, queue: Promise<void> = Promise.resolve()
  function flush(gesture: Gesture) {
    if (gesture.flushing || disposed) return
    gesture.flushing = true
    queue = queue.then(async () => {
      const origin = await gesture.origin
      while (!disposed && active === gesture && gesture.latest) {
        const latest = gesture.latest; gesture.latest = undefined
        const dx = (latest.x - gesture.x) * origin.scale, dy = (latest.y - gesture.y) * origin.scale
        await backend.write(gesture.kind === 'move'
          ? { x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) }
          : { width: Math.round(Math.max(300 * origin.scale, Math.min(900 * origin.scale, origin.width + dx))), height: Math.round(Math.max(240 * origin.scale, Math.min(1400 * origin.scale, origin.height + dy))) })
      }
    }).catch(reason => { if (!disposed && active === gesture) { active = undefined; onError(reason) } }).finally(() => {
      gesture.flushing = false
      if (!disposed && active === gesture) {
        if (gesture.latest) flush(gesture)
        else if (gesture.ended) active = undefined
      }
    })
  }
  function update(pointer: number, x: number, y: number) {
    const gesture = active
    if (!gesture || gesture.pointer !== pointer || disposed || gesture.ended) return
    if (!gesture.moved && Math.hypot(x - gesture.x, y - gesture.y) < 3) return
    gesture.moved = true; gesture.latest = { x, y }; flush(gesture)
  }
  return {
    begin(pointer: number, x: number, y: number, kind: TodoWindowGestureKind) {
      if (disposed) return
      const gesture: Gesture = { pointer, x, y, kind, origin: queue.then(() => backend.read()), ended: false, flushing: false, moved: false }
      active = gesture
      void gesture.origin.catch(reason => { if (!disposed && active === gesture) { active = undefined; onError(reason) } })
    },
    update,
    end(pointer: number, x: number, y: number) {
      if (!active || active.pointer !== pointer) return
      update(pointer, x, y)
      const gesture = active
      gesture.ended = true
      if (!gesture.flushing) active = undefined
    },
    cancel(pointer: number) { if (active?.pointer === pointer) active = undefined },
    dispose() { disposed = true; active = undefined },
    async settled() { while (true) { const pending = queue; await pending; if (pending === queue) return } },
  }
}
