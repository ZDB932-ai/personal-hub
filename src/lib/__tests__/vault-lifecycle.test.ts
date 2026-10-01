import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { StoredBlob } from '@/lib/docdb'
import type { DataEnvelope, VaultPayload } from '@/types'

const fixture = vi.hoisted(() => ({
  blobs: new Map<string, StoredBlob>(),
  putFailure: false,
  onDecrypt: undefined as (() => Promise<void>) | undefined,
  onEncrypt: undefined as (() => Promise<void>) | undefined,
}))

vi.mock('@/lib/docdb', () => ({
  putBlob: async (id: string, value: StoredBlob) => {
    if (fixture.putFailure) throw new Error('模拟附件写入失败')
    fixture.blobs.set(id, value)
  },
  getBlob: async (id: string) => fixture.blobs.get(id),
  deleteBlob: async (id: string) => { fixture.blobs.delete(id) },
}))
vi.mock('@/lib/biometric', () => ({ biometricEnabled: () => false, biometricStoreSecret: vi.fn(), biometricClear: vi.fn(async () => {}) }))
vi.mock('@/lib/crypto', async (original) => {
  const actual = await original<typeof import('@/lib/crypto')>()
  return {
    ...actual,
    newKdfParams: () => ({ ...actual.newKdfParams(), memKiB: 8192, timeCost: 1, parallelism: 1 }),
    decryptJSON: async (...args: Parameters<typeof actual.decryptJSON>) => {
      const hook = fixture.onDecrypt
      fixture.onDecrypt = undefined
      if (hook) await hook()
      return actual.decryptJSON(...args)
    },
    encryptJSON: async (...args: Parameters<typeof actual.encryptJSON>) => {
      const hook = fixture.onEncrypt
      fixture.onEncrypt = undefined
      if (hook) await hook()
      return actual.encryptJSON(...args)
    },
  }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  fixture.blobs.clear()
  fixture.putFailure = false
  fixture.onDecrypt = undefined
  fixture.onEncrypt = undefined
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { storage.set(key, value) }),
    removeItem: (key: string) => { storage.delete(key) },
  })
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn(), confirm: vi.fn(() => false) })
  vi.stubGlobal('indexedDB', new IDBFactory())
  await (await import('@/lib/vaultRepository')).initializeVaultRepository()
})

