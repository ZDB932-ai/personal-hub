import { computed, ref } from 'vue'
import type { AgentResource, AgentResourceKind, AgentResourceScope, AgentResourceTaxonomy, McpTransport } from '@/types'
import { uid } from '@/lib/utils'

export const AGENT_RESOURCE_KINDS = ['skill', 'mcp', 'plugin'] as const
export const AGENT_RESOURCE_CATEGORIES = ['开发', '设计', '研究', '文档', '自动化', '数据', '运维', '效率', '其他']
export const AGENT_RESOURCE_AGENTS = ['Codex', 'Claude Code', 'Cursor', 'OpenCode', 'pi', 'Gemini CLI', '通用']

export const AGENT_RESOURCE_CATEGORY_BADGE: Record<string, string> = {
  开发: 'badge badge-emerald',
  设计: 'badge badge-fuchsia',
  研究: 'badge badge-sky',
  文档: 'badge badge-cyan',
  自动化: 'badge badge-amber',
  数据: 'badge badge-rose',
  运维: 'badge badge-slate',
  效率: 'badge badge-emerald',
  其他: 'badge badge-slate',
}

export const agentResources = ref<AgentResource[]>([])
export const agentResourceTaxonomy = ref<AgentResourceTaxonomy>({ customKinds: [], customCategories: [], customAgents: [] })

export type AgentResourceTaxonomyGroup = 'kind' | 'category' | 'agent'

function mergeTaxonomy(defaults: readonly string[], custom: string[]): string[] {
  const seen = new Set<string>()
  return [...defaults, ...custom].filter((item) => {
    const key = item.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const agentResourceKinds = computed(() => mergeTaxonomy(AGENT_RESOURCE_KINDS, agentResourceTaxonomy.value.customKinds))
export const agentResourceCategories = computed(() => mergeTaxonomy(AGENT_RESOURCE_CATEGORIES, agentResourceTaxonomy.value.customCategories))
export const agentResourceAgents = computed(() => mergeTaxonomy(AGENT_RESOURCE_AGENTS, agentResourceTaxonomy.value.customAgents))

export interface AgentResourceDraft {
  name: string
  kind: AgentResourceKind
  scope: AgentResourceScope
  summary: string
  description: string
  categories: string[]
  agents: string[]
  tags: string[]
  useWhen: string
  usage: string
  githubUrl: string
  githubRepo: string
  githubDescription: string
  githubStars: number
  githubTopics: string[]
  githubLanguage: string
  githubLicense: string
  githubHomepage: string
  githubUpdatedAt: string
  docsUrl: string
  sourcePath: string
  compatibility: string
  mcpTransport: McpTransport
  mcpCapabilities: Array<'tools' | 'prompts' | 'resources'>
  configSnippet: string
  pinned: boolean
}

const VALID_SCOPES: AgentResourceScope[] = ['global', 'project']
const VALID_TRANSPORTS: McpTransport[] = ['stdio', 'streamable-http', 'sse', 'other']
const VALID_CAPABILITIES: Array<'tools' | 'prompts' | 'resources'> = ['tools', 'prompts', 'resources']

function uniqueStrings(value: unknown, max = 24): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean))].slice(0, max)
}

function normalizeUrl(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return ''
  if (/^[\w.-]+\/[\w.-]+$/.test(raw)) return `https://github.com/${raw.replace(/\.git$/i, '')}`
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : ''
  } catch {
    return ''
  }
}

