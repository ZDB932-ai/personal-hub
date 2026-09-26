import { ref } from 'vue'
import type { OfflineJournal } from '@/lib/offlineJournal'

export const offlinePendingCount = ref(0)
export const offlineDeletedCount = ref(0)
export const offlinePreparedAt = ref(0)
export const offlineConflicts = ref<OfflineJournal['conflicts']>([])
export const offlineInFlight = ref(false)
export const offlineRetryAt = ref(0)
export const offlineSyncError = ref('')

export function updateOfflineSummary(journal?: OfflineJournal, savedAt = 0): void {
  offlinePendingCount.value = journal?.pending.length ?? 0
  offlineDeletedCount.value = journal?.pending.filter((operation) => operation.deleted).length ?? 0
  offlinePreparedAt.value = savedAt
  offlineConflicts.value = (journal?.conflicts ?? []).map(conflict => ({
    ...conflict, operation: journal?.pending.find(item => item.entity === conflict.remote.entity) ?? conflict.operation,
  }))
  offlineInFlight.value = Boolean(journal?.sync?.inFlight)
  offlineRetryAt.value = journal?.sync?.retryAt ?? 0
  offlineSyncError.value = journal?.sync?.lastError ?? ''
}