afterEach(async () => {
  fixture.onDecrypt = undefined
  fixture.onEncrypt = undefined
  const { lockApp } = await import('@/stores/lock')
  await lockApp()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function setup() {
  const lock = await import('@/stores/lock')
  const db = await import('@/stores/database')
  const docs = await import('@/stores/docs')
  const crypto = await import('@/lib/crypto')
  const { profile } = await import('@/stores/profile')
  await lock.setupLock('old-password', '')
  return { lock, db, docs, crypto, profile }
}

async function readSaved() {
  const { decryptJSON } = await import('@/lib/crypto')
  const { getActiveKey } = await import('@/lib/keyring')
  const { readRepository } = await import('@/lib/vaultRepository')
  const env = readRepository<DataEnvelope>('xk.data.v2')!
  return decryptJSON<VaultPayload>(getActiveKey()!, env.ivB64, env.ctB64)
}

describe('主密码与附件迁移', () => {
  it('已删除附件的历史在改密、重启解锁和恢复后仍可读取', async () => {
    const { lock, db, docs } = await setup()
    const meta = await docs.importDoc(new File(['恢复文件内容'], 'recovery.txt', { type: 'text/plain' }))
    await db.flushPendingSave()
    await docs.removeDoc(meta.id)
    await db.flushPendingSave()
    expect((await readSaved()).recoveryItems?.find(item => item.sourceId === meta.id)?.reason).toBe('deleted')
    expect(await lock.changePassword('old-password', 'new-password', '')).toEqual({ ok: true })
    await lock.lockApp()
    expect(await lock.unlockApp('new-password')).toBe(true)
    const history = (await import('@/stores/recovery')).recoveryItems.value.find(item => item.sourceId === meta.id)!
    const id = await db.restoreRecovery(history.id)
    const restored = docs.docMetas.value.find(item => item.id === id)!
    expect(new TextDecoder().decode(await docs.openDocBuffer(restored))).toBe('恢复文件内容')
    await lock.lockApp()
    expect(await lock.unlockApp('new-password')).toBe(true)
    expect(new TextDecoder().decode(await docs.openDocBuffer(docs.docMetas.value[0]))).toBe('恢复文件内容')
  })
  it('改密并重新解锁后，附件和三类连接凭据仍可解密', async () => {
    const { lock, db, docs, crypto } = await setup()
    const meta = await docs.importDoc(new File(['附件内容'], 'test.txt', { type: 'text/plain' }))
    const oldBlobId = meta.id
    for (const key of ['xk.sync.secure', 'xk.github.secure', 'xk.ai.secrets.v1']) {
      await (await import('@/lib/vaultRepository')).commitRepository({ [key]: await crypto.encryptJSON(db.getActiveKey()!, { secret: key }) })
    }
    const saved = vi.fn()
    db.onDataSaved(saved)
    expect(await lock.changePassword('old-password', 'new-password', '新提示')).toEqual({ ok: true })
    expect(saved).toHaveBeenCalled()
    expect(docs.docMetas.value[0].id).toBe(meta.id)
    expect(docs.docMetas.value[0].blobId).not.toBe(oldBlobId)
    expect(fixture.blobs.has(oldBlobId)).toBe(false)
    await lock.lockApp()
    expect(await lock.unlockApp('old-password')).toBe(false)
    expect(await lock.unlockApp('new-password')).toBe(true)
    expect(new TextDecoder().decode(await docs.openDocBuffer(docs.docMetas.value[0]))).toBe('附件内容')
    for (const key of ['xk.sync.secure', 'xk.github.secure', 'xk.ai.secrets.v1']) {
      const encrypted = (await import('@/lib/vaultRepository')).readRepository<{ ivB64: string; ctB64: string }>(key as 'xk.sync.secure')!
      expect(await crypto.decryptJSON(db.getActiveKey()!, encrypted.ivB64, encrypted.ctB64)).toEqual({ secret: key })
    }
    expect(lock.lockHint.value).toBe('新提示')
  })

  it('附件写入失败时保留原密码、原文件和元数据', async () => {
    const { lock, docs } = await setup()
    const meta = await docs.importDoc(new File(['原内容'], 'test.txt'))
    fixture.putFailure = true
    expect((await lock.changePassword('old-password', 'new-password', '')).ok).toBe(false)
    expect(docs.docMetas.value[0].blobId).toBeUndefined()
    expect(new TextDecoder().decode(await docs.openDocBuffer(meta))).toBe('原内容')
    expect(fixture.blobs.size).toBe(1)
    await lock.lockApp()
    expect(await lock.unlockApp('old-password')).toBe(true)
  })

  it('本地存储提交失败时回滚凭据并清理暂存附件', async () => {
    const { lock, db, docs, crypto } = await setup()
    const meta = await docs.importDoc(new File(['原内容'], 'test.txt'))
    const repository = await import('@/lib/vaultRepository')
    const secret = await crypto.encryptJSON(db.getActiveKey()!, 'credential')
    await repository.commitRepository({ 'xk.sync.secure': secret })
    vi.spyOn(repository.vaultRepository, 'commit').mockRejectedValueOnce(new Error('模拟配额不足'))
    expect((await lock.changePassword('old-password', 'new-password', '')).ok).toBe(false)
    expect(repository.readRepository('xk.sync.secure')).toEqual(secret)
    expect(fixture.blobs.size).toBe(1)
    expect(new TextDecoder().decode(await docs.openDocBuffer(meta))).toBe('原内容')
  })

  it('缺少本机文件的云端元数据不会阻止改密', async () => {
    const { lock, docs } = await setup()
    const meta = await docs.importDoc(new File(['内容'], 'test.txt'))
    fixture.blobs.delete(meta.id)
    expect((await lock.changePassword('old-password', 'new-password', '')).ok).toBe(true)
    expect(docs.docMetas.value[0].id).toBe(meta.id)
  })

  it('改密期间锁定会等待迁移完成，再清除密钥和明文', async () => {
    const { lock, db, docs } = await setup()
    await docs.importDoc(new File(['等待迁移'], 'test.txt'))
    const gate = deferred<void>()
    const started = deferred<void>()
    fixture.onDecrypt = async () => { started.resolve(); await gate.promise }
    const changing = lock.changePassword('old-password', 'new-password', '')
    await started.promise
    const locking = lock.lockApp()
    expect(lock.isGated.value).toBe(true)
    gate.resolve()
    expect(await changing).toEqual({ ok: true })
    await locking
    expect(db.getActiveKey()).toBeNull()
    expect(docs.docMetas.value).toHaveLength(0)
    expect(await lock.unlockApp('new-password')).toBe(true)
    expect(new TextDecoder().decode(await docs.openDocBuffer(docs.docMetas.value[0]))).toBe('等待迁移')
  })

  it('改密过程中数据变化时取消提交，保留旧密码和新修改', async () => {
    const { lock, db, docs, profile } = await setup()
    const meta = await docs.importDoc(new File(['原附件'], 'test.txt'))
    await db.flushPendingSave()
    fixture.onEncrypt = async () => { profile.name = '并发修改' }
    expect((await lock.changePassword('old-password', 'new-password', '')).ok).toBe(false)
    expect(profile.name).toBe('并发修改')
    expect(fixture.blobs.size).toBe(1)
    expect(new TextDecoder().decode(await docs.openDocBuffer(meta))).toBe('原附件')
    await lock.lockApp()
    expect(await lock.unlockApp('old-password')).toBe(true)
    expect(profile.name).toBe('并发修改')
  })

  it('改密后导出的附件备份可使用另一主密码恢复', async () => {
    const { lock, db, docs, profile } = await setup()
    await docs.importDoc(new File(['备份附件内容'], 'test.txt'))
    expect((await lock.changePassword('old-password', 'backup-password', '')).ok).toBe(true)
    let exported!: Blob
    const originalCreateObjectURL = URL.createObjectURL
    URL.createObjectURL = (blob: Blob) => { exported = blob; return 'blob:test-export' }
    vi.stubGlobal('document', { createElement: () => ({ click: vi.fn(), remove: vi.fn() }), body: { appendChild: vi.fn() } })
    try {
      const { exportBackup, applyBackup, parseBackup } = await import('@/lib/backup')
      profile.name = '导出前立即修改'
      await exportBackup(true)
      const backup = await parseBackup(new File([exported], 'backup.phub'))
      expect(backup.docs).toHaveLength(1)
      expect(backup.docs[0].id).toBe(docs.docMetas.value[0].blobId)
      expect((await lock.changePassword('backup-password', 'restore-password', '')).ok).toBe(true)
      fixture.blobs.clear()
      profile.name = '恢复前的内容'
      await db.flushPendingSave()
      await applyBackup(backup, 'backup-password')
      expect(profile.name).toBe('导出前立即修改')
      expect(new TextDecoder().decode(await docs.openDocBuffer(docs.docMetas.value[0]))).toBe('备份附件内容')
      await lock.lockApp()
      expect(await lock.unlockApp('restore-password')).toBe(true)
      await docs.removeDoc(docs.docMetas.value[0].id)
      await db.flushPendingSave()
      expect(docs.docMetas.value).toHaveLength(0)
      expect(fixture.blobs.size).toBeGreaterThan(0)
      expect((await readSaved()).recoveryItems?.some(item => item.kind === 'docMetas' && item.reason === 'deleted')).toBe(true)
    } finally {
      URL.createObjectURL = originalCreateObjectURL
    }
  })
})

describe('逐条同步与真实本机存储', () => {
  it('通过事务数据库发送、拉取、显示冲突并保存用户选择，重载后保留游标', async () => {
    const { lock, db, profile } = await setup()
    expect((await lock.changePassword('old-password', 'old-password', '', true)).ok).toBe(true)
    const { RehearsalServer, RehearsalStorage } = await import('@/lib/syncRehearsal')
    const { RecordSyncEngine } = await import('@/lib/recordSyncEngine')
    const { runRecordSync, chooseSyncConflict } = await import('@/lib/recordSync')
    const server = new RehearsalServer(2)
    await runRecordSync(server)
    const remote = new RehearsalStorage({}, db.getActiveKey()!, 'other-device')
    await remote.initialize(db.snapshotPayload())
    const remoteEngine = new RecordSyncEngine(remote, server, db.dataEnvelope.value as import('@/types').WrappedEnvelope, db.getActiveKey()!)
    await remoteEngine.run()
    await remote.update(payload => { payload.profile.name = '另一设备的修改' })
    await remoteEngine.run()
    await runRecordSync(server)
    expect(profile.name).toBe('另一设备的修改')
    profile.name = '本机冲突修改'
    await remote.update(payload => { payload.profile.name = '远端冲突修改' })
    await remoteEngine.run()
    expect((await runRecordSync(server)).conflicts).toBe(1)
    const { offlineConflicts } = await import('@/stores/offline')
    expect(offlineConflicts.value).toHaveLength(1)
    const conflict = offlineConflicts.value[0]
    await chooseSyncConflict(conflict.remote.entity, conflict.remote.revision, conflict.operation.operationId, 'remote')
    expect(profile.name).toBe('远端冲突修改')
    expect(offlineConflicts.value).toHaveLength(0)
    const sync = (await readSaved()).offlineJournal!.sync
    await lock.lockApp()
    expect(offlineConflicts.value).toHaveLength(0)
    vi.resetModules()
    await (await import('@/lib/vaultRepository')).initializeVaultRepository()
    const reopened = await import('@/stores/lock')
    expect(await reopened.unlockApp('old-password')).toBe(true)
    expect((await readSaved()).offlineJournal!.sync).toEqual(sync)
    expect((await import('@/stores/profile')).profile.name).toBe('远端冲突修改')
  })

  it('加密同步状态期间的本机编辑不会被覆盖，失败后仍可落盘', async () => {
    const { lock, db, profile } = await setup()
    expect((await lock.changePassword('old-password', 'old-password', '', true)).ok).toBe(true)
    fixture.onEncrypt = async () => { profile.name = '不能丢失的并发修改' }
    await expect(db.updateSyncPayload(payload => { payload.profile.name = '远端名字' })).rejects.toThrow('数据发生变化')
    expect(profile.name).toBe('不能丢失的并发修改')
    await db.flushPendingSave()
    expect((await readSaved()).profile.name).toBe('不能丢失的并发修改')
  })

  it('事务已提交但尚未发布时发生编辑，保留本机编辑并合并其他远端记录', async () => {
    const { lock, db, profile } = await setup()
    expect((await lock.changePassword('old-password', 'old-password', '', true)).ok).toBe(true)
    const repository = await import('@/lib/vaultRepository')
    const original = repository.vaultRepository.commit.bind(repository.vaultRepository)
    vi.spyOn(repository.vaultRepository, 'commit').mockImplementationOnce(async (...args) => {
      const result = await original(...args)
      profile.name = '提交完成时的编辑'
      return result
    })
    await db.updateSyncPayload(payload => {
      payload.profile.name = '远端名字'
      payload.memos = [{ id: 'remote-memo', title: '独立远端记录', content: '', color: 'yellow', pinned: false, createdAt: 1, updatedAt: 1 }]
    })
    expect(profile.name).toBe('提交完成时的编辑')
    await db.flushPendingSave()
    const saved = await readSaved()
    expect(saved.profile.name).toBe('提交完成时的编辑')
    expect(saved.memos![0].title).toBe('独立远端记录')
  })
})

describe('设备独立密码与离线加入', () => {
  it('旧库升级保留业务、附件与连接凭据，之后改密不重写附件和业务密文', async () => {
    const { lock, db, docs, crypto, profile } = await setup()
    profile.name = '升级保留姓名'
    const meta = await docs.importDoc(new File(['升级附件'], 'test.txt'))
    const repository = await import('@/lib/vaultRepository')
    await repository.commitRepository({ 'xk.github.secure': await crypto.encryptJSON(db.getActiveKey()!, 'github-secret') })
    expect(await lock.changePassword('old-password', 'old-password', '', true)).toEqual({ ok: true })
    expect(db.dataEnvelope.value!.v).toBe(3)
    expect((await readSaved()).profile.name).toBe('升级保留姓名')
    expect(docs.docMetas.value[0].blobId).not.toBe(meta.id)
    const before = JSON.parse(JSON.stringify(db.dataEnvelope.value!))
    const blobId = docs.docMetas.value[0].blobId!
    const blob = fixture.blobs.get(blobId)
    const secret = repository.readRepository<{ ivB64: string; ctB64: string }>('xk.github.secure')!
    const operationIds = (await readSaved()).offlineJournal!.pending.map(op => op.operationId)
    expect(await lock.changePassword('old-password', 'device-password', 'hint')).toEqual({ ok: true })
    expect(db.dataEnvelope.value!.ctB64).toBe(before.ctB64)
    expect(db.dataEnvelope.value!.ts).toBe(before.ts)
    expect(repository.readRepository('xk.github.secure')).toEqual(secret)
    expect(fixture.blobs.get(blobId)).toEqual(blob)
    expect((await readSaved()).offlineJournal!.pending.map(op => op.operationId)).toEqual(operationIds)
    await lock.lockApp()
    expect(await lock.unlockApp('old-password')).toBe(false)
    expect(await lock.unlockApp('device-password')).toBe(true)
    expect(await crypto.decryptJSON(db.getActiveKey()!, secret.ivB64, secret.ctB64)).toBe('github-secret')
    expect(new TextDecoder().decode(await docs.openDocBuffer(docs.docMetas.value[0]))).toBe('升级附件')
  })

  it('升级事务失败保留旧格式、密码、附件；重新封装失败保留原封装', async () => {
    const { lock, db, docs } = await setup()
    const meta = await docs.importDoc(new File(['原附件'], 'test.txt'))
    await db.flushPendingSave()
    const repository = await import('@/lib/vaultRepository')
    vi.spyOn(repository.vaultRepository, 'commit').mockRejectedValueOnce(new Error('quota'))
    expect((await lock.changePassword('old-password', 'old-password', '', true)).ok).toBe(false)
    expect(db.dataEnvelope.value!.v).toBe(2)
    expect(docs.docMetas.value[0].blobId).toBeUndefined()
    expect(fixture.blobs.has(meta.id)).toBe(true)
    expect(fixture.blobs.size).toBe(1)
    expect((await lock.changePassword('old-password', 'old-password', '', true)).ok).toBe(true)
    const original = JSON.parse(JSON.stringify(db.dataEnvelope.value))
    vi.spyOn(repository.vaultRepository, 'commit').mockRejectedValueOnce(new Error('quota'))
    expect((await lock.changePassword('old-password', 'new-password', '')).ok).toBe(false)
    expect(db.dataEnvelope.value).toEqual(original)
    await lock.lockApp()
    expect(await lock.unlockApp('old-password')).toBe(true)
  })

  it('升级后不再调用旧版整库云同步接口', async () => {
    const { lock } = await setup()
    expect((await lock.changePassword('old-password', 'old-password', '', true)).ok).toBe(true)
    const sync = await import('@/lib/sync')
    sync.syncConfig.value = { serverUrl: 'https://test.invalid', email: 'test@example.invalid', autoSync: true }
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await sync.syncNow()
    sync.scheduleAutoPush()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(sync.syncStatusText.value).toBe('仅本机')
  })

  it('新设备用转移码加入同一保险库，可设独立密码且不携带连接凭据', async () => {
    const { lock, db, docs, profile } = await setup()
    profile.name = '来自源设备'
    await docs.importDoc(new File(['跨设备附件'], 'shared.txt'))
    expect((await lock.changePassword('old-password', 'old-password', '', true)).ok).toBe(true)
    const transfer = await import('@/lib/deviceTransfer')
    const result = await transfer.createDeviceTransfer('old-password')
    expect(JSON.stringify(result.file)).not.toContain('来自源设备')
    expect(JSON.stringify(result.file)).not.toContain(result.code)
    const sourceEnvelope = JSON.parse(JSON.stringify(db.dataEnvelope.value!))
    const sourceJournal = (await readSaved()).offlineJournal!
    await expect(transfer.joinDeviceTransfer(result.file, result.code, 'target-password')).rejects.toThrow('新设备')
    await lock.lockApp()
    vi.resetModules()
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) },
      removeItem: (key: string) => { storage.delete(key) },
    })
    vi.stubGlobal('indexedDB', new IDBFactory())
    fixture.blobs.clear()
    const repository = await import('@/lib/vaultRepository')
    await repository.initializeVaultRepository()
    const receiving = await import('@/lib/deviceTransfer')
    await expect(receiving.joinDeviceTransfer(result.file, '0'.repeat(32), 'target-password')).rejects.toThrow()
    expect(repository.readRepository('xk.data.v2')).toBeNull()
    await expect(receiving.joinDeviceTransfer({ ...result.file, ctB64: 'AAAA' }, result.code, 'target-password')).rejects.toThrow()
    expect(fixture.blobs.size).toBe(0)
    vi.spyOn(repository.vaultRepository, 'commit').mockRejectedValueOnce(new Error('quota'))
    await expect(receiving.joinDeviceTransfer(result.file, result.code, 'target-password')).rejects.toThrow('quota')
    expect(fixture.blobs.size).toBe(0)
    expect(repository.readRepository('xk.data.v2')).toBeNull()
    await receiving.joinDeviceTransfer(result.file, result.code, 'target-password')
    const targetEnvelope = repository.readRepository<import('@/types').WrappedEnvelope>('xk.data.v2')!
    expect(targetEnvelope.vaultId).toBe(sourceEnvelope.vaultId)
    expect(targetEnvelope.keyId).toBe(sourceEnvelope.keyId)
    expect(targetEnvelope.wrappedKey).not.toEqual(sourceEnvelope.wrappedKey)
    expect(repository.readRepository('xk.github.secure')).toBeNull()
    const keys = await import('@/lib/vaultKeys')
    await expect(keys.unlockEnvelope(targetEnvelope, 'old-password')).rejects.toThrow()
    await expect(keys.unlockEnvelope(targetEnvelope, result.code)).rejects.toThrow()
    await expect(keys.unlockEnvelope(sourceEnvelope, 'old-password')).resolves.toBeDefined()
    vi.resetModules()
    await (await import('@/lib/vaultRepository')).initializeVaultRepository()
    const targetLock = await import('@/stores/lock')
    expect(await targetLock.unlockApp('target-password')).toBe(true)
    const targetDocs = await import('@/stores/docs')
    expect(new TextDecoder().decode(await targetDocs.openDocBuffer(targetDocs.docMetas.value[0]))).toBe('跨设备附件')
    expect((await readSaved()).profile.name).toBe('来自源设备')
    expect((await readSaved()).offlineJournal!.deviceId).not.toBe(sourceJournal.deviceId)
    expect((await targetLock.changePassword('target-password', 'target-next-password', '')).ok).toBe(true)
    await targetLock.lockApp()
    expect(await targetLock.unlockApp('target-next-password')).toBe(true)
    await expect(keys.unlockEnvelope(sourceEnvelope, 'old-password')).resolves.toBeDefined()
  })

  it('升级后备份可恢复到另一个独立主密码保险库', async () => {
    const { lock, db, docs, crypto, profile } = await setup()
    profile.name = 'v3备份内容'
    await docs.importDoc(new File(['v3附件'], 'v3.txt'))
    expect((await lock.changePassword('old-password', 'old-password', '', true)).ok).toBe(true)
    const blobId = docs.docMetas.value[0].blobId!
    const blob = fixture.blobs.get(blobId)!
    const backup = { app: 'personal-hub' as const, version: 1 as const, exportedAt: Date.now(), envelope: JSON.parse(JSON.stringify(db.dataEnvelope.value!)),
      docs: [{ id: blobId, ivB64: blob.ivB64, ctB64: crypto.bytesToB64(new Uint8Array(blob.ct)) }] }
    const { createVaultKey } = await import('@/lib/vaultKeys')
    const destination = await createVaultKey('destination-password')
    const payload = db.snapshotPayload()
    payload.profile.name = '不同保险库'
    const env = { ...destination.header, ts: Date.now(), ...await crypto.encryptJSON(destination.key, payload) }
    await db.initFromEnvelope(env, destination.key)
    db.setActiveKey(destination.key)
    const { applyBackup } = await import('@/lib/backup')
    await expect(applyBackup(backup, 'wrong-password')).rejects.toThrow('无法解密备份')
    expect(profile.name).toBe('不同保险库')
    await applyBackup(backup, 'old-password')
    expect(db.dataEnvelope.value!.v).toBe(3)
    expect((db.dataEnvelope.value as import('@/types').WrappedEnvelope).vaultId).toBe(destination.header.vaultId)
    expect(profile.name).toBe('v3备份内容')
    await lock.lockApp()
    expect(await lock.unlockApp('destination-password')).toBe(true)
    expect(new TextDecoder().decode(await docs.openDocBuffer(docs.docMetas.value[0]))).toBe('v3附件')
  })
})

