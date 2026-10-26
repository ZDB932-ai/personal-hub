import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, watchEffect } from 'vue'

const f = vi.hoisted(() => ({ db: null as any, connect: vi.fn(), run: vi.fn(), attach: vi.fn(), load: vi.fn(), save: vi.fn(), forget: vi.fn(), stop: vi.fn(), nativeStop: vi.fn() }))
vi.mock('@/stores/database', () => f.db)
vi.mock('../recordSyncHttp', () => ({ connectRecordHttp: f.connect, syncServerUrl: (url: string) => url }))
vi.mock('../recordSync', () => ({ runRecordSync: f.run, attachRecordSync: f.attach }))
vi.mock('../recordSyncCredentials', () => ({ loadRecordCredentials: f.load, saveRecordCredentials: f.save, forgetRecordCredentials: f.forget }))
vi.mock('../attachmentSyncStore', () => ({ syncAttachments: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../androidBackgroundSync', () => ({ androidBackgroundAvailable: false, androidBackgroundEnabled: ref(false), wrapAndroidBackground: async (transport: unknown) => transport, stageAndroidBackground: vi.fn(), stopAndroidBackground: f.nativeStop, refreshAndroidBackground: vi.fn() }))
const saved = { version: 1, url: 'http://localhost:8787', token: 'a'.repeat(43), vaultId: 'v', keyId: 'k', serverId: 's' }
const turn = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  f.nativeStop.mockReset().mockResolvedValue(undefined)
  if (!f.db) {
    const key = ref<object | null>(null)
    f.db = { dataEnvelope: ref({ v: 3, vaultId: 'v', keyId: 'k' }), databaseBusy: ref(false), getActiveKey: () => key.value, key }
  }
  f.connect.mockResolvedValue({ serverId: 's' })
  f.run.mockResolvedValue({ status: 'complete', pending: 0, conflicts: 0, retryAt: 0 })
  f.attach.mockReturnValue(f.stop); f.load.mockResolvedValue(null); f.save.mockResolvedValue(undefined); f.forget.mockResolvedValue(undefined)
  f.db.key.value = {}
})
afterEach(async () => {
  f.nativeStop.mockReset().mockResolvedValue(undefined)
  const session = await import('../recordSyncSession')
  await session.pauseRecordSession()
  f.db.key.value = null
})

describe('保存的同步会话', () => {
  it('后台暂停失败跨设置视图重建保留，锁定解锁不自动恢复，重试成功才显示已暂停', async () => {
    f.load.mockResolvedValue(saved)
    const session = await import('../recordSyncSession'); await turn()
    f.nativeStop.mockRejectedValueOnce(new Error('系统拒绝停止'))
    await session.pauseRecordSession()
    expect(session.recordPaused.value).toBe(true)
    expect(session.recordPausing.value).toBe(false)
    expect(session.recordStatus.value).toBe('暂停未完成')
    expect(session.recordPauseError.value).toContain('系统拒绝停止')
    const status = ref('')
    const firstView = effectScope()
    firstView.run(() => watchEffect(() => { status.value = session.recordStatus.value }))
    firstView.stop()
    const reopenedView = effectScope()
    reopenedView.run(() => watchEffect(() => { status.value = session.recordStatus.value }))
    expect(status.value).toBe('暂停未完成')
    f.db.key.value = null; f.db.key.value = {}; await turn()
    expect(f.connect).toHaveBeenCalledTimes(1)
    expect(session.recordStatus.value).toBe('暂停未完成')
    await session.pauseRecordSession()
    expect(session.recordPauseError.value).toBe('')
    expect(session.recordStatus.value).toBe('同步已暂停')
    expect(f.connect).toHaveBeenCalledTimes(1)
    expect(f.forget).not.toHaveBeenCalled()
    reopenedView.stop()
  })
  it.each(['resume', 'connect'] as const)('明确%s后旧暂停失败不能覆盖新连接', async action => {
    f.load.mockResolvedValue(saved)
    const session = await import('../recordSyncSession'); await turn()
    let reject!: (reason: Error) => void
    f.nativeStop.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail }))
    const pending = session.pauseRecordSession()
    expect(session.recordStatus.value).toBe('正在暂停同步')
    if (action === 'resume') await session.resumeRecordSession()
    else await session.connectRecordSession(saved.url, saved.token)
    reject(new Error('过时的停止失败')); await pending
    expect(session.recordPaused.value).toBe(false)
    expect(session.recordPausing.value).toBe(false)
    expect(session.recordPauseError.value).toBe('')
    expect(session.recordConnection.value).toBe(saved.url)
    expect(session.recordStatus.value).toBe('已同步（记录与附件）')
  })
  it('暂停期间锁定使旧完成失效，重新解锁后须重试确认暂停', async () => {
    f.load.mockResolvedValue(saved)
    const session = await import('../recordSyncSession'); await turn()
    let finish!: () => void
    f.nativeStop.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const pending = session.pauseRecordSession()
    f.db.key.value = null; f.db.key.value = {}; await turn()
    finish(); await pending
    expect(session.recordStatus.value).toBe('暂停未完成')
    expect(session.recordPausing.value).toBe(false)
    expect(session.recordPauseError.value).toContain('中断')
    expect(f.connect).toHaveBeenCalledTimes(1)
    await session.pauseRecordSession()
    expect(session.recordStatus.value).toBe('同步已暂停')
  })
  it('临时暂停不删除配置，锁定解锁保持暂停，手动恢复无需重输令牌', async () => {
    f.load.mockResolvedValue(saved)
    const session = await import('../recordSyncSession'); await turn()
    await session.pauseRecordSession()
    expect(session.recordStatus.value).toBe('同步已暂停')
    expect(f.forget).not.toHaveBeenCalled()
    f.db.key.value = null; f.db.key.value = {}; await turn()
    expect(f.connect).toHaveBeenCalledTimes(1)
    await session.resumeRecordSession()
    expect(session.recordPaused.value).toBe(false)
    expect(session.recordConnection.value).toBe(saved.url)
    expect(f.connect).toHaveBeenCalledTimes(2)
  })
  it('暂停等待在途任务结束，旧任务不能重新建立连接', async () => {
    f.load.mockResolvedValue(saved)
    const session = await import('../recordSyncSession'); await turn()
    let finish!: (value: unknown) => void
    f.run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const running = session.syncRecordSession(); await turn()
    const pending = session.pauseRecordSession()
    expect(session.recordStatus.value).toBe('正在暂停同步')
    expect(f.run.mock.calls.at(-1)![2]()).toBe(false)
    finish({ status: 'complete', pending: 0, conflicts: 0, retryAt: 0 })
    await running; await pending
    expect(session.recordStatus.value).toBe('同步已暂停')
    expect(session.recordConnection.value).toBe('')
    expect(f.forget).not.toHaveBeenCalled()
  })
  it('维护期间暂停，维护结束重新读取配置并恢复', async () => {
    f.load.mockResolvedValue(saved)
    const session = await import('../recordSyncSession'); await turn()
    f.db.databaseBusy.value = true
    expect(session.recordConnection.value).toBe('')
    f.db.databaseBusy.value = false; await turn()
    expect(session.recordConnection.value).toBe(saved.url)
    expect(f.connect).toHaveBeenCalledTimes(2)
  })
  it('切换配置时旧握手结果不能覆盖新连接', async () => {
    let finish!: (value: unknown) => void
    const session = await import('../recordSyncSession'); await turn()
    f.connect.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const first = session.connectRecordSession(saved.url, saved.token).catch(error => error)
    await turn()
    const second = session.connectRecordSession('http://localhost:9999', saved.token)
    finish({ serverId: 's' }); await first; await second
    expect(session.recordConnection.value).toBe('http://localhost:9999')
    expect(f.save).toHaveBeenCalledTimes(1)
  })
  it('重新加载后从加密配置恢复，并在锁定时停止', async () => {
    f.load.mockResolvedValue(saved)
    const session = await import('../recordSyncSession')
    await turn()
    expect(session.recordConnection.value).toBe(saved.url)
    expect(session.recordStatus.value).toBe('已同步（记录与附件）')
    f.db.key.value = null
    expect(session.recordConnection.value).toBe('')
    expect(f.stop).toHaveBeenCalled()
  })
  it('连接等待期间锁定不保存令牌、不重新启用连接', async () => {
    let finish!: (value: unknown) => void
    f.connect.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const session = await import('../recordSyncSession'); await turn()
    const pending = session.connectRecordSession(saved.url, saved.token)
    const rejected = expect(pending).rejects.toThrow('状态已变化')
    await turn(); f.db.key.value = null; finish({ serverId: 's' }); await rejected
    expect(f.save).not.toHaveBeenCalled(); expect(f.attach).not.toHaveBeenCalled()
  })
  it('断开删除凭据；重新解锁不再自动连接', async () => {
    const session = await import('../recordSyncSession'); await turn()
    await session.connectRecordSession(saved.url, saved.token)
    expect(f.save).toHaveBeenCalled()
    await session.disconnectRecordSession()
    expect(f.forget).toHaveBeenCalled()
    f.db.key.value = null; f.db.key.value = {}; await turn()
    expect(f.connect).toHaveBeenCalledTimes(1)
  })
  it('服务身份变化时拒绝发送保险库', async () => {
    f.load.mockResolvedValue(saved); f.connect.mockResolvedValue({ serverId: 'changed' })
    const session = await import('../recordSyncSession'); await turn()
    expect(session.recordSessionError.value).toContain('服务器身份')
    expect(f.run).not.toHaveBeenCalled()
  })
  it('删除配置失败时显示错误并保留已保存标记', async () => {
    f.load.mockResolvedValue(saved)
    const session = await import('../recordSyncSession'); await turn()
    f.forget.mockRejectedValue(new Error('磁盘失败'))
    await session.disconnectRecordSession()
    expect(session.recordConnection.value).toBe('')
    expect(session.recordSaved.value).toBe(true)
    expect(session.recordSessionError.value).toContain('移除配置失败')
  })
})
