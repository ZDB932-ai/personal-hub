import { expect, it, vi } from 'vitest'
import { createTodoWindowGesture, type TodoWindowBounds } from '../desktopTodoGesture'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const bounds = { x: 100, y: 200, width: 540, height: 720, scale: 1.5 }

it('快速拖动松开时，即使原生起点尚未返回也保存最终位置', async () => {
  const origin = deferred<TodoWindowBounds>(), write = vi.fn().mockResolvedValue(undefined)
  const gesture = createTodoWindowGesture({ read: () => origin.promise, write }, vi.fn())
  gesture.begin(1, 20, 30, 'move')
  gesture.update(1, 45, 50); gesture.end(1, 70, 80)
  expect(write).not.toHaveBeenCalled()
  origin.resolve(bounds); await gesture.settled()
  expect(write.mock.calls).toEqual([[{ x: 175, y: 275 }]])
})

it('新手势等待在途写入，旧手势剩余移动不会覆盖新位置', async () => {
  const firstWrite = deferred<void>(), started = deferred<void>()
  let current = { ...bounds }
  const write = vi.fn(async patch => {
    if (write.mock.calls.length === 1) { started.resolve(); await firstWrite.promise }
    current = { ...current, ...patch }
  })
  const gesture = createTodoWindowGesture({ read: async () => ({ ...current }), write }, vi.fn())
  gesture.begin(1, 0, 0, 'move'); gesture.update(1, 10, 20)
  await started.promise
  gesture.update(1, 100, 100)
  gesture.begin(2, 0, 0, 'move'); gesture.end(2, 20, 10)
  firstWrite.resolve(); await gesture.settled()
  expect(write.mock.calls).toEqual([[{ x: 115, y: 230 }], [{ x: 145, y: 245 }]])
})

it('取消或卸载后不会应用迟到的起点查询', async () => {
  for (const cancel of ['cancel', 'dispose'] as const) {
    const origin = deferred<TodoWindowBounds>(), write = vi.fn().mockResolvedValue(undefined)
    const gesture = createTodoWindowGesture({ read: () => origin.promise, write }, vi.fn())
    gesture.begin(1, 0, 0, 'move'); gesture.update(1, 50, 50)
    if (cancel === 'cancel') gesture.cancel(1); else gesture.dispose()
    origin.resolve(bounds); await gesture.settled()
    expect(write).not.toHaveBeenCalled()
  }
})

it('单击不移动，缩放按屏幕比例限制最小尺寸', async () => {
  const write = vi.fn().mockResolvedValue(undefined)
  const gesture = createTodoWindowGesture({ read: async () => bounds, write }, vi.fn())
  gesture.begin(1, 0, 0, 'move'); gesture.end(1, 1, 1)
  await gesture.settled(); expect(write).not.toHaveBeenCalled()
  gesture.begin(2, 0, 0, 'resize'); gesture.end(2, -1000, -1000)
  await gesture.settled(); expect(write).toHaveBeenLastCalledWith({ width: 450, height: 360 })
})

it('拖动返回原点时仍提交原位置，连续移动只保留最新目标', async () => {
  const blocked = deferred<void>(), started = deferred<void>()
  const write = vi.fn(async () => { if (write.mock.calls.length === 1) { started.resolve(); await blocked.promise } })
  const gesture = createTodoWindowGesture({ read: async () => bounds, write }, vi.fn())
  gesture.begin(1, 0, 0, 'move'); gesture.update(1, 10, 10)
  await started.promise
  gesture.update(1, 20, 20); gesture.update(1, 30, 30); gesture.end(1, 0, 0)
  blocked.resolve(); await gesture.settled()
  expect(write.mock.calls).toEqual([[{ x: 115, y: 215 }], [{ x: 100, y: 200 }]])
})