describe('备份恢复事务', () => {
  it('完整备份缺失附件时拒绝导出，不静默跳过文件', async () => {
    const { docs, db } = await setup()
    await docs.importDoc(new File(['需要备份'], 'missing.txt'))
    await db.flushPendingSave()
    fixture.blobs.clear()
    const { exportBackup } = await import('@/lib/backup')
    await expect(exportBackup(true)).rejects.toThrow('不在本机')
  })
  it('恢复提交失败不会更换当前密码或覆盖原附件，并清理暂存文件', async () => {
    const { lock, db, docs, crypto } = await setup()
    const meta = await docs.importDoc(new File(['原附件'], 'original.txt'))
    await db.flushPendingSave()
    const source = fixture.blobs.get(meta.id)!
    const backup = {
      app: 'personal-hub' as const, version: 1 as const, exportedAt: Date.now(), envelope: db.dataEnvelope.value!,
      docs: [{ id: meta.id, ivB64: source.ivB64, ctB64: crypto.bytesToB64(new Uint8Array(source.ct)) }],
    }
    const before = await readSaved()
    const repository = await import('@/lib/vaultRepository')
    vi.spyOn(repository.vaultRepository, 'commit').mockRejectedValueOnce(new Error('事务提交失败'))
    const { applyBackup } = await import('@/lib/backup')
    await expect(applyBackup(backup)).rejects.toThrow('事务提交失败')
    expect(await readSaved()).toEqual(before)
    expect(fixture.blobs.size).toBe(1)
    expect(new TextDecoder().decode(await docs.openDocBuffer(meta))).toBe('原附件')
    await lock.lockApp()
    expect(await lock.unlockApp('old-password')).toBe(true)
  })

  it('备份附件损坏时停止恢复，保留原内容，不跳过错误后假报成功', async () => {
    const { db, docs } = await setup()
    const meta = await docs.importDoc(new File(['原附件'], 'original.txt'))
    await db.flushPendingSave()
    const before = await readSaved()
    const { applyBackup } = await import('@/lib/backup')
    await expect(applyBackup({
      app: 'personal-hub', version: 1, exportedAt: Date.now(), envelope: db.dataEnvelope.value!,
      docs: [{ id: meta.id, ivB64: 'AAAA', ctB64: 'AAAA' }],
    })).rejects.toThrow()
    expect(await readSaved()).toEqual(before)
    expect(fixture.blobs.size).toBe(1)
  })
})

