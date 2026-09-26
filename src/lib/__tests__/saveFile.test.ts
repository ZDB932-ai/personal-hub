import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  platform: 'android', desktop: false,
  begin: vi.fn(), append: vi.fn(), finish: vi.fn(), abort: vi.fn(),
  save: vi.fn(), writeFile: vi.fn(), prepare: vi.fn(),
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => mocks.platform }, registerPlugin: () => mocks }))
vi.mock('../desktop', () => ({ isTauriDesktop: () => mocks.desktop, prepareDesktopDialog: mocks.prepare }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }))
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: mocks.writeFile }))
import { saveFile } from '../saveFile'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.platform = 'android'
  mocks.desktop = false
  mocks.begin.mockResolvedValue({ cancelled: false, id: 'session' })
  mocks.append.mockResolvedValue(undefined)
  mocks.finish.mockResolvedValue(undefined)
  mocks.abort.mockResolvedValue(undefined)
})

describe('原生文件保存', () => {
  it('Windows 主窗口无法恢复时不打开文件选择器或写入', async () => {
    mocks.platform = 'web'
    mocks.desktop = true
    mocks.prepare.mockRejectedValue(new Error('无法显示主窗口'))
    await expect(saveFile(new Blob(['secret']), 'test.bin')).rejects.toThrow('无法显示主窗口')
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })
  it('按顺序分块传输二进制并在完整写入后完成', async () => {
    const bytes = Uint8Array.from({ length: 1024 * 1024 + 13 }, (_, i) => i % 251)
    expect(await saveFile(new Blob([bytes]), '文件.bin')).toBe(true)
    const joined = new Uint8Array(bytes.length)
    for (const [chunk] of mocks.append.mock.calls) joined.set(Uint8Array.from(atob(chunk.data), c => c.charCodeAt(0)), chunk.offset)
    const digest = async (data: Uint8Array<ArrayBuffer>) => new Uint8Array(await crypto.subtle.digest('SHA-256', data))
    expect(await digest(joined)).toEqual(await digest(bytes))
    expect(mocks.append.mock.calls.map(([chunk]) => chunk.offset)).toEqual([0, 524288, 1048576])
    expect(mocks.finish).toHaveBeenCalledWith({ id: 'session' })
    expect(mocks.abort).not.toHaveBeenCalled()
  })

  it('取消系统选择后不写入、不报告成功，并允许再次保存', async () => {
    mocks.begin.mockResolvedValueOnce({ cancelled: true })
    expect(await saveFile(new Blob(['test']), 'test.txt')).toBe(false)
    expect(mocks.append).not.toHaveBeenCalled()
    expect(mocks.finish).not.toHaveBeenCalled()
    expect(await saveFile(new Blob([]), 'empty.txt')).toBe(true)
  })

  it('写入中失败会清理目标，不再发送后续分块', async () => {
    mocks.append.mockRejectedValueOnce(new Error('空间不足'))
    await expect(saveFile(new Blob([new Uint8Array(1048576)]), 'file.bin')).rejects.toThrow('空间不足')
    expect(mocks.append).toHaveBeenCalledTimes(1)
    expect(mocks.abort).toHaveBeenCalledWith({ id: 'session' })
    expect(mocks.finish).not.toHaveBeenCalled()
  })

  it('系统选择期间锁定会删除空目标而不写明文', async () => {
    let unlocked = true
    mocks.begin.mockImplementationOnce(async () => { unlocked = false; return { id: 'session', cancelled: false } })
    await expect(saveFile(new Blob(['secret']), 'file.txt', () => unlocked)).rejects.toThrow('已锁定')
    expect(mocks.append).not.toHaveBeenCalled()
    expect(mocks.abort).toHaveBeenCalled()
  })

  it('分块间锁定停止后续写入，清理失败会明确提示', async () => {
    let unlocked = true
    mocks.append.mockImplementationOnce(async () => { unlocked = false })
    mocks.abort.mockRejectedValueOnce(new Error('提供方不支持删除'))
    await expect(saveFile(new Blob([new Uint8Array(1048576)]), 'file.bin', () => unlocked)).rejects.toThrow('无法清理')
    expect(mocks.append).toHaveBeenCalledTimes(1)
    expect(mocks.finish).not.toHaveBeenCalled()
  })

  it('Windows 只写系统对话框选择的路径，取消时不写入', async () => {
    mocks.platform = 'web'; mocks.desktop = true
    mocks.save.mockResolvedValueOnce(null).mockResolvedValueOnce('C:\\QA\\chosen.bin')
    expect(await saveFile(new Blob(['test']), '../test.bin')).toBe(false)
    expect(mocks.writeFile).not.toHaveBeenCalled()
    expect(await saveFile(new Blob(['test']), '../test.bin')).toBe(true)
    expect(mocks.save).toHaveBeenCalledWith({ title: '保存文件', defaultPath: '.._test.bin' })
    expect(mocks.writeFile).toHaveBeenCalledWith('C:\\QA\\chosen.bin', new TextEncoder().encode('test'))
  })

  it('Windows 选择期间锁定不覆盖目标文件', async () => {
    mocks.platform = 'web'; mocks.desktop = true
    let unlocked = true
    mocks.save.mockImplementationOnce(async () => { unlocked = false; return 'C:\\QA\\file.txt' })
    await expect(saveFile(new Blob(['secret']), 'file.txt', () => unlocked)).rejects.toThrow('已锁定')
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })
})
