import type { VaultPayload } from '@/types'
import type { HubKind } from '@/stores/hub'

export interface SearchItem { kind: HubKind; id: string; title: string; detail: string; text: string }
export const hubLabels: Record<HubKind, string> = { tasks: '任务', memos: '备忘录', docMetas: '资料', repos: '项目', entries: '账号' }

export function searchHub(data: Pick<VaultPayload, 'tasks' | 'memos' | 'docMetas' | 'repos' | 'entries'>, query: string, kind: string = 'all'): SearchItem[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const result: SearchItem[] = []
  const add = (type: HubKind, id: string, title: string, detail: string, fields: string[]) => {
    if (kind !== 'all' && type !== kind) return
    const text = [title, detail, ...fields].join(' ').toLocaleLowerCase()
    if (words.every(word => text.includes(word))) result.push({ kind: type, id, title, detail, text: '' })
  }
  for (const x of data.tasks ?? []) add('tasks', x.id, x.title, x.date || '待安排', [x.notes, x.resumeNote ?? '', x.resumeNextStep ?? '', ...(x.tags ?? []), ...(x.subtasks ?? []).map(s => s.title)])
  for (const x of data.memos ?? []) add('memos', x.id, x.title || '未命名备忘录', x.content.slice(0, 90), [x.content, x.openingNote ?? ''])
  for (const x of data.docMetas ?? []) add('docMetas', x.id, x.name, x.category, [x.note, ...x.tags])
  for (const x of data.repos ?? []) add('repos', x.id, x.fullName, x.description, [x.note, ...x.topics])
  for (const x of data.entries) add('entries', x.id, x.title, x.username, [x.url, x.category])
  return result.sort((a, b) => Number(b.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) - Number(a.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))).slice(0, 80)
}