describe('持久化与锁定', () => {
  it.each([false, true])('读取 AI 凭据不产生无意义的新存储版本（已有凭据：%s）', async stored => {
    const { db, crypto } = await setup()
    const repository = await import('@/lib/vaultRepository')
    const ai = await import('@/lib/aiopencode')
    const id = ai.aiProfiles.value[0].id
    if (stored) {
      await repository.commitRepository({ 'xk.ai.secrets.v1': await crypto.encryptJSON(db.getActiveKey()!, { [id]: { password: 'test-secret', bridgeToken: '' } }) })
    }
    const before = repository.repositoryRevision()
    await ai.hydrateAiSecrets()
    expect(repository.repositoryRevision()).toBe(before)
    expect(ai.aiProfiles.value[0].password).toBe(stored ? 'test-secret' : '')
  })

  it('关闭并重新加载模块后，从事务数据库恢复数据和稳定队列', async () => {
    const { lock, db, profile } = await setup()
    profile.name = '跨会话保留'
    await db.flushPendingSave()
    const before = await readSaved()
    await lock.lockApp()
    vi.resetModules()
    await (await import('@/lib/vaultRepository')).initializeVaultRepository()
    const reopened = await import('@/stores/lock')
    expect(await reopened.unlockApp('old-password')).toBe(true)
    expect((await import('@/stores/profile')).profile.name).toBe('跨会话保留')
    expect((await readSaved()).offlineJournal).toEqual(before.offlineJournal)
    expect(localStorage.getItem('xk.data.v2')).toBeNull()
  })

  it('另一窗口已保存时保留本窗口修改，并允许导出独立恢复副本', async () => {
    const { db, profile } = await setup()
    const repository = await import('@/lib/vaultRepository')
    const other = new repository.IndexedDBVaultRepository()
    const saved = (await other.load())!
    await other.commit(saved.revision, saved.values)
    profile.name = '冲突窗口中独有的修改'
    await expect(db.flushPendingSave()).rejects.toThrow('另一个窗口')
    expect(db.storageError.value).toContain('另一个窗口')
    expect(profile.name).toBe('冲突窗口中独有的修改')
    const persisted = await other.load()
    let exported!: Blob
    const original = URL.createObjectURL
    URL.createObjectURL = (blob: Blob) => { exported = blob; return 'blob:recovery' }
    vi.stubGlobal('document', { createElement: () => ({ click: vi.fn(), remove: vi.fn() }), body: { appendChild: vi.fn() } })
    try {
      const { exportBackup, parseBackup } = await import('@/lib/backup')
      expect(await exportBackup(true)).toContain('未保存的修改')
      const recovery = await parseBackup(new File([exported], 'recovery.phub'))
      const { decryptJSON } = await import('@/lib/crypto')
      expect((await decryptJSON<VaultPayload>(db.getActiveKey()!, recovery.envelope.ivB64, recovery.envelope.ctB64)).profile.name).toBe(profile.name)
      expect(await other.load()).toEqual(persisted)
    } finally {
      URL.createObjectURL = original
      db.wipeMemory()
    }
  })

  it('业务记录与离线队列共同加密保存，解锁后恢复相同操作 ID', async () => {
    const { lock, db, profile } = await setup()
    profile.name = '不得明文存储的名字'
    await db.flushPendingSave()
    const before = await readSaved()
    expect(before.offlineJournal?.pending.find(operation => operation.kind === 'profile')?.value).toMatchObject({ name: profile.name })
    expect(JSON.stringify((await import('@/lib/vaultRepository')).readRepository('xk.data.v2'))).not.toContain(profile.name)
    expect(localStorage.getItem('xk.data.v2')).toBeNull()
    await lock.lockApp()
    const { offlinePendingCount } = await import('@/stores/offline')
    expect(offlinePendingCount.value).toBe(0)
    expect(await lock.unlockApp('old-password')).toBe(true)
    const after = await readSaved()
    expect(after.offlineJournal).toEqual(before.offlineJournal)
    expect(offlinePendingCount.value).toBe(before.offlineJournal!.pending.length)
  })

  it('旧 v2 信封升级离线队列时保持业务时间戳，不误判为较新云端数据', async () => {
    const { db, crypto, profile } = await setup()
    const envelope = db.dataEnvelope.value!
    const data = db.snapshotPayload()
    delete data.offlineJournal
    const old = { ...envelope, ...await crypto.encryptJSON(db.getActiveKey()!, data) }
    await db.initFromEnvelope(old, db.getActiveKey()!)
    expect(db.dataEnvelope.value!.ts).toBe(old.ts)
    expect((await readSaved()).offlineJournal!.pending.length).toBeGreaterThan(0)
    expect(profile.name).toBe(data.profile.name)
  })

  it('改密保留未发送操作，附件本机路径变更不产生共享内容变更', async () => {
    const { lock, db, docs } = await setup()
    await docs.importDoc(new File(['测试文件'], 'test.txt'))
    await db.flushPendingSave()
    const before = (await readSaved()).offlineJournal!
    expect((await lock.changePassword('old-password', 'new-password', '')).ok).toBe(true)
    expect((await readSaved()).offlineJournal!.pending).toEqual(before.pending)
  })

  it('存储失败不会发布未落盘的离线队列，重试后恢复一致', async () => {
    const { db, profile } = await setup()
    const before = await readSaved()
    profile.name = '尚未落盘'
    vi.spyOn((await import('@/lib/vaultRepository')).vaultRepository, 'commit').mockRejectedValueOnce(new Error('quota'))
    await expect(db.persistNow()).rejects.toThrow('quota')
    expect((await readSaved()).offlineJournal).toEqual(before.offlineJournal)
    await db.flushPendingSave()
    expect((await readSaved()).offlineJournal?.pending.find(operation => operation.kind === 'profile')?.value).toMatchObject({ name: '尚未落盘' })
  })

  it('修改后立即锁定仍会保存最新数据', async () => {
    const { lock, db, profile } = await setup()
    profile.name = '刚修改的姓名'
    const locking = lock.lockApp()
    expect(lock.isGated.value).toBe(true)
    await locking
    expect(db.getActiveKey()).toBeNull()
    expect(await lock.unlockApp('old-password')).toBe(true)
    expect(profile.name).toBe('刚修改的姓名')
  })

  it('连续保存按顺序提交，锁定会等待队列中的最新修改', async () => {
    const { lock, db, profile } = await setup()
    const gate = deferred<void>()
    const started = deferred<void>()
    fixture.onEncrypt = async () => { started.resolve(); await gate.promise }
    profile.name = '第一版'
    const first = db.persistNow()
    await started.promise
    profile.name = '第二版'
    const second = db.persistNow()
    const locking = lock.lockApp()
    gate.resolve()
    await Promise.all([first, second, locking])
    expect(await lock.unlockApp('old-password')).toBe(true)
    expect(profile.name).toBe('第二版')
  })

  it('旧版明文迁移后的首次会话启用自动保存', async () => {
    localStorage.setItem('xk.profile.v1', JSON.stringify({ name: '旧版姓名' }))
    const { lock, db, profile } = await setup()
    const saved = deferred<void>()
    db.onDataSaved(() => saved.resolve())
    profile.name = '迁移后的修改'
    await vi.advanceTimersByTimeAsync(400)
    await saved.promise
    expect((await readSaved()).profile.name).toBe('迁移后的修改')
    expect(localStorage.getItem('xk.profile.v1')).toBeNull()
    await lock.lockApp()
  })

  it('锁定保存失败时保留未保存数据并允许重试', async () => {
    const { lock, profile } = await setup()
    profile.name = '需要保留的修改'
    vi.spyOn((await import('@/lib/vaultRepository')).vaultRepository, 'commit').mockRejectedValueOnce(new Error('模拟存储失败'))
    await expect(lock.lockApp()).rejects.toThrow('模拟存储失败')
    expect(lock.isGated.value).toBe(false)
    expect(profile.name).toBe('需要保留的修改')
    await lock.lockApp()
    expect(await lock.unlockApp('old-password')).toBe(true)
    expect(profile.name).toBe('需要保留的修改')
  })
})

