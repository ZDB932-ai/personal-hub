import { Capacitor, registerPlugin } from '@capacitor/core'
import { ref } from 'vue'
import type { RecordSyncTransport, ScopedOperation, SyncSpace, ChangePage, RecordReceipt } from './recordSyncWire'
import { sealScopedOperation } from './recordSyncWire'
import type { VaultPayload } from '@/types'

interface Config extends SyncSpace { url: string; token: string; serverId: string }
interface NativeSync {
  configure(value: Config): Promise<void>
  stage(value: { scope: string; wires: ScopedOperation[] }): Promise<void>
  prepare(value: { scope: string; wire: ScopedOperation }): Promise<ScopedOperation>
  push(value: { scope: string; wire: ScopedOperation }): Promise<RecordReceipt>
  pull(value: { scope: string; cursor: number }): Promise<ChangePage>
  stop(): Promise<void>
  openBackgroundSettings(): Promise<void>
  status(): Promise<{ message: string; cachedRecords: number; pending: number; lastSuccessAt: number; batteryExempt: boolean }>
}
const native = registerPlugin<NativeSync>('BackgroundSync')
export const androidBackgroundAvailable = Capacitor.getPlatform() === 'android'
export const androidBackgroundEnabled = ref(androidBackgroundAvailable && localStorage.getItem('xk.android-background') === 'true')
export const androidBackgroundMessage = ref('')
export const androidBackgroundBatteryExempt = ref<boolean | null>(null)
export async function openAndroidBackgroundSettings() {
  if (androidBackgroundAvailable) await native.openBackgroundSettings()
}
const scopes = new WeakMap<RecordSyncTransport, string>()

export async function setAndroidBackground(enabled: boolean) {
  if (!androidBackgroundAvailable) return
  if (!enabled) await native.stop()
  androidBackgroundEnabled.value = enabled
  localStorage.setItem('xk.android-background', String(enabled))
  androidBackgroundMessage.value = enabled ? '正在启动后台同步' : '后台同步已关闭'
}

export async function wrapAndroidBackground(transport: RecordSyncTransport, config: Config): Promise<RecordSyncTransport> {
  if (!androidBackgroundEnabled.value) return transport
  await native.configure(config)
  const scope = JSON.stringify([config.serverId, config.vaultId, config.keyId])
  const wrapped = { ...transport,
    prepare: (wire: ScopedOperation) => native.prepare({ scope, wire }),
    push: async (_space: SyncSpace, wire: ScopedOperation) => native.push({ scope, wire }),
    pull: async (_space: SyncSpace, cursor: number) => native.pull({ scope, cursor }),
  }
  scopes.set(wrapped, scope)
  await refreshAndroidBackground()
  return wrapped
}

export async function stageAndroidBackground(transport: RecordSyncTransport, payload: VaultPayload, key: CryptoKey, valid: () => boolean) {
  const scope = scopes.get(transport), journal = payload.offlineJournal
  if (!scope || !journal || !androidBackgroundEnabled.value) return
  const [, vaultId, keyId] = JSON.parse(scope) as string[]
  const pending = journal.pending.filter(op => !journal.conflicts.some(c => c.remote.entity === op.entity))
  if (journal.sync?.inFlight && !pending.some(op => op.operationId === journal.sync!.inFlight!.operation.operationId)) pending.unshift(journal.sync.inFlight.operation)
  const wires = await Promise.all(pending.map(op => journal.sync?.inFlight?.operation.operationId === op.operationId
    ? journal.sync.inFlight.wire : sealScopedOperation(key, { vaultId: vaultId!, keyId: keyId! }, op)))
  if (!valid()) return
  await native.stage({ scope, wires })
}

export async function stopAndroidBackground() {
  if (androidBackgroundAvailable) await native.stop()
}

export async function refreshAndroidBackground() {
  if (!androidBackgroundAvailable) return
  try {
    const status = await native.status()
    androidBackgroundBatteryExempt.value = status.batteryExempt
    androidBackgroundMessage.value = `${status.message} · 待合并 ${status.cachedRecords} 条 · 待发送 ${status.pending} 条 · ${status.lastSuccessAt ? `上次检查：${new Date(status.lastSuccessAt).toLocaleString('zh-CN')}` : '本次进程尚无成功检查'}`
  } catch { androidBackgroundBatteryExempt.value = null; androidBackgroundMessage.value = '无法读取后台同步状态' }
}