export function normalizeAgentResource(resource: Partial<AgentResource>): AgentResource {
  const kind = typeof resource.kind === 'string' && resource.kind.trim() ? resource.kind.trim() : 'skill'
  const scope = VALID_SCOPES.includes(resource.scope as AgentResourceScope) ? resource.scope as AgentResourceScope : 'project'
  const transport = VALID_TRANSPORTS.includes(resource.mcpTransport as McpTransport)
    ? resource.mcpTransport as McpTransport
    : 'stdio'
  const capabilities = uniqueStrings(resource.mcpCapabilities, 3)
    .filter((item): item is 'tools' | 'prompts' | 'resources' => VALID_CAPABILITIES.includes(item as 'tools' | 'prompts' | 'resources'))
  const now = Date.now()
  return {
    id: typeof resource.id === 'string' && resource.id ? resource.id : uid(),
    name: typeof resource.name === 'string' ? resource.name.trim() : '',
    kind,
    scope,
    summary: typeof resource.summary === 'string' ? resource.summary.trim() : '',
    description: typeof resource.description === 'string' ? resource.description.trim() : '',
    categories: uniqueStrings(resource.categories, 16),
    agents: uniqueStrings(resource.agents, 16),
    tags: uniqueStrings(resource.tags, 24),
    useWhen: typeof resource.useWhen === 'string' ? resource.useWhen.trim() : '',
    usage: typeof resource.usage === 'string' ? resource.usage.trim() : '',
    githubUrl: normalizeUrl(resource.githubUrl),
    githubRepo: typeof resource.githubRepo === 'string' ? resource.githubRepo.trim() : '',
    githubDescription: typeof resource.githubDescription === 'string' ? resource.githubDescription.trim() : '',
    githubStars: Math.max(0, Number(resource.githubStars) || 0),
    githubTopics: uniqueStrings(resource.githubTopics, 12),
    githubLanguage: typeof resource.githubLanguage === 'string' ? resource.githubLanguage.trim() : '',
    githubLicense: typeof resource.githubLicense === 'string' ? resource.githubLicense.trim() : '',
    githubHomepage: normalizeUrl(resource.githubHomepage),
    githubUpdatedAt: typeof resource.githubUpdatedAt === 'string' ? resource.githubUpdatedAt.trim() : '',
    docsUrl: normalizeUrl(resource.docsUrl),
    sourcePath: typeof resource.sourcePath === 'string' ? resource.sourcePath.trim() : '',
    compatibility: typeof resource.compatibility === 'string' ? resource.compatibility.trim() : '',
    mcpTransport: transport,
    mcpCapabilities: capabilities,
    configSnippet: typeof resource.configSnippet === 'string' ? resource.configSnippet.trim() : '',
    pinned: Boolean(resource.pinned),
    lastUsedAt: typeof resource.lastUsedAt === 'number' ? resource.lastUsedAt : undefined,
    createdAt: typeof resource.createdAt === 'number' ? resource.createdAt : now,
    updatedAt: typeof resource.updatedAt === 'number' ? resource.updatedAt : now,
  }
}

export function resetAgentResources(): void {
  agentResources.value = []
}

function normalizeTaxonomyValues(value: unknown, defaults: readonly string[]): string[] {
  const defaultKeys = new Set(defaults.map((item) => item.toLocaleLowerCase()))
  return uniqueStrings(value, 32).filter((item) => !defaultKeys.has(item.toLocaleLowerCase()))
}

export function setAgentResourceTaxonomy(value?: Partial<AgentResourceTaxonomy>): void {
  agentResourceTaxonomy.value = {
    customKinds: normalizeTaxonomyValues(value?.customKinds, AGENT_RESOURCE_KINDS),
    customCategories: normalizeTaxonomyValues(value?.customCategories, AGENT_RESOURCE_CATEGORIES),
    customAgents: normalizeTaxonomyValues(value?.customAgents, AGENT_RESOURCE_AGENTS),
  }
}

export function resetAgentResourceTaxonomy(): void {
  setAgentResourceTaxonomy()
}

export function agentResourceTaxonomySnapshot(): AgentResourceTaxonomy {
  return {
    customKinds: [...agentResourceTaxonomy.value.customKinds],
    customCategories: [...agentResourceTaxonomy.value.customCategories],
    customAgents: [...agentResourceTaxonomy.value.customAgents],
  }
}

export function addAgentResourceTaxonomy(group: AgentResourceTaxonomyGroup, value: string): string | null {
  const label = value.trim().replace(/\s+/g, ' ')
  if (!label || label.length > 24) return null
  const current = group === 'kind'
    ? agentResourceKinds.value
    : group === 'category'
      ? agentResourceCategories.value
      : agentResourceAgents.value
  if (current.some((item) => item.localeCompare(label, undefined, { sensitivity: 'accent' }) === 0)) return null
  const next = agentResourceTaxonomySnapshot()
  if (group === 'kind') next.customKinds.push(label)
  if (group === 'category') next.customCategories.push(label)
  if (group === 'agent') next.customAgents.push(label)
  setAgentResourceTaxonomy(next)
  return label
}

export function isCustomAgentResourceTaxonomy(group: AgentResourceTaxonomyGroup, value: string): boolean {
  const values = group === 'kind'
    ? agentResourceTaxonomy.value.customKinds
    : group === 'category'
      ? agentResourceTaxonomy.value.customCategories
      : agentResourceTaxonomy.value.customAgents
  return values.some((item) => item.localeCompare(value, undefined, { sensitivity: 'accent' }) === 0)
}