async function setupSync() {
  const context = await setup()
  const sync = await import('@/lib/sync')
  sync.syncConfig.value = { serverUrl: 'https://test.invalid', email: 'test@example.invalid', autoSync: false }
  await (await import('@/lib/vaultRepository')).commitRepository({ 'xk.sync.secure': await context.crypto.encryptJSON(context.db.getActiveKey()!, 'mock-password') })
  const remote = { ...context.db.dataEnvelope.value!, ts: context.db.dataEnvelope.value!.ts + 1000,
    ...await context.crypto.encryptJSON(context.db.getActiveKey()!, { profile: { name: '远端内容' } }) }
  const requested = deferred<void>()
  const response = deferred<Response>()
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.includes('auth-with-password')) return new Response(JSON.stringify({ token: 'test-token', record: { id: 'test-user' } }))
    if (options?.method === 'PATCH') return new Response('{}')
    requested.resolve()
    return response.promise
  })
  vi.stubGlobal('fetch', fetchMock)
  const respond = () => response.resolve(new Response(JSON.stringify({ items: [{ id: 'test-record', data: JSON.stringify(remote) }] })))
  return { ...context, sync, remote, requested, respond, fetchMock }
}

describe('同步期间的本地修改', () => {
  it('网络等待期间的新修改先落盘，并使用最新版本比较', async () => {
    const { db, profile, sync, remote, requested, respond, fetchMock } = await setupSync()
    remote.ts = db.dataEnvelope.value!.ts + 1
    const pending = sync.syncNow()
    await requested.promise
    profile.name = '网络等待期间的新修改'
    await db.persistNow()
    await db.persistNow()
    respond()
    await pending
    expect(profile.name).toBe('网络等待期间的新修改')
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(true)
  })

  it('解密期间发生修改时取消拉取，保留本地内容且不弹覆盖确认', async () => {
    const { db, profile, sync, requested, respond } = await setupSync()
    const pending = sync.syncNow()
    await requested.promise
    fixture.onDecrypt = async () => { profile.name = '解密期间的新修改' }
    respond()
    await pending
    expect(profile.name).toBe('解密期间的新修改')
    expect(sync.syncMeta.value.lastError).toContain('本地')
    expect(window.confirm).not.toHaveBeenCalled()
    await db.flushPendingSave()
    expect((await readSaved()).profile.name).toBe('解密期间的新修改')
  })

  it('没有本地修改时仍能正常拉取较新云端数据', async () => {
    const { profile, sync, requested, respond } = await setupSync()
    const pending = sync.syncNow()
    await requested.promise
    respond()
    await pending
    expect(profile.name).toBe('远端内容')
    expect(sync.syncMeta.value.lastError).toBe('')
  })

  it('网络等待期间锁定后不会重新填充明文状态', async () => {
    const { lock, db, profile, sync, requested, respond } = await setupSync()
    const pending = sync.syncNow()
    await requested.promise
    await lock.lockApp()
    respond()
    await pending
    expect(db.getActiveKey()).toBeNull()
    expect(profile.name).not.toBe('远端内容')
  })
})

