import { afterEach, expect, it, vi } from 'vitest'
import { RecordSyncScheduler } from '../recordSyncScheduler'

afterEach(() => vi.useRealTimers())

it('自动遵循持久化退避时间，成功后不持续空转', async () => {
  vi.useFakeTimers()
  const run = vi.fn()
    .mockImplementationOnce(async () => ({ status: 'retry', pending: 1, conflicts: 0, retryAt: Date.now() + 5000 }))
    .mockResolvedValue({ status: 'complete', pending: 0, conflicts: 0, retryAt: 0 })
  const scheduler = new RecordSyncScheduler(run)
  scheduler.request()
  await vi.advanceTimersByTimeAsync(300)
  expect(run).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(4999)
  expect(run).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(run).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(60000)
  expect(run).toHaveBeenCalledTimes(2)
  scheduler.stop()
})

it('运行中重复唤醒只补跑一次，冲突等待用户处理，不无限重试', async () => {
  vi.useFakeTimers()
  let complete!: (value: unknown) => void
  const run = vi.fn().mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    .mockResolvedValue({ status: 'pending', pending: 1, conflicts: 1, retryAt: 0 })
  const scheduler = new RecordSyncScheduler(run)
  scheduler.request()
  await vi.advanceTimersByTimeAsync(300)
  scheduler.request(); scheduler.request()
  complete({ status: 'complete', pending: 0, conflicts: 0, retryAt: 0 })
  await vi.advanceTimersByTimeAsync(60000)
  expect(run).toHaveBeenCalledTimes(2)
  scheduler.stop()
})

it('锁定或停止后不执行待安排的发送，协议错误交给用户处理', async () => {
  vi.useFakeTimers()
  let allowed = false
  const error = vi.fn()
  const run = vi.fn().mockRejectedValue(new Error('invalid-record'))
  const scheduler = new RecordSyncScheduler(run, () => allowed, error)
  scheduler.request()
  await vi.advanceTimersByTimeAsync(300)
  expect(run).not.toHaveBeenCalled()
  allowed = true
  scheduler.request()
  await vi.advanceTimersByTimeAsync(300)
  expect(error).toHaveBeenCalledTimes(1)
  scheduler.request(); scheduler.stop()
  await vi.advanceTimersByTimeAsync(60000)
  expect(run).toHaveBeenCalledTimes(1)
})
