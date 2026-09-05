import { ref } from 'vue'
import type { VaultDraft, VaultEntry } from '@/types'
import { uid } from '@/lib/utils'

export const entries = ref<VaultEntry[]>([])

export function seedEntries(): VaultEntry[] {
  const now = Date.now()
  const make = (
    title: string,
    username: string,
    password: string,
    category: string,
    url = '',
    notes = '',
  ): VaultEntry => ({
    id: uid(),
    title,
    username,
    password,
    url,
    notes,
    category,
    createdAt: now,
    updatedAt: now,
  })
  return [
    make('示例 - GitHub', 'your-name@example.com', 'Demo#1234', '开发', 'https://github.com', '这是一条示例数据，可编辑或删除'),
    make('示例 - QQ邮箱', '123456789', 'Demo#5678', '邮箱', 'https://mail.qq.com', ''),
    make('示例 - 微博', 'demo_user', 'Demo#0000', '社交', 'https://weibo.com', ''),
  ]
}

export function addEntry(draft: VaultDraft): void {
  const now = Date.now()
  entries.value.push({ id: uid(), createdAt: now, updatedAt: now, ...draft })
}

export function updateEntry(id: string, draft: VaultDraft): void {
  const item = entries.value.find((e) => e.id === id)
  if (item) {
    Object.assign(item, draft, { updatedAt: Date.now() })
  }
}

export function removeEntry(id: string): void {
  const i = entries.value.findIndex((e) => e.id === id)
  if (i >= 0) entries.value.splice(i, 1)
}

export function touchEntry(id: string): void {
  const e = entries.value.find((x) => x.id === id)
  if (e) e.lastUsedAt = Date.now()
}

export function toggleEntryPin(id: string): void {
  const e = entries.value.find((x) => x.id === id)
  if (e) e.pinned = !e.pinned
}

export function wipeVault(): void {
  entries.value = []
}