describe('重复任务', () => {
  it('取消并再次完成原任务时保留唯一后续任务，且下一轮可继续生成', async () => {
    await setup()
    const { tasks, addTask, toggleTaskDone, normalizeTask } = await import('@/stores/tasks')
    const task = addTask({ title: '每日任务', notes: '', date: '2026-09-14', time: '', priority: 2, repeat: 'daily' })
    toggleTaskDone(task.id)
    const next = tasks.value[1]
    next.date = '2026-09-16'
    tasks.value = tasks.value.map(normalizeTask)
    toggleTaskDone(task.id)
    toggleTaskDone(task.id)
    expect(tasks.value).toHaveLength(2)
    toggleTaskDone(next.id)
    expect(tasks.value).toHaveLength(3)
    expect(tasks.value[2].repeatSourceId).toBe(next.id)
    expect(tasks.value[2].date).toBe('2026-09-17')
  })

  it('同名独立任务不会互相去重，删除后续任务后可再次生成', async () => {
    await setup()
    const { tasks, addTask, toggleTaskDone, removeTask } = await import('@/stores/tasks')
    const draft = { title: '每日任务', notes: '', date: '2026-09-14', time: '', priority: 2 as const, repeat: 'daily' as const }
    const a = addTask(draft)
    const b = addTask(draft)
    toggleTaskDone(a.id)
    toggleTaskDone(b.id)
    expect(tasks.value).toHaveLength(4)
    removeTask(tasks.value.find(task => task.repeatSourceId === a.id)!.id)
    toggleTaskDone(a.id)
    toggleTaskDone(a.id)
    expect(tasks.value).toHaveLength(4)
  })
})


