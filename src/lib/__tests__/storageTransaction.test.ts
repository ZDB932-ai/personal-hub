import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { commitStorageTransaction, recoverStorageTransaction } from '@/lib/storageTransaction'

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: (key: string) => { values.delete(key) },
  })
})
afterEach(() => vi.unstubAllGlobals())

it('完整提交多条密文记录后删除回滚日志', () => {
  localStorage.setItem('xk.data.v2', 'old-envelope')
  commitStorageTransaction({ 'xk.data.v2': { ct: 'new-envelope' }, 'xk.sync.secure': { ct: 'new-secret' } })
  expect(JSON.parse(localStorage.getItem('xk.data.v2')!)).toEqual({ ct: 'new-envelope' })
  expect(JSON.parse(localStorage.getItem('xk.sync.secure')!)).toEqual({ ct: 'new-secret' })
  expect(localStorage.getItem('xk.storage.rollback.v1')).toBeNull()
})

it('重启恢复中断的提交，将信封和凭据同时回滚', () => {
  localStorage.setItem('xk.storage.rollback.v1', JSON.stringify({ 'xk.data.v2': 'old-envelope', 'xk.sync.secure': 'old-secret', 'xk.github.secure': null }))
  localStorage.setItem('xk.data.v2', 'new-envelope')
  localStorage.setItem('xk.sync.secure', 'new-secret')
  localStorage.setItem('xk.github.secure', 'new-github')
  recoverStorageTransaction()
  expect(localStorage.getItem('xk.data.v2')).toBe('old-envelope')
  expect(localStorage.getItem('xk.sync.secure')).toBe('old-secret')
  expect(localStorage.getItem('xk.github.secure')).toBeNull()
  expect(localStorage.getItem('xk.storage.rollback.v1')).toBeNull()
  recoverStorageTransaction()
  expect(localStorage.getItem('xk.data.v2')).toBe('old-envelope')
})

it('无法写入回滚日志时不触碰原数据', () => {
  localStorage.setItem('xk.data.v2', 'old-envelope')
  vi.mocked(localStorage.setItem).mockImplementationOnce(() => { throw new Error('quota') })
  expect(() => commitStorageTransaction({ 'xk.data.v2': 'new-envelope' })).toThrow('quota')
  expect(localStorage.getItem('xk.data.v2')).toBe('old-envelope')
})
