export interface DesktopTodoLifecycle {
  beforeLock(): Promise<void>
  afterLock(): Promise<void>
  lockFailed(): Promise<void>
  invalidate(): void
}
let lifecycle: DesktopTodoLifecycle | undefined
export function bindDesktopTodoLifecycle(value: DesktopTodoLifecycle): () => void {
  lifecycle = value
  return () => { if (lifecycle === value) lifecycle = undefined }
}
export function beforeDesktopTodoLock(): Promise<void> { return lifecycle?.beforeLock() ?? Promise.resolve() }
export function afterDesktopTodoLock(): Promise<void> { return lifecycle?.afterLock() ?? Promise.resolve() }
export function desktopTodoLockFailed(): Promise<void> { return lifecycle?.lockFailed() ?? Promise.resolve() }
export function invalidateDesktopTodoSession(): void { lifecycle?.invalidate() }