it('pocket draft survives the shared lock path and unlock, and failed capture remains retryable', async () => {
  const { lock, db } = await setup()
  const attention = await import('@/stores/attention')
  attention.writePocketDraft('自动锁定也要保留')
  await lock.lockApp()
  expect(attention.pocketDraft()).toBeUndefined()
  expect(await lock.unlockApp('old-password')).toBe(true)
  expect(attention.pocketDraft()?.content).toBe('自动锁定也要保留')
  vi.spyOn((await import('@/lib/vaultRepository')).vaultRepository, 'commit').mockRejectedValueOnce(new Error('quota'))
  await expect(attention.collectPocketDraft(undefined, db.persistNow)).rejects.toThrow('quota')
  expect(attention.pocketDraft()?.content).toBe('自动锁定也要保留')
  await attention.collectPocketDraft(undefined, db.persistNow)
  const saved = await readSaved()
  expect(saved.memos?.filter(memo => memo.content === '自动锁定也要保留')).toHaveLength(1)
  expect(saved.memos?.find(memo => memo.content === '自动锁定也要保留')?.captureStatus).toBe('inbox')
})

 describe('本地账户与恢复', () => {
  it('创建账户为 v3，重设密码保留数据并拒绝旧密码', async () => {
    const lock = await import('@/stores/lock')
    const db = await import('@/stores/database')
    const keys = await import('@/lib/vaultKeys')
    const repo = await import('@/lib/vaultRepository')
    const code = keys.generateRecoveryCode()
    await lock.createLocalAccount('测试账户', 'first-password', code)
    expect(db.dataEnvelope.value?.v).toBe(3)
    expect(lock.localAccountName.value).toBe('测试账户')
    expect(lock.hasLocalRecovery.value).toBe(true)
    const { profile } = await import('@/stores/profile')
    profile.name = '必须保留的内容'
    await db.flushPendingSave()
    await lock.lockApp()
    const before = repo.readRepository<DataEnvelope>('xk.data.v2')!
    expect(JSON.stringify(repo.readRepository('xk.lock.v2'))).not.toContain(code)
    await expect(lock.resetLocalPassword(keys.generateRecoveryCode(), 'new-password')).rejects.toThrow()
    expect(repo.readRepository('xk.data.v2')).toEqual(before)
    await lock.resetLocalPassword(code, 'new-password')
    const after = repo.readRepository<DataEnvelope>('xk.data.v2')!
    expect(after.ctB64).toBe(before.ctB64)
    expect(after.ts).toBe(before.ts)
    expect(lock.isGated.value).toBe(true)
    expect(await lock.unlockApp('first-password')).toBe(false)
    expect(await lock.unlockApp('new-password')).toBe(true)
    expect(profile.name).toBe('必须保留的内容')
    expect((await lock.changePassword('new-password', 'third-password', '')).ok).toBe(true)
    await lock.lockApp()
    await lock.resetLocalPassword(code, 'fourth-password')
    expect(await lock.unlockApp('fourth-password')).toBe(true)
  })

  it('旧账户升级并轮换恢复密钥，旧密钥失效', async () => {
    const { lock, db } = await setup()
    const { generateRecoveryCode } = await import('@/lib/vaultKeys')
    const code = generateRecoveryCode(), next = generateRecoveryCode()
    await lock.configureLocalAccount('旧账户', 'old-password', code)
    expect(db.dataEnvelope.value?.v).toBe(3)
    await lock.configureLocalAccount('新名称', 'old-password', next)
    await lock.lockApp()
    await expect(lock.resetLocalPassword(code, 'new-password')).rejects.toThrow()
    await lock.resetLocalPassword(next, 'new-password')
    expect(await lock.unlockApp('new-password')).toBe(true)
    expect(lock.localAccountName.value).toBe('新名称')
  })

  it('创建与恢复写入失败不破坏已有状态', async () => {
    const lock = await import('@/stores/lock')
    const repo = await import('@/lib/vaultRepository')
    const { generateRecoveryCode } = await import('@/lib/vaultKeys')
    const code = generateRecoveryCode()
    vi.spyOn(repo.vaultRepository, 'commit').mockRejectedValueOnce(new Error('quota'))
    await expect(lock.createLocalAccount('账户', 'first-password', code)).rejects.toThrow('quota')
    expect(repo.readRepository('xk.data.v2')).toBeNull()
    expect(lock.isGated.value).toBe(true)
    await lock.createLocalAccount('账户', 'first-password', code)
    await lock.lockApp()
    const before = repo.readRepository('xk.data.v2')
    vi.spyOn(repo.vaultRepository, 'commit').mockRejectedValueOnce(new Error('quota'))
    await expect(lock.resetLocalPassword(code, 'new-password')).rejects.toThrow('quota')
    expect(repo.readRepository('xk.data.v2')).toEqual(before)
    expect(await lock.unlockApp('first-password')).toBe(true)
  })
})

