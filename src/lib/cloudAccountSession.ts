import { dataEnvelope } from '@/stores/database'
import { installCloudAccount, refreshCloudAccount } from '@/stores/lock'
import { connectRecordHttp } from './recordSyncHttp'
import { openRecord } from './recordSyncWire'
import type { SyncRecord } from './syncProtocol'
import type { authenticateCloud } from './cloudAccount'
import { resumeRecordSession } from './recordSyncSession'

export async function adoptCloudSession(result: Awaited<ReturnType<typeof authenticateCloud>>) {
  const space = { vaultId: result.bootstrap.vaultId, keyId: result.bootstrap.keyId }
  const transport = await connectRecordHttp(result.url, result.token, space)
  const credentials = { version: 1 as const, url: result.url, token: result.token, ...space, serverId: transport.serverId }
  if (dataEnvelope.value) await refreshCloudAccount(result.name, result.bootstrap, result.key, credentials)
  else {
    const records: SyncRecord[] = []
    let cursor = 0
    while (true) {
      const page = await transport.pull(space, cursor)
      for (const record of page.records) records.push(await openRecord(result.key, space, record))
      if (!page.hasMore) break
      if (page.cursor <= cursor) throw new Error('同步游标无效')
      cursor = page.cursor
    }
    await installCloudAccount(result.name, result.bootstrap, result.key, records, credentials)
  }
  void resumeRecordSession()
}
