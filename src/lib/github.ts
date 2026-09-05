import { ref } from 'vue'
import { decryptJSON, encryptJSON } from '@/lib/crypto'
import { getActiveKey } from '@/lib/keyring'
import { readJSON, writeJSON } from '@/lib/utils'

const CFG_KEY = 'xk.github.cfg'
const SEC_KEY = 'xk.github.secure'
const API = 'https://api.github.com'

export interface GithubCfg {
  username: string
}

export const githubCfg = ref<GithubCfg | null>(readJSON<GithubCfg>(CFG_KEY))
export const githubHasToken = ref(Boolean(readJSON<{ ivB64: string; ctB64: string }>(SEC_KEY)))

interface RawRepo {
  full_name: string
  html_url: string
  description: string | null
  language: string | null
  stargazers_count: number
  open_issues_count: number
  private: boolean
  updated_at: string
}

export interface RepoBrief {
  fullName: string
  url: string
  description: string
  language: string
  stars: number
  issues: number
  privateFlag: boolean
  updatedAt: number
}

export interface IssueBrief {
  number: number
  title: string
  url: string
  comments: number
  updatedAt: number
}

function mapRepo(r: RawRepo): RepoBrief {
  return {
    fullName: r.full_name,
    url: r.html_url,
    description: r.description ?? '',
    language: r.language ?? '',
    stars: r.stargazers_count ?? 0,
    issues: r.open_issues_count ?? 0,
    privateFlag: r.private === true,
    updatedAt: Date.parse(r.updated_at),
  }
}

class GhError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function gh<T>(path: string, token?: string | null): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
  } catch {
    throw new Error('网络异常，无法访问 GitHub；请检查网络或代理设置')
  }
  const body = (await res.json().catch(() => null)) as (T & { message?: string }) | null
  const detail = body?.message ?? ''
  if (res.status === 401) throw new GhError('Token 未通过验证（401）', 401)
  if (res.status === 403 || res.status === 429) {
    throw new GhError(`GitHub 拒绝访问（403）：${detail || '权限不足或触发限流'}`, 403)
  }
  if (res.status === 404) throw new GhError('未找到：仓库可能不存在、已私有或已删除（404）', 404)
  if (!res.ok) throw new GhError(`GitHub 请求失败（${res.status}）${detail ? `：${detail}` : ''}`, res.status)
  return body as T
}

async function loadToken(): Promise<string | null> {
  const secure = readJSON<{ ivB64: string; ctB64: string }>(SEC_KEY)
  const key = getActiveKey()
  if (!secure || !key) return null
  try {
    return await decryptJSON<string>(key, secure.ivB64, secure.ctB64)
  } catch {
    return null
  }
}

export async function searchRepositories(query: string, perPage = 12): Promise<RepoBrief[]> {
  const q = query.trim()
  if (!q) return []
  const token = await loadToken()
  const data = await gh<{ items: RawRepo[] }>(
    `/search/repositories?q=${encodeURIComponent(q)}&sort=best-match&per_page=${perPage}`,
    token,
  )
  return (data.items ?? []).map(mapRepo)
}

export async function fetchMyRepositories(): Promise<RepoBrief[]> {
  const cfg = githubCfg.value
  if (!cfg) throw new Error('尚未连接 GitHub')
  const token = await loadToken()
  const path = token
    ? '/user/repos?sort=updated&per_page=100&affiliation=owner'
    : `/users/${encodeURIComponent(cfg.username)}/repos?sort=updated&per_page=100`
  const data = await gh<RawRepo[]>(path, token)
  return (data ?? []).map(mapRepo)
}

export async function fetchRepoIssues(fullName: string): Promise<IssueBrief[]> {
  const token = await loadToken()
  const data = await gh<
    {
      number: number
      title: string
      html_url: string
      comments: number
      updated_at: string
      pull_request?: unknown
    }[]
  >(`/repos/${fullName}/issues?state=open&per_page=10`, token)
  return (data ?? [])
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      url: i.html_url,
      comments: i.comments ?? 0,
      updatedAt: Date.parse(i.updated_at),
    }))
}

const TOKEN_PREFIXES = ['ghp_', 'github_pat_', 'gho_', 'ghu_', 'ghs_', 'ghr_']

export async function saveConnection(username: string, token: string | null): Promise<void> {
  let name = username.trim()
  if (token) {
    const key = getActiveKey()
    if (!key) throw new Error('数据已锁定')
    const clean = token.replace(/\s+/g, '')
    if (!clean) throw new Error('Token 内容为空')
    let login = ''
    try {
      const user = await gh<{ login: string }>('/user', clean)
      login = user.login
    } catch (e) {
      if (e instanceof GhError && e.status === 401) {
        const known = TOKEN_PREFIXES.some((p) => clean.startsWith(p))
        throw new Error(
          known
            ? `Token 验证失败（401）：${clean.startsWith('github_pat_') ? '请确认未过期，且生成时已选择仓库资源（Metadata 只读会自动勾选）' : '请确认未过期、未被撤销；classic Token 不勾选任何权限也可以读账号与公开仓库'}`
            : '粘贴的内容不是 GitHub Token 的标准格式（应以 ghp_、github_pat_、gho_ 等开头）。请到 GitHub → Settings → Developer settings → Personal access tokens 生成后重新粘贴（已自动去除其中的空格换行）',
        )
      }
      if (e instanceof GhError && e.status === 403) {
        throw new Error(
          'GitHub 返回 403：Token 权限不足或触发限流。Fine-grained Token 请确认已选择仓库资源并授予 Metadata 只读权限',
        )
      }
      throw e
    }
    name = login
    writeJSON(SEC_KEY, await encryptJSON(key, clean))
    githubHasToken.value = true
  } else {
    if (name.includes('@')) {
      throw new Error('不使用 Token 时，请填写 GitHub 用户名（非邮箱）；或粘贴 Token 自动识别账号')
    }
    try {
      localStorage.removeItem(SEC_KEY)
    } catch {
      /* ignore */
    }
    githubHasToken.value = false
  }
  githubCfg.value = { username: name }
  writeJSON(CFG_KEY, { ...githubCfg.value })
}

export async function disconnectGitHub(): Promise<void> {
  try {
    localStorage.removeItem(CFG_KEY)
    localStorage.removeItem(SEC_KEY)
  } catch {
    /* ignore */
  }
  githubCfg.value = null
  githubHasToken.value = false
}
