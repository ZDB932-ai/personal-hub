import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
const fixture = vi.hoisted(() => ({ visible: false, db: null as any }))
vi.mock('@/stores/database', () => fixture.db)
vi.mock('../desktopTodo', () => ({ desktopTodoVisible: () => fixture.visible }))
vi.mock('@/stores/offline', () => ({ offlineSyncError: { value: '' } }))
let stop: (() => void) | undefined
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers()
  const key = ref<object | null>({})
  fixture.db = { getActiveKey: () => key.value, key, dataEnvelope: ref({ v: 3 }), databaseBusy: ref(false), onDataSaved: () => () => {}, flushPendingSave: vi.fn(), publishEnvelope: vi.fn(), snapshotPayload: vi.fn(), updateSyncPayload: vi.fn() }
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'hidden' }))
  vi.stubGlobal('navigator', { onLine: true })
  fixture.visible = false
})
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })
it('主窗隐藏后，小窗可见时继续轮询，关闭小窗或锁定后停止轮询', async () => {
  const run = vi.fn().mockResolvedValue({ status: 'complete', pending: 0, conflicts: 0, retryAt: 0 })
  const { attachRecordSync } = await import('../recordSync')
  stop = attachRecordSync({} as never, run)
  await vi.advanceTimersByTimeAsync(400)
  run.mockClear()
  await vi.advanceTimersByTimeAsync(61000)
  expect(run).not.toHaveBeenCalled()
  fixture.visible = true
  window.dispatchEvent(new Event('desktop-todo-wake'))
  await vi.advanceTimersByTimeAsync(400)
  expect(run).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(61000)
  expect(run.mock.calls.length).toBeGreaterThan(1)
  fixture.visible = false; run.mockClear()
  await vi.advanceTimersByTimeAsync(61000)
  expect(run).not.toHaveBeenCalled()
  fixture.visible = true; fixture.db.key.value = null
  window.dispatchEvent(new Event('desktop-todo-wake'))
  await vi.advanceTimersByTimeAsync(61000)
  expect(run).not.toHaveBeenCalled()
})
