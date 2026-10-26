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
  it('does not overwrite a newer window event with a delayed initial snapshot', async () => {
    let resolveSnapshot!: (value: unknown) => void
    mocks.invoke.mockImplementationOnce(() => new Promise(resolve => { resolveSnapshot = resolve }))
    const { initializePet, petPreferences } = await import('../pet')
    const initial = initializePet()
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1))
    mocks.listen.mock.calls[0]![1]({ payload: { enabled: true, background: true, reminders: true, character: 'nailong' } })
    resolveSnapshot({ enabled: false, background: false, reminders: false, character: 'nailong' })
    await initial
    expect(petPreferences).toEqual({ enabled: true, background: true, reminders: true, character: 'nailong' })
  })

  it('removes the failed initialization subscription before retrying', async () => {
    const unlisten = vi.fn()
    mocks.listen.mockResolvedValue(unlisten)
    mocks.invoke.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ enabled: false, background: false, reminders: false })
    const { initializePet } = await import('../pet')
    await expect(initializePet()).rejects.toThrow('offline')
    expect(unlisten).toHaveBeenCalledTimes(1)
    await initializePet()
    expect(mocks.listen).toHaveBeenCalledTimes(2)
    expect(unlisten).toHaveBeenCalledTimes(1)
  })
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
    expect(petPreferences).toEqual({ enabled: false, background: true, reminders: false, character: 'nailong' })
  })

  it('preserves unrelated preferences and does not claim success after a failed save', async () => {
    const { initializePet, configurePet, petPreferences } = await import('../pet')
    mocks.invoke.mockResolvedValueOnce({ enabled: false, background: true, reminders: false, character: 'nailong' })
    await initializePet()
    mocks.invoke.mockRejectedValueOnce(new Error('disk full'))
    await expect(configurePet({ enabled: true })).rejects.toThrow('disk full')
    expect(petPreferences.enabled).toBe(false)
    expect(mocks.invoke).toHaveBeenCalledWith('pet_configure', { preferences: { enabled: true } })
    mocks.invoke.mockResolvedValueOnce({ enabled: true, background: true, reminders: false, character: 'nailong' })
    await configurePet({ enabled: true })
    expect(petPreferences.enabled).toBe(true)
  })

  it('rejects unknown characters before saving', async () => {
    const { configurePet, petPreferences } = await import('../pet')
    await expect(configurePet({ character: 'unknown-preview' })).rejects.toThrow('尚不可用')
    await expect(configurePet({ character: 'unknown' })).rejects.toThrow('尚不可用')
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(petPreferences.character).toBe('nailong')
  })

  it('saves the available identity and normalizes stale identities on load', async () => {
    mocks.invoke.mockResolvedValueOnce({ enabled: true, background: true, reminders: true, character: 'removed' })
    const { initializePet, configurePet, petPreferences } = await import('../pet')
    await initializePet()
    expect(petPreferences.character).toBe('nailong')
    mocks.invoke.mockResolvedValueOnce({ enabled: true, background: true, reminders: true, character: 'nailong' })
    await configurePet({ character: 'nailong' })
    expect(mocks.invoke).toHaveBeenLastCalledWith('pet_configure', { preferences: { character: 'nailong' } })
  })

  it('keeps a newer cross-window event when an earlier command returns', async () => {
    const initial = { enabled: false, background: false, reminders: false, character: 'nailong' }
    mocks.invoke.mockResolvedValueOnce(initial)
    const { initializePet, configurePet, petPreferences } = await import('../pet')
    await initializePet()
    let finish!: (value: unknown) => void
    mocks.invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const saving = configurePet({ enabled: true })
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2))
    mocks.listen.mock.calls[0]![1]({ payload: { ...initial, enabled: true, background: true } })
    finish({ ...initial, enabled: true })
    await saving
    expect(petPreferences.background).toBe(true)
  })

  it('serializes rapid edits and continues after a rejected save', async () => {
    const initial = { enabled: false, background: false, reminders: false, character: 'nailong' }
    mocks.invoke.mockResolvedValueOnce(initial)
    const { initializePet, configurePet, petPreferences } = await import('../pet')
    await initializePet()
    let reject!: (error: Error) => void
    mocks.invoke.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
    mocks.invoke.mockResolvedValueOnce({ ...initial, background: true })
    const first = configurePet({ enabled: true })
    const failure = expect(first).rejects.toThrow('disk full')
    const second = configurePet({ background: true })
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2))
    reject(new Error('disk full'))
    await failure
    await second
    expect(petPreferences).toEqual({ ...initial, background: true })
    expect(mocks.invoke).toHaveBeenLastCalledWith('pet_configure', { preferences: { background: true } })
  })
})
