const JOURNAL_KEY = 'xk.storage.rollback.v1'

export function recoverStorageTransaction(): void {
  const raw = localStorage.getItem(JOURNAL_KEY)
  if (!raw) return
  const previous = JSON.parse(raw) as Record<string, string | null>
  for (const [key, value] of Object.entries(previous)) {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  }
  localStorage.removeItem(JOURNAL_KEY)
}

export function commitStorageTransaction(values: Record<string, unknown>): void {
  recoverStorageTransaction()
  const previous: Record<string, string | null> = {}
  const serialized = Object.entries(values).map(([key, value]) => {
    previous[key] = localStorage.getItem(key)
    return [key, JSON.stringify(value)] as const
  })
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(previous))
  try {
    for (const [key, value] of serialized) localStorage.setItem(key, value)
    localStorage.removeItem(JOURNAL_KEY)
  } catch (error) {
    recoverStorageTransaction()
    throw error
  }
}
