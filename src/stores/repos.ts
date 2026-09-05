import { ref } from 'vue'
import type { RepoItem } from '@/types'
import { uid } from '@/lib/utils'

export const repos = ref<RepoItem[]>([])

export const REPO_CATEGORIES = [
  '全部',
  '工具效率',
  '框架库',
  'AI·大模型',
  '自部署',
  '学习资源',
  '灵感参考',
  '其他',
]

export const REPO_CATEGORY_BADGE: Record<string, string> = {
  工具效率: 'badge badge-sky',
  框架库: 'badge badge-emerald',
  'AI·大模型': 'badge badge-fuchsia',
  自部署: 'badge badge-amber',
  学习资源: 'badge badge-cyan',
  灵感参考: 'badge badge-rose',
  其他: 'badge badge-slate',
}

export const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Java: '#b07219',
  Go: '#00ADD8',
  Rust: '#dea584',
  'C++': '#f34b7d',
  C: '#8a8a8a',
  'C#': '#178600',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  HTML: '#e34c26',
  CSS: '#663399',
  Shell: '#89e051',
  PowerShell: '#012456',
  Kotlin: '#A97BFF',
  Swift: '#F05138',
  Dart: '#00B4AB',
  PHP: '#4F5D95',
  Ruby: '#701516',
  Zig: '#ec915c',
  Lua: '#000080',
  Scala: '#c22d40',
  'Jupyter Notebook': '#DA5B0B',
}

export function langColor(lang: string): string {
  return LANG_COLORS[lang] ?? '#94a3b8'
}

export function formatStars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function parseRepoInput(
  input: string,
): { owner: string; repo: string; fullName: string } | null {
  const trimmed = input.trim()
  const urlMatch = trimmed.match(/github\.com\/([\w.-]+)\/([\w.-]+)/i)
  const shortMatch = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/)
  const m = urlMatch ?? shortMatch
  if (!m) return null
  const owner = m[1]
  const repo = m[2].replace(/\.git$/i, '')
  return { owner, repo, fullName: `${owner}/${repo}` }
}

export interface GitHubRepoMeta extends Omit<RepoItem, 'id' | 'category' | 'note' | 'pinned' | 'createdAt' | 'updatedAt'> {
  license: string
  homepage: string
  updatedAt: string
  readme: string
}

async function fetchReadme(fullName: string): Promise<string> {
  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
      headers: { Accept: 'application/vnd.github.raw+json' },
    })
    if (!res.ok) return ''
    return (await res.text()).slice(0, 48_000)
  } catch {
    return ''
  }
}

export async function fetchRepoMeta(input: string): Promise<GitHubRepoMeta> {
  const parsed = parseRepoInput(input)
  if (!parsed) throw new Error('无法识别的仓库地址，请输入 GitHub 链接或 owner/repo 格式')
  const res = await fetch(`https://api.github.com/repos/${parsed.fullName}`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (res.status === 404) throw new Error('仓库不存在或已转为私有')
  if (res.status === 403) throw new Error('GitHub 接口限流中，请稍后再试，或手动填写保存')
  if (!res.ok) throw new Error(`获取仓库信息失败（${res.status}）`)
  const data = (await res.json()) as {
    full_name: string
    html_url: string
    description: string | null
    language: string | null
    topics?: string[]
    stargazers_count: number
    homepage: string | null
    updated_at: string | null
    license: { spdx_id: string | null; name: string | null } | null
  }
  const readme = await fetchReadme(data.full_name)
  return {
    fullName: data.full_name,
    url: data.html_url,
    description: data.description ?? '',
    language: data.language ?? '',
    topics: (data.topics ?? []).slice(0, 6),
    stars: data.stargazers_count ?? 0,
    license: data.license?.spdx_id && data.license.spdx_id !== 'NOASSERTION'
      ? data.license.spdx_id
      : data.license?.name ?? '',
    homepage: data.homepage ?? '',
    updatedAt: data.updated_at ?? '',
    readme,
  }
}

export type RepoDraft = Omit<RepoItem, 'id' | 'createdAt' | 'updatedAt'>

export function addRepo(draft: RepoDraft): void {
  const now = Date.now()
  repos.value.push({ id: uid(), createdAt: now, updatedAt: now, ...draft })
}

export function updateRepo(id: string, patch: Partial<RepoItem>): void {
  const r = repos.value.find((x) => x.id === id)
  if (r) Object.assign(r, patch, { updatedAt: Date.now() })
}

export function removeRepo(id: string): void {
  const i = repos.value.findIndex((r) => r.id === id)
  if (i >= 0) repos.value.splice(i, 1)
}

export function toggleRepoPin(id: string): void {
  const r = repos.value.find((x) => x.id === id)
  if (r) {
    r.pinned = !r.pinned
    r.updatedAt = Date.now()
  }
}
