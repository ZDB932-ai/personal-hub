import { expect, it } from 'vitest'
import { openOperation, sealOperation } from '@/lib/syncWire'
import { entityKey, type SyncOperation } from '@/lib/syncProtocol'

async function key() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

const operation: SyncOperation = {
  operationId: 'operation-1', deviceId: 'device-1', entity: entityKey('entries', 'entry-1'), kind: 'entries', id: 'entry-1',
  baseRevision: 2, deleted: false, value: { password: '不得明文传输', username: '私密用户名' },
}

it('传输格式只包含密文和必要元数据，正确密钥可还原记录', async () => {
  const active = await key()
  const wire = await sealOperation(active, operation)
  expect(JSON.stringify(wire)).not.toContain('不得明文传输')
  expect(JSON.stringify(wire)).not.toContain('私密用户名')
  expect(await openOperation(active, wire)).toEqual(operation)
  await expect(openOperation(await key(), wire)).rejects.toThrow()
})

it('无法将密文移植到其他记录、版本或操作标识', async () => {
  const active = await key()
  const wire = await sealOperation(active, operation)
  for (const patch of [{ entity: 'other' }, { baseRevision: 3 }, { operationId: 'other' }, { deviceId: 'other' }, { deleted: true }]) {
    await expect(openOperation(active, { ...wire, ...patch })).rejects.toThrow('校验失败')
  }
})