export function removeAgentResourceTaxonomy(group: AgentResourceTaxonomyGroup, value: string): boolean {
  if (!isCustomAgentResourceTaxonomy(group, value)) return false
  const matches = (item: string) => item.localeCompare(value, undefined, { sensitivity: 'accent' }) === 0
  const next = agentResourceTaxonomySnapshot()
  if (group === 'kind') next.customKinds = next.customKinds.filter((item) => !matches(item))
  if (group === 'category') next.customCategories = next.customCategories.filter((item) => !matches(item))
  if (group === 'agent') next.customAgents = next.customAgents.filter((item) => !matches(item))
  const now = Date.now()
  for (const resource of agentResources.value) {
    if (group === 'kind' && matches(resource.kind)) {
      resource.kind = 'skill'
      resource.updatedAt = now
    }
    if (group === 'category' && resource.categories.some(matches)) {
      resource.categories = resource.categories.filter((item) => !matches(item))
      resource.updatedAt = now
    }
    if (group === 'agent' && resource.agents.some(matches)) {
      resource.agents = resource.agents.filter((item) => !matches(item))
      resource.updatedAt = now
    }
  }
  setAgentResourceTaxonomy(next)
  return true
}

export function syncAgentResourceTaxonomyFromResources(resources = agentResources.value): void {
  const next = agentResourceTaxonomySnapshot()
  for (const resource of resources) {
    if (!AGENT_RESOURCE_KINDS.some((item) => item.toLocaleLowerCase() === resource.kind.toLocaleLowerCase())) next.customKinds.push(resource.kind)
    next.customCategories.push(...resource.categories)
    next.customAgents.push(...resource.agents)
  }
  setAgentResourceTaxonomy(next)
}

export function addAgentResource(draft: AgentResourceDraft): AgentResource {
  const now = Date.now()
  const resource = normalizeAgentResource({ id: uid(), ...draft, createdAt: now, updatedAt: now })
  agentResources.value.push(resource)
  return resource
}

export function updateAgentResource(id: string, patch: Partial<AgentResourceDraft>): void {
  const resource = agentResources.value.find((item) => item.id === id)
  if (!resource) return
  Object.assign(resource, normalizeAgentResource({ ...resource, ...patch, id: resource.id, createdAt: resource.createdAt, updatedAt: Date.now() }))
}

export function removeAgentResource(id: string): void {
  const index = agentResources.value.findIndex((item) => item.id === id)
  if (index >= 0) agentResources.value.splice(index, 1)
}

export function toggleAgentResourcePin(id: string): void {
  const resource = agentResources.value.find((item) => item.id === id)
  if (!resource) return
  resource.pinned = !resource.pinned
  resource.updatedAt = Date.now()
}

export function markAgentResourceUsed(id: string): void {
  const resource = agentResources.value.find((item) => item.id === id)
  if (!resource) return
  const now = Date.now()
  resource.lastUsedAt = now
  resource.updatedAt = now
}

export function getAgentResource(id: string): AgentResource | undefined {
  return agentResources.value.find((item) => item.id === id)
}

export function agentResourceKindLabel(kind: AgentResourceKind): string {
  if (kind === 'mcp') return 'MCP'
  if (kind === 'plugin') return '插件'
  return kind === 'skill' ? 'SKILL' : kind
}

export function buildAgentResourcePrompt(resource: AgentResource): string {
  const parts = [
    '我想在本次任务中参考以下资源。请先判断它是否适用；如需安装、启动 MCP、读取凭据或执行外部操作，请先说明并等待我确认。',
    `资源：${resource.name}`,
    `类型：${agentResourceKindLabel(resource.kind)}`,
    `范围：${resource.scope === 'global' ? '全局' : '项目级'}`,
    `作用：${resource.summary}`,
  ]
  if (resource.useWhen) parts.push(`适用场景：${resource.useWhen}`)
  if (resource.description) parts.push(`介绍：${resource.description}`)
  if (resource.usage) parts.push(`调用说明：\n${resource.usage}`)
  if (resource.kind === 'mcp' && resource.configSnippet) parts.push(`配置片段（不含真实密钥）：\n${resource.configSnippet}`)
  if (resource.githubUrl) parts.push(`GitHub：${resource.githubUrl}`)
  if (resource.docsUrl) parts.push(`文档：${resource.docsUrl}`)
  return parts.join('\n\n')
}