it('旧账户带附件及连接凭据升级后，恢复密码仍可解密', async () => {
  const { lock, db, docs, crypto } = await setup()
  const { generateRecoveryCode } = await import('@/lib/vaultKeys')
  const repo = await import('@/lib/vaultRepository')
  const bytes = new TextEncoder().encode('附件中的原始内容')
  fixture.blobs.set('recovery-doc', await crypto.encryptBytes(db.getActiveKey()!, bytes.buffer))
  docs.docMetas.value = [{ id: 'recovery-doc', name: '恢复附件.txt', mime: 'text/plain', size: bytes.length, category: '其他', tags: [], note: '', pinned: false, createdAt: 1 }]
  await repo.commitRepository({ 'xk.github.secure': await crypto.encryptJSON(db.getActiveKey()!, { token: 'synthetic-test-token' }) })
  await db.flushPendingSave()
  const code = generateRecoveryCode()
  await lock.configureLocalAccount('附件账户', 'old-password', code)
  const blobId = docs.docMetas.value[0].blobId!
  const storedBlob = fixture.blobs.get(blobId)!
  const storedCredential = repo.readRepository('xk.github.secure')
  await lock.lockApp()
  await lock.resetLocalPassword(code, 'recovered-password')
  expect(fixture.blobs.get(blobId)).toEqual(storedBlob)
  expect(repo.readRepository('xk.github.secure')).toEqual(storedCredential)
  expect(await lock.unlockApp('recovered-password')).toBe(true)
  expect(new TextDecoder().decode(await crypto.decryptBytes(db.getActiveKey()!, storedBlob.ivB64, storedBlob.ct))).toBe('附件中的原始内容')
  const credential = storedCredential as { ivB64: string; ctB64: string }
  expect(await crypto.decryptJSON(db.getActiveKey()!, credential.ivB64, credential.ctB64)).toEqual({ token: 'synthetic-test-token' })
})

it('登录正在解密时拒绝并行恢复，避免旧封装覆盖新密码', async () => {
  const lock = await import('@/stores/lock')
  const { generateRecoveryCode } = await import('@/lib/vaultKeys')
  const code = generateRecoveryCode()
  await lock.createLocalAccount('账户', 'old-password', code)
  await lock.lockApp()
  const entered = deferred<void>(), resume = deferred<void>()
  fixture.onDecrypt = async () => { entered.resolve(); await resume.promise }
  const login = lock.unlockApp('old-password')
  await entered.promise
  try {
    await expect(lock.resetLocalPassword(code, 'new-password')).rejects.toThrow('等待登录操作完成')
    expect(await lock.unlockApp('old-password')).toBe(false)
  } finally { resume.resolve() }
  expect(await login).toBe(true)
  await lock.lockApp()
  await lock.resetLocalPassword(code, 'new-password')
  expect(await lock.unlockApp('new-password')).toBe(true)
})
