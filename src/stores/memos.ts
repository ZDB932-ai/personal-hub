import { ref } from 'vue'
import type { Memo } from '@/types'
import { uid } from '@/lib/utils'

export const memos = ref<Memo[]>([])

export const MEMO_COLORS = [
  { key: 'indigo', label: '靛蓝', card: 'memo-indigo' },
  { key: 'emerald', label: '翠绿', card: 'memo-emerald' },
  { key: 'amber', label: '琥珀', card: 'memo-amber' },
  { key: 'rose', label: '玫红', card: 'memo-rose' },
  { key: 'sky', label: '天蓝', card: 'memo-sky' },
  { key: 'slate', label: '石墨', card: 'memo-slate' },
]

export function memoCardClass(colorKey: string): string {
  return MEMO_COLORS.find((c) => c.key === colorKey)?.card ?? MEMO_COLORS[5].card
}

export function addMemo(draft: Omit<Memo, 'id' | 'createdAt' | 'updatedAt'>): Memo {
  const now = Date.now()
  const memo = { id: uid(), createdAt: now, updatedAt: now, ...draft }
  memos.value.push(memo)
  return memo
}

export function updateMemo(id: string, patch: Partial<Memo>): void {
  const m = memos.value.find((x) => x.id === id)
  if (m) Object.assign(m, patch, { updatedAt: Date.now() })
}

export function removeMemo(id: string): void {
  const i = memos.value.findIndex((m) => m.id === id)
  if (i >= 0) memos.value.splice(i, 1)
}

export function toggleMemoPin(id: string): void {
  const m = memos.value.find((x) => x.id === id)
  if (m) {
    m.pinned = !m.pinned
    m.updatedAt = Date.now()
  }
}
