import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn(), desktop: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))
vi.mock('../desktop', () => ({ isTauriDesktop: mocks.desktop }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.desktop.mockReturnValue(true)
  mocks.listen.mockResolvedValue(() => {})
})

describe('desktop pet preferences', () => {
  it('does not invoke desktop APIs on the web', async () => {
    mocks.desktop.mockReturnValue(false)
    const { initializePet } = await import('../pet')
    await initializePet()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.listen).not.toHaveBeenCalled()
  })

  it('subscribes before loading saved preferences and shares initialization', async () => {
    mocks.invoke.mockResolvedValue({ enabled: true, background: false, reminders: true })
    const { initializePet, petPreferences } = await import('../pet')
    await Promise.all([initializePet(), initializePet()])
    expect(mocks.listen).toHaveBeenCalledTimes(1)
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    expect(petPreferences.enabled).toBe(true)
    mocks.listen.mock.calls[0]![1]({ payload: { enabled: false, background: true, reminders: false } })
    expect(petPreferences).toEqual({ enabled: false, background: true, reminders: false })
  })

  it('preserves unrelated preferences and does not claim success after a failed save', async () => {
    const { configurePet, petPreferences } = await import('../pet')
    petPreferences.background = true
    mocks.invoke.mockRejectedValueOnce(new Error('disk full'))
    await expect(configurePet({ enabled: true })).rejects.toThrow('disk full')
    expect(petPreferences.enabled).toBe(false)
    expect(mocks.invoke).toHaveBeenCalledWith('pet_configure', { preferences: { enabled: true, background: true, reminders: false } })
    mocks.invoke.mockResolvedValueOnce(undefined)
    await configurePet({ enabled: true })
    expect(petPreferences.enabled).toBe(true)
  })
})
