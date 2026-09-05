<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  BookOpen,
  Cable,
  Copy,
  ExternalLink,
  FolderGit2,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Puzzle,
  Search as SearchIcon,
  Send,
  Tags,
  Trash2,
  X,
} from '@lucide/vue'
import AgentResourceDeleteModal from '@/components/AgentResourceDeleteModal.vue'
import AgentResourceModal from '@/components/AgentResourceModal.vue'
import CardActionMenu from '@/components/CardActionMenu.vue'
import PageHeader from '@/components/PageHeader.vue'
import {
  addAgentResourceTaxonomy,
  agentResourceAgents,
  agentResourceCategories,
  agentResourceKindLabel,
  agentResourceKinds,
  agentResources,
  buildAgentResourcePrompt,
  isCustomAgentResourceTaxonomy,
  removeAgentResource,
  removeAgentResourceTaxonomy,
  toggleAgentResourcePin,
} from '@/stores/agentResources'
import { copyText, toast } from '@/lib/toast'
import { formatDate } from '@/lib/utils'
import type { AgentResource } from '@/types'
import type { AgentResourceTaxonomyGroup } from '@/stores/agentResources'

const router = useRouter()
const query = ref('')
const activeKind = ref('all')
const activeCategory = ref('全部')
const activeAgent = ref('全部')
const customGroup = ref<AgentResourceTaxonomyGroup | null>(null)
const customLabel = ref('')
const showModal = ref(false)
const editing = ref<AgentResource | null>(null)
const deleting = ref<AgentResource | null>(null)
const taxonomyDeleting = ref<{ group: AgentResourceTaxonomyGroup; label: string } | null>(null)
const expandedId = ref<string | null>(null)

const filteredResources = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return [...agentResources.value]
    .filter((resource) => activeKind.value === 'all' || resource.kind === activeKind.value)
    .filter((resource) => activeCategory.value === '全部' || resource.categories.includes(activeCategory.value))
    .filter((resource) => activeAgent.value === '全部' || resource.agents.includes(activeAgent.value))
    .filter((resource) => {
      if (!keyword) return true
      return [
        resource.name,
        resource.summary,
        resource.description,
        resource.useWhen,
        resource.usage,
        resource.githubRepo,
        resource.categories.join(' '),
        resource.agents.join(' '),
        resource.tags.join(' '),
      ].join(' ').toLowerCase().includes(keyword)
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return (b.lastUsedAt ?? b.updatedAt) - (a.lastUsedAt ?? a.updatedAt)
    })
})

const hasFilters = computed(() => activeKind.value !== 'all' || activeCategory.value !== '全部' || activeAgent.value !== '全部' || Boolean(query.value.trim()))

function openCreate(): void {
  editing.value = null
  showModal.value = true
}

function openEdit(resource: AgentResource): void {
  editing.value = resource
  showModal.value = true
}

function clearFilters(): void {
  query.value = ''
  activeKind.value = 'all'
  activeCategory.value = '全部'
  activeAgent.value = '全部'
}

const taxonomyCopy: Record<AgentResourceTaxonomyGroup, string> = { kind: '类型', category: '功能', agent: 'Agent' }

function openCustomTaxonomy(group: AgentResourceTaxonomyGroup): void {
  customGroup.value = customGroup.value === group ? null : group
  customLabel.value = ''
}

function saveCustomTaxonomy(): void {
  if (!customGroup.value) return
  const group = customGroup.value
  const label = addAgentResourceTaxonomy(group, customLabel.value)
  if (!label) { toast('请输入不重复且不超过 24 个字的分类名称'); return }
  if (group === 'kind') activeKind.value = label
  if (group === 'category') activeCategory.value = label
  if (group === 'agent') activeAgent.value = label
  customGroup.value = null
  customLabel.value = ''
  toast(`已新增${taxonomyCopy[group]}“${label}”`)
}

function requestRemoveCustomTaxonomy(group: AgentResourceTaxonomyGroup, label: string): void {
  taxonomyDeleting.value = { group, label }
}

