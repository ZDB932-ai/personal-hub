export interface ProfileInfo {
  name: string
  nickname: string
  bio: string
  email: string
  phone: string
  birthday: string
  location: string
  github: string
  blog: string
}

export interface VaultEntry {
  id: string
  title: string
  username: string
  password: string
  url: string
  notes: string
  category: string
  totp?: string
  pinned?: boolean
  lastUsedAt?: number
  createdAt: number
  updatedAt: number
}

export type VaultDraft = Omit<VaultEntry, 'id' | 'createdAt' | 'updatedAt'>

export interface KdfParams {
  algo: 'argon2id'
  saltHex: string
  memKiB: number
  timeCost: number
  parallelism: number
}

export interface DataEnvelope {
  v: 2
  kdf: KdfParams
  ts: number
  ivB64: string
  ctB64: string
}

export interface VaultPayload {
  profile: ProfileInfo
  entries: VaultEntry[]
  tasks?: Task[]
  weeklyPlans?: WeeklyPlan[]
  longPlans?: LongPlan[]
  planner?: PlannerState
  agentResources?: AgentResource[]
  agentResourceTaxonomy?: AgentResourceTaxonomy
  memos?: Memo[]
  docMetas?: DocMeta[]
  repos?: RepoItem[]
}

export interface RepoItem {
  id: string
  fullName: string
  url: string
  description: string
  language: string
  topics: string[]
  stars: number
  category: string
  note: string
  pinned: boolean
  createdAt: number
  updatedAt: number
}

export type TaskRepeat = 'none' | 'daily' | 'weekly' | 'workdays'
export type TaskPriority = 1 | 2 | 3
export type PlannerEnergy = 'gentle' | 'steady' | 'focused'
export type LongPlanStatus = 'active' | 'paused' | 'completed' | 'wish'
export type LongPlanHorizon = 'month' | 'quarter' | 'year' | 'custom'
export type AgentResourceKind = string
export type AgentResourceScope = 'global' | 'project'
export type McpTransport = 'stdio' | 'streamable-http' | 'sse' | 'other'

export interface SubTask {
  id: string
  title: string
  done: boolean
}

export interface Task {
  id: string
  title: string
  notes: string
  date: string
  time: string
  priority: TaskPriority
  repeat: TaskRepeat
  done: boolean
  doneAt?: number
  focusDate?: string
  weeklyPlanId?: string
  longPlanId?: string
  scheduledBy?: 'manual' | 'weekly-auto'
  scheduleLocked?: boolean
  lastRemindedTs?: number
  tags: string[]
  subtasks: SubTask[]
  createdAt: number
  updatedAt: number
}

export interface WeeklyPlan {
  id: string
  title: string
  notes: string
  weekStart: string
  priority: TaskPriority
  sessions: number
  preferredWeekdays: number[]
  longPlanId?: string
  taskIds: string[]
  createdAt: number
  updatedAt: number
}

export interface LongPlan {
  id: string
  title: string
  description: string
  area: string
  horizon: LongPlanHorizon
  targetDate: string
  nextStep: string
  status: LongPlanStatus
  createdAt: number
  updatedAt: number
}

export interface PlannerState {
  energy: PlannerEnergy
  restDates: string[]
  dayEnergies: PlannerDayEnergy[]
}

export interface PlannerDayEnergy {
  date: string
  energy: PlannerEnergy
}

export interface AgentResource {
  id: string
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
  lastUsedAt?: number
  createdAt: number
  updatedAt: number
}

export interface AgentResourceTaxonomy {
  customKinds: string[]
  customCategories: string[]
  customAgents: string[]
}

export interface Memo {
  id: string
  title: string
  content: string
  color: string
  pinned: boolean
  createdAt: number
  updatedAt: number
}

export interface DocMeta {
  id: string
  name: string
  category: string
  tags: string[]
  note: string
  size: number
  mime: string
  pinned: boolean
  createdAt: number
}