function confirmRemoveCustomTaxonomy(): void {
  const target = taxonomyDeleting.value
  if (!target) return
  if (!removeAgentResourceTaxonomy(target.group, target.label)) return
  if (target.group === 'kind' && activeKind.value === target.label) activeKind.value = 'all'
  if (target.group === 'category' && activeCategory.value === target.label) activeCategory.value = '全部'
  if (target.group === 'agent' && activeAgent.value === target.label) activeAgent.value = '全部'
  taxonomyDeleting.value = null
  toast(`已移除自定义${taxonomyCopy[target.group]}“${target.label}”`)
}

function toggleDetails(id: string): void {
  expandedId.value = expandedId.value === id ? null : id
}

function copyUsage(resource: AgentResource): void {
  void copyText(buildAgentResourcePrompt(resource), '调用说明')
}

function handoffToAi(resource: AgentResource): void {
  void router.push({ name: 'ai', query: { resource: resource.id } })
}

function confirmDelete(): void {
  const resource = deleting.value
  if (!resource) return
  removeAgentResource(resource.id)
  deleting.value = null
  toast('资源已移除')
}

function externalHref(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

function formatGithubUpdatedAt(value: string): string {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return ''
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(timestamp)
}
</script>

<template>
  <div>
    <PageHeader title="Agent 资源库" eyebrow="AI 协作" description="把常用的 SKILL、MCP 与插件收在一起，需要时再带入当前 Agent。">
      <template #actions>
        <button class="ui-primary-button gap-2" @click="openCreate">
          <Plus class="h-4 w-4" />
          收录资源
        </button>
      </template>
    </PageHeader>

    <section class="agent-library-intro mt-6" aria-label="资源库说明">
      <div class="flex min-w-0 items-start gap-3">
        <span class="agent-library-intro-icon"><Tags class="h-4 w-4" /></span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-t1">先收录，再按需交给 Agent</p>
          <p class="mt-1 text-xs leading-relaxed text-t3">资源库记录来源、作用与调用说明；“带到工作台”只会预填消息，真正安装、启动 MCP 或外部操作仍需你确认。</p>
        </div>
        <span class="agent-library-count">{{ agentResources.length }} 项</span>
      </div>
    </section>

    <section class="control-bar mt-5" aria-label="筛选 Agent 资源">
      <label class="control-search min-w-0 flex-1 sm:max-w-80">
        <SearchIcon class="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-t4" />
        <input v-model="query" class="control-input py-2 pl-9 pr-3 text-xs" placeholder="搜索名称、作用、标签或 GitHub" aria-label="搜索 Agent 资源" />
      </label>
      <button v-if="hasFilters" class="filter-reset" @click="clearFilters">清除筛选</button>
      <span class="ml-auto text-xs tabular-nums text-t4">显示 {{ filteredResources.length }} 项</span>
    </section>

    <section class="agent-library-filters mt-3" aria-label="资源分类器">
      <div class="agent-library-filter-row">
        <p>类型</p>
        <div class="min-w-0">
          <div class="filter-rail">
            <button class="filter-chip" :class="{ 'is-active': activeKind === 'all' }" @click="activeKind = 'all'">全部</button>
            <template v-for="kind in agentResourceKinds" :key="kind">
              <span v-if="isCustomAgentResourceTaxonomy('kind', kind)" class="agent-taxonomy-chip">
                <button class="filter-chip" :class="{ 'is-active': activeKind === kind }" @click="activeKind = kind">{{ agentResourceKindLabel(kind) }}</button>
                <button class="agent-taxonomy-remove" type="button" :aria-label="`移除自定义类型 ${kind}`" @click="requestRemoveCustomTaxonomy('kind', kind)"><X class="h-3 w-3" /></button>
              </span>
              <button v-else class="filter-chip" :class="{ 'is-active': activeKind === kind }" @click="activeKind = kind">{{ agentResourceKindLabel(kind) }}</button>
            </template>
            <button type="button" class="agent-taxonomy-add" @click="openCustomTaxonomy('kind')"><Plus class="h-3 w-3" />自定义</button>
          </div>
          <form v-if="customGroup === 'kind'" class="agent-taxonomy-composer" @submit.prevent="saveCustomTaxonomy">
            <span>新增类型</span>
            <input v-model="customLabel" maxlength="24" class="control-input" placeholder="例如：模板" aria-label="新增资源类型" />
            <button class="ui-primary-button text-xs" type="submit">添加</button>
            <button class="ui-ghost-button text-xs" type="button" @click="openCustomTaxonomy('kind')">取消</button>
          </form>
        </div>
      </div>
      <div class="agent-library-filter-row">
        <p>功能</p>
        <div class="min-w-0">
          <div class="filter-rail">
            <button class="filter-chip" :class="{ 'is-active': activeCategory === '全部' }" @click="activeCategory = '全部'">全部</button>
            <template v-for="category in agentResourceCategories" :key="category">
              <span v-if="isCustomAgentResourceTaxonomy('category', category)" class="agent-taxonomy-chip">
                <button class="filter-chip" :class="{ 'is-active': activeCategory === category }" @click="activeCategory = category">{{ category }}</button>
                <button class="agent-taxonomy-remove" type="button" :aria-label="`移除自定义功能 ${category}`" @click="requestRemoveCustomTaxonomy('category', category)"><X class="h-3 w-3" /></button>
              </span>
              <button v-else class="filter-chip" :class="{ 'is-active': activeCategory === category }" @click="activeCategory = category">{{ category }}</button>
            </template>
            <button type="button" class="agent-taxonomy-add" @click="openCustomTaxonomy('category')"><Plus class="h-3 w-3" />自定义</button>
          </div>
          <form v-if="customGroup === 'category'" class="agent-taxonomy-composer" @submit.prevent="saveCustomTaxonomy">
            <span>新增功能</span>
            <input v-model="customLabel" maxlength="24" class="control-input" placeholder="例如：测试" aria-label="新增功能分类" />
            <button class="ui-primary-button text-xs" type="submit">添加</button>
            <button class="ui-ghost-button text-xs" type="button" @click="openCustomTaxonomy('category')">取消</button>
          </form>
        </div>
      </div>
      <div class="agent-library-filter-row">
        <p>Agent</p>
        <div class="min-w-0">
          <div class="filter-rail">
            <button class="filter-chip" :class="{ 'is-active': activeAgent === '全部' }" @click="activeAgent = '全部'">全部</button>
            <template v-for="agent in agentResourceAgents" :key="agent">
              <span v-if="isCustomAgentResourceTaxonomy('agent', agent)" class="agent-taxonomy-chip">
                <button class="filter-chip" :class="{ 'is-active': activeAgent === agent }" @click="activeAgent = agent">{{ agent }}</button>
                <button class="agent-taxonomy-remove" type="button" :aria-label="`移除自定义 Agent ${agent}`" @click="requestRemoveCustomTaxonomy('agent', agent)"><X class="h-3 w-3" /></button>
              </span>
              <button v-else class="filter-chip" :class="{ 'is-active': activeAgent === agent }" @click="activeAgent = agent">{{ agent }}</button>
            </template>
            <button type="button" class="agent-taxonomy-add" @click="openCustomTaxonomy('agent')"><Plus class="h-3 w-3" />自定义</button>
          </div>
          <form v-if="customGroup === 'agent'" class="agent-taxonomy-composer" @submit.prevent="saveCustomTaxonomy">
            <span>新增 Agent</span>
            <input v-model="customLabel" maxlength="24" class="control-input" placeholder="例如：Windsurf" aria-label="新增 Agent 分类" />
            <button class="ui-primary-button text-xs" type="submit">添加</button>
            <button class="ui-ghost-button text-xs" type="button" @click="openCustomTaxonomy('agent')">取消</button>
          </form>
        </div>
      </div>
    </section>

    <div v-if="filteredResources.length === 0" class="empty-state mt-6">
      <BookOpen class="mx-auto h-10 w-10 text-t4" />
      <p class="mt-4 text-sm font-medium text-t2">{{ hasFilters ? '没有匹配的资源' : '还没有收录任何 Agent 资源' }}</p>
      <p class="mt-1 text-xs text-t4">{{ hasFilters ? '试试调整分类器，或清除筛选。' : '从常用的 SKILL、MCP、插件或 GitHub 仓库开始即可。' }}</p>
      <button v-if="hasFilters" class="ui-secondary-button mt-4 text-xs" @click="clearFilters">清除筛选</button>
      <button v-else class="ui-primary-button mt-4 gap-2" @click="openCreate"><Plus class="h-4 w-4" />收录第一项资源</button>
    </div>

    <div v-else class="agent-resource-grid mt-6">
      <article v-for="resource in filteredResources" :key="resource.id" class="agent-resource-card" :class="{ 'is-expanded': expandedId === resource.id }">
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 items-start gap-3">
            <span class="agent-resource-icon" :class="{ 'is-mcp': resource.kind === 'mcp', 'is-plugin': resource.kind === 'plugin' }">
              <Cable v-if="resource.kind === 'mcp'" class="h-4 w-4" />
              <Puzzle v-else-if="resource.kind === 'plugin'" class="h-4 w-4" />
              <BookOpen v-else class="h-4 w-4" />
            </span>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="agent-resource-kind" :class="{ 'is-mcp': resource.kind === 'mcp', 'is-plugin': resource.kind === 'plugin' }">{{ agentResourceKindLabel(resource.kind) }}</span>
                <span class="agent-resource-scope">{{ resource.scope === 'global' ? '全局' : '项目级' }}</span>
                <Pin v-if="resource.pinned" class="h-3.5 w-3.5 text-primary" aria-label="已置顶" />
              </div>
              <h2 class="mt-2 truncate text-base font-semibold text-t1">{{ resource.name }}</h2>
            </div>
          </div>
          <CardActionMenu :label="`更多 ${resource.name} 操作`">
            <button class="menu-item" @click="toggleAgentResourcePin(resource.id)">
              <PinOff v-if="resource.pinned" class="h-3.5 w-3.5" />
              <Pin v-else class="h-3.5 w-3.5" />
              {{ resource.pinned ? '取消置顶' : '置顶' }}
            </button>
            <button class="menu-item" @click="openEdit(resource)">
              <Pencil class="h-3.5 w-3.5" />
              编辑
            </button>
            <button class="menu-item is-danger" @click="deleting = resource">
              <Trash2 class="h-3.5 w-3.5" />
              移除
            </button>
          </CardActionMenu>
        </div>

        <p class="mt-4 line-clamp-2 text-sm leading-relaxed text-t2">{{ resource.summary }}</p>
        <p v-if="resource.useWhen" class="mt-2 line-clamp-1 text-xs text-t4">适用：{{ resource.useWhen }}</p>

        <div v-if="resource.categories.length || resource.agents.length" class="mt-4 flex flex-wrap gap-1.5">
          <span v-for="category in resource.categories" :key="category" class="agent-resource-meta-chip">{{ category }}</span>
          <span v-for="agent in resource.agents" :key="agent" class="agent-resource-meta-chip is-agent">{{ agent }}</span>
        </div>

        <div class="agent-resource-reference mt-4">
          <a v-if="externalHref(resource.githubUrl)" :href="externalHref(resource.githubUrl)" target="_blank" rel="noreferrer" class="agent-resource-link">
            <FolderGit2 class="h-3.5 w-3.5" />
            <span class="truncate">{{ resource.githubRepo || 'GitHub 仓库' }}</span>
            <span v-if="resource.githubStars" class="shrink-0 tabular-nums text-t4">★ {{ resource.githubStars.toLocaleString() }}</span>
            <ExternalLink class="h-3 w-3 shrink-0" />
          </a>
          <span v-else class="text-xs text-t4">已收录 · 未关联 GitHub</span>
          <span v-if="resource.lastUsedAt" class="text-xs tabular-nums text-t4">上次使用 {{ formatDate(resource.lastUsedAt) }}</span>
        </div>

        <div v-if="expandedId === resource.id" class="agent-resource-details mt-4">
          <p v-if="resource.description" class="whitespace-pre-wrap text-xs leading-relaxed text-t3">{{ resource.description }}</p>
          <div v-if="resource.githubLanguage || resource.githubLicense || resource.githubHomepage || resource.githubUpdatedAt" class="agent-resource-detail-block">
            <p>GitHub 信息</p>
            <span>
              <template v-if="resource.githubLanguage">{{ resource.githubLanguage }}</template>
              <template v-if="resource.githubLanguage && resource.githubLicense"> · </template>
              <template v-if="resource.githubLicense">{{ resource.githubLicense }}</template>
              <template v-if="resource.githubUpdatedAt"> · 更新于 {{ formatGithubUpdatedAt(resource.githubUpdatedAt) }}</template>
            </span>
            <a v-if="externalHref(resource.githubHomepage)" :href="externalHref(resource.githubHomepage)" target="_blank" rel="noreferrer" class="mt-1 inline-flex text-xs text-primary hover:text-primary-strong">项目主页</a>
          </div>
          <div v-if="resource.compatibility || resource.sourcePath" class="grid gap-2 sm:grid-cols-2">
            <div v-if="resource.compatibility" class="agent-resource-detail-block">
              <p>环境</p>
              <span>{{ resource.compatibility }}</span>
            </div>
            <div v-if="resource.sourcePath" class="agent-resource-detail-block">
              <p>来源</p>
              <span class="font-mono">{{ resource.sourcePath }}</span>
            </div>
          </div>
          <div v-if="resource.kind === 'mcp'" class="agent-resource-detail-block">
            <p>连接</p>
            <span>{{ resource.mcpTransport }}<template v-if="resource.mcpCapabilities.length"> · {{ resource.mcpCapabilities.join(' / ') }}</template></span>
          </div>
          <div v-if="resource.usage" class="agent-resource-detail-block">
            <p>调用说明</p>
            <span class="whitespace-pre-wrap">{{ resource.usage }}</span>
          </div>
          <div v-if="resource.kind === 'mcp' && resource.configSnippet" class="agent-resource-detail-block">
            <p>配置片段</p>
            <pre>{{ resource.configSnippet }}</pre>
          </div>
          <div v-if="resource.tags.length" class="flex flex-wrap gap-1.5">
            <span v-for="tag in resource.tags" :key="tag" class="agent-resource-tag">#{{ tag }}</span>
          </div>
        </div>

        <div class="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <button type="button" class="resource-card-expand" @click="toggleDetails(resource.id)">{{ expandedId === resource.id ? '收起详情' : '查看详情' }}</button>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="ui-secondary-button gap-1.5 text-xs" @click="copyUsage(resource)">
              <Copy class="h-3.5 w-3.5" />
              复制说明
            </button>
            <button type="button" class="ui-primary-button gap-1.5 text-xs" @click="handoffToAi(resource)">
              <Send class="h-3.5 w-3.5" />
              带到工作台
            </button>
          </div>
        </div>
      </article>
    </div>

    <AgentResourceModal :open="showModal" :entry="editing" @close="showModal = false" />
    <AgentResourceDeleteModal :open="Boolean(deleting)" :title="deleting?.name ?? ''" @close="deleting = null" @confirm="confirmDelete" />
    <AgentResourceDeleteModal
      :open="Boolean(taxonomyDeleting)"
      :title="taxonomyDeleting?.label ?? ''"
      heading="移除自定义分类"
      :description="taxonomyDeleting?.group === 'kind' ? '会从类型列表移除，并将使用它的资源安全回退为 SKILL。' : '会从分类列表移除，并解除已收录资源上的这一分类。'"
      confirm-label="确认移除"
      @close="taxonomyDeleting = null"
      @confirm="confirmRemoveCustomTaxonomy"
    />
  </div>
</template>
