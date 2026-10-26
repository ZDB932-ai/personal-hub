<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ChevronDown, FolderGit2, Plus, Search, X } from '@lucide/vue'
import AppSelect from '@/components/AppSelect.vue'
import AgentResourceDeleteModal from '@/components/AgentResourceDeleteModal.vue'
import ModalShell from '@/components/ModalShell.vue'
import {
  AGENT_RESOURCE_KINDS,
  addAgentResourceTaxonomy,
  addAgentResource,
  agentResourceAgents,
  agentResourceCategories,
  agentResourceKindLabel,
  agentResourceKinds,
  isCustomAgentResourceTaxonomy,
  removeAgentResourceTaxonomy,
  updateAgentResource,
  type AgentResourceDraft,
  type AgentResourceTaxonomyGroup,
} from '@/stores/agentResources'
import { fetchRepoMeta } from '@/stores/repos'
import { toast } from '@/lib/toast'
import type { AgentResource } from '@/types'

const props = defineProps<{ open: boolean; entry: AgentResource | null }>()
const emit = defineEmits<{ close: [] }>()

function resourceDefaults(): AgentResourceDraft {
  return {
    name: '', kind: 'skill', scope: 'project', summary: '', description: '', categories: ['其他'], agents: ['通用'], tags: [], useWhen: '', usage: '',
    githubUrl: '', githubRepo: '', githubDescription: '', githubStars: 0, githubTopics: [], githubLanguage: '', githubLicense: '', githubHomepage: '', githubUpdatedAt: '',
    docsUrl: '', sourcePath: '', compatibility: '', mcpTransport: 'stdio', mcpCapabilities: [], configSnippet: '', pinned: false,
  }
}

const form = reactive<AgentResourceDraft>(resourceDefaults())
const tagsInput = ref('')
const error = ref('')
const githubLoading = ref(false)
const completionNote = ref('')
const customGroup = ref<AgentResourceTaxonomyGroup | null>(null)
const customLabel = ref('')
const taxonomyDeleting = ref<{ group: AgentResourceTaxonomyGroup; label: string } | null>(null)
const typeCustomAction = ref<'menu' | 'add' | 'remove' | null>(null)
const classificationCustomMenu = ref<'category' | 'agent' | null>(null)
const classificationDeleteGroup = ref<'category' | 'agent' | null>(null)
const inputCls = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-t1 placeholder:text-t4 outline-none transition focus:border-primary/60 focus:bg-surface-2 focus:ring-2 focus:ring-primary/25'
const customKinds = computed(() => agentResourceKinds.value.filter((kind) => isCustomAgentResourceTaxonomy('kind', kind)))
const customCategories = computed(() => agentResourceCategories.value.filter((item) => isCustomAgentResourceTaxonomy('category', item)))
const customAgents = computed(() => agentResourceAgents.value.filter((item) => isCustomAgentResourceTaxonomy('agent', item)))

function splitTags(value: string): string[] {
  return [...new Set(value.split(/[，,]/).map((item) => item.trim()).filter(Boolean))].slice(0, 24)
}

function resetForm(entry: AgentResource | null): void {
  error.value = ''
  githubLoading.value = false
  completionNote.value = ''
  customGroup.value = null
  customLabel.value = ''
  taxonomyDeleting.value = null
  typeCustomAction.value = null
  classificationCustomMenu.value = null
  classificationDeleteGroup.value = null
  if (!entry) {
    Object.assign(form, resourceDefaults())
    tagsInput.value = ''
    return
  }
  Object.assign(form, {
    name: entry.name, kind: entry.kind, scope: entry.scope, summary: entry.summary, description: entry.description,
    categories: [...entry.categories], agents: [...entry.agents], tags: [...entry.tags], useWhen: entry.useWhen, usage: entry.usage,
    githubUrl: entry.githubUrl, githubRepo: entry.githubRepo, githubDescription: entry.githubDescription, githubStars: entry.githubStars, githubTopics: [...entry.githubTopics],
    githubLanguage: entry.githubLanguage, githubLicense: entry.githubLicense, githubHomepage: entry.githubHomepage, githubUpdatedAt: entry.githubUpdatedAt,
    docsUrl: entry.docsUrl, sourcePath: entry.sourcePath, compatibility: entry.compatibility, mcpTransport: entry.mcpTransport,
    mcpCapabilities: [...entry.mcpCapabilities], configSnippet: entry.configSnippet, pinned: entry.pinned,
  })
  tagsInput.value = entry.tags.join('，')
}

function toggleCategory(value: string): void {
  form.categories = form.categories.includes(value) ? form.categories.filter((item) => item !== value) : [...form.categories, value]
}

function toggleAgent(value: string): void {
  form.agents = form.agents.includes(value) ? form.agents.filter((item) => item !== value) : [...form.agents, value]
}

function saveCustomTaxonomy(): void {
  if (!customGroup.value) return
  const group = customGroup.value
  const label = addAgentResourceTaxonomy(group, customLabel.value)
  if (!label) { error.value = '请输入不重复且不超过 24 个字的分类名称'; return }
  if (group === 'kind') form.kind = label
  if (group === 'category' && !form.categories.includes(label)) form.categories = [...form.categories, label]
  if (group === 'agent' && !form.agents.includes(label)) form.agents = [...form.agents, label]
  customGroup.value = null
  customLabel.value = ''
  error.value = ''
  toast(`已添加“${label}”`)
}

function openTypeCustomMenu(): void {
  typeCustomAction.value = typeCustomAction.value ? null : 'menu'
  customLabel.value = ''
}

function beginCustomKindAdd(): void {
  customGroup.value = null
  typeCustomAction.value = 'add'
  customLabel.value = ''
}

function saveCustomKind(): void {
  const label = addAgentResourceTaxonomy('kind', customLabel.value)
  if (!label) { error.value = '请输入不重复且不超过 24 个字的类型名称'; return }
  form.kind = label
  customLabel.value = ''
  typeCustomAction.value = null
  error.value = ''
  toast(`已添加“${label}”`)
}

function beginCustomKindRemove(): void {
  typeCustomAction.value = 'remove'
  customLabel.value = ''
}

function openClassificationCustomMenu(group: 'category' | 'agent'): void {
  classificationDeleteGroup.value = null
  customGroup.value = null
  classificationCustomMenu.value = classificationCustomMenu.value === group ? null : group
}

function beginClassificationAdd(group: 'category' | 'agent'): void {
  classificationCustomMenu.value = null
  customGroup.value = group
  customLabel.value = ''
}

function beginClassificationRemove(group: 'category' | 'agent'): void {
  classificationCustomMenu.value = null
  customGroup.value = null
  classificationDeleteGroup.value = group
}

function confirmRemoveCustomTaxonomy(): void {
  const target = taxonomyDeleting.value
  if (!target) return
  if (removeAgentResourceTaxonomy(target.group, target.label)) {
    if (target.group === 'kind' && form.kind === target.label) form.kind = 'skill'
    if (target.group === 'category') form.categories = form.categories.filter((item) => item !== target.label)
    if (target.group === 'agent') form.agents = form.agents.filter((item) => item !== target.label)
  }
  taxonomyDeleting.value = null
  toast(`已移除自定义${target.group === 'kind' ? '类型' : target.group === 'category' ? '功能' : 'Agent'}“${target.label}”`)
}

function toggleCapability(value: 'tools' | 'prompts' | 'resources'): void {
  form.mcpCapabilities = form.mcpCapabilities.includes(value) ? form.mcpCapabilities.filter((item) => item !== value) : [...form.mcpCapabilities, value]
}

function inferCategories(value: string): string[] {
  const hints: Array<[string, RegExp]> = [
    ['设计', /design|ui|ux|tailwind|css|figma/i], ['文档', /docs?|markdown|pdf|docx|writing/i], ['自动化', /automation|workflow|github actions|mcp/i],
    ['数据', /data|database|sql|analytics/i], ['运维', /docker|kubernetes|deploy|devops|infra/i], ['研究', /research|search|paper|knowledge/i],
    ['效率', /productivity|task|todo|time/i], ['开发', /code|developer|programming|typescript|javascript|python|vue|react/i],
  ]
  return hints.filter(([, pattern]) => pattern.test(value)).map(([category]) => category).slice(0, 2)
}

function inferAgents(value: string): string[] {
  const hints: Array<[string, RegExp]> = [
    ['Codex', /\bcodex\b|openai/i], ['Claude Code', /claude|anthropic/i], ['Cursor', /\bcursor\b/i], ['OpenCode', /\bopencode\b/i], ['pi', /\bpi\b/i], ['Gemini CLI', /gemini/i],
  ]
  return hints.filter(([, pattern]) => pattern.test(value)).map(([agent]) => agent)
}

function extractReadmeSection(readme: string, keywords: string[]): string {
  const lines = readme.replace(/\r/g, '').split('\n')
  const headingIndex = lines.findIndex((line) => {
    const heading = line.match(/^#{1,4}\s+(.+)/)
    return heading ? keywords.some((keyword) => heading[1].toLowerCase().includes(keyword)) : false
  })
  if (headingIndex < 0) return ''
  const content: string[] = []
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (/^#{1,4}\s+/.test(lines[index])) break
    content.push(lines[index])
  }
  return content.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 900)
}

function extractSourcePath(readme: string): string {
  const match = readme.match(/(?:~\/|\.\.?\/|\.[\w-]+\/)[^\s`'"\\]*(?:skills?|mcp)[^\s`'"\\]*/i)
  return match?.[0]?.replace(/[),.;:]+$/, '') ?? ''
}

function inferCompatibility(readme: string, agents: string[]): string {
  const values = [...agents]
  const node = readme.match(/node(?:\.js)?\s*(?:>=|v)?\s*(\d{1,2})/i)
  const python = readme.match(/python\s*(?:>=|v)?\s*(\d(?:\.\d+)?)/i)
  if (node) values.push(`Node ${node[1]}+`)
  if (python) values.push(`Python ${python[1]}+`)
  return [...new Set(values)].join(' · ')
}

async function loadGithub(): Promise<void> {
  error.value = ''
  completionNote.value = ''
  const input = form.githubUrl.trim()
  if (!input) { error.value = '先填写 GitHub 仓库链接或 owner/repo'; return }
  githubLoading.value = true
  try {
    const meta = await fetchRepoMeta(input)
    const sourceText = `${meta.fullName} ${meta.description} ${meta.topics.join(' ')}`
    const suggestedCategories = inferCategories(sourceText)
    const suggestedAgents = inferAgents(sourceText)
    const filled: string[] = []
    Object.assign(form, {
      githubUrl: meta.url, githubRepo: meta.fullName, githubDescription: meta.description, githubStars: meta.stars, githubTopics: [...meta.topics],
      githubLanguage: meta.language, githubLicense: meta.license, githubHomepage: meta.homepage, githubUpdatedAt: meta.updatedAt,
    })
    if (!form.name.trim()) { form.name = meta.fullName.split('/').pop() ?? meta.fullName; filled.push('名称') }
    if (!form.summary.trim() && meta.description) { form.summary = meta.description; filled.push('一句话作用') }
    if (!form.description.trim() && meta.description) { form.description = meta.description; filled.push('介绍') }
    if (!form.docsUrl.trim()) { form.docsUrl = meta.homepage || `${meta.url}#readme`; filled.push('文档链接') }
    const usage = extractReadmeSection(meta.readme, ['usage', 'quick start', 'getting started', '使用', '调用', '快速开始'])
    if (!form.usage.trim() && usage) { form.usage = usage; filled.push('调用说明') }
    const sourcePath = extractSourcePath(meta.readme)
    if (!form.sourcePath.trim() && sourcePath) { form.sourcePath = sourcePath; filled.push('安装位置') }
    const compatibility = inferCompatibility(meta.readme, suggestedAgents)
    if (!form.compatibility.trim() && compatibility) { form.compatibility = compatibility; filled.push('兼容性') }
    const initialTags = splitTags(tagsInput.value)
    const mergedTags = [...new Set([...initialTags, ...meta.topics])]
    if (mergedTags.length > initialTags.length) { tagsInput.value = mergedTags.join('，'); filled.push('标签') }
    if (form.categories.length === 1 && form.categories[0] === '其他' && suggestedCategories.length) { form.categories = suggestedCategories; filled.push('功能分类') }
    if (form.agents.length === 1 && form.agents[0] === '通用' && suggestedAgents.length) { form.agents = suggestedAgents; filled.push('适用 Agent') }
    const mcpHint = /\bmcp\b|model context protocol/i.test(sourceText) && form.kind !== 'mcp'
    completionNote.value = `已读取公开仓库信息${filled.length ? `，补齐${filled.join('、')}` : ''}${mcpHint ? '；仓库似乎与 MCP 有关，请确认资源类型。' : '。'}`
    toast('GitHub 信息已补全')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '获取 GitHub 信息失败'
  } finally {
    githubLoading.value = false
  }
}

function save(): void {
  const name = form.name.trim()
  const summary = form.summary.trim()
  if (!name) { error.value = '请填写资源名称'; return }
  if (!summary) { error.value = '请用一句话说明它的作用'; return }
  const draft: AgentResourceDraft = {
    ...form, name, summary, description: form.description.trim(), categories: [...form.categories], agents: [...form.agents], tags: splitTags(tagsInput.value),
    useWhen: form.useWhen.trim(), usage: form.usage.trim(), githubUrl: form.githubUrl.trim(), githubRepo: form.githubRepo.trim(), githubDescription: form.githubDescription.trim(), githubTopics: [...form.githubTopics],
    githubLanguage: form.githubLanguage.trim(), githubLicense: form.githubLicense.trim(), githubHomepage: form.githubHomepage.trim(), githubUpdatedAt: form.githubUpdatedAt.trim(),
    docsUrl: form.docsUrl.trim(), sourcePath: form.sourcePath.trim(), compatibility: form.compatibility.trim(), configSnippet: form.configSnippet.trim(),
  }
  if (props.entry) { updateAgentResource(props.entry.id, draft); toast('资源已更新') } else { addAgentResource(draft); toast('已收录到 Agent 资源库') }
  emit('close')
}

watch(() => props.open, (open) => { if (open) resetForm(props.entry) }, { immediate: true })
</script>

<template>
  <ModalShell :open="open" max-width="max-w-2xl" @close="emit('close')">
    <header class="agent-resource-modal-header">
      <div>
        <p class="text-xs font-medium text-primary">Agent 资源库</p>
        <h3 class="mt-1 text-xl font-semibold text-t1">{{ entry ? '编辑资源' : '收录资源' }}</h3>
        <p class="mt-2 text-sm text-t3">记录它的作用、来源与适用范围。</p>
      </div>
      <button aria-label="关闭" class="ui-icon-button" @click="emit('close')"><X class="h-5 w-5" /></button>
    </header>

    <div class="mt-6 space-y-5">
      <section class="agent-resource-identity">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p class="agent-resource-field-label">资源类型</p>
            <div class="agent-resource-choice-row agent-resource-type-choice-row" role="group" aria-label="资源类型">
              <button v-for="kind in AGENT_RESOURCE_KINDS" :key="kind" type="button" :class="{ 'is-active': form.kind === kind }" :aria-pressed="form.kind === kind" @click="form.kind = kind">{{ agentResourceKindLabel(kind) }}</button>
              <span v-for="kind in customKinds" :key="kind" class="agent-resource-type-custom-choice" :class="{ 'is-active': form.kind === kind, 'is-removable': typeCustomAction === 'remove' }">
                <button type="button" :aria-pressed="form.kind === kind" @click="form.kind = kind">{{ agentResourceKindLabel(kind) }}</button>
                <button v-if="typeCustomAction === 'remove'" type="button" :aria-label="`移除自定义类型 ${kind}`" @click="taxonomyDeleting = { group: 'kind', label: kind }"><X class="h-3 w-3" /></button>
              </span>
            </div>
            <div v-if="typeCustomAction === 'menu'" class="agent-taxonomy-action-menu mt-2">
              <button type="button" class="agent-taxonomy-action" @click="beginCustomKindAdd"><Plus class="h-3.5 w-3.5" />添加类型</button>
              <button v-if="customKinds.length" type="button" class="agent-taxonomy-action is-danger" @click="beginCustomKindRemove"><X class="h-3.5 w-3.5" />删除类型</button>
              <button type="button" class="ui-ghost-button text-xs" @click="openTypeCustomMenu">取消</button>
            </div>
            <form v-else-if="typeCustomAction === 'add'" class="agent-taxonomy-composer mt-2" @submit.prevent="saveCustomKind">
              <span>添加类型</span>
              <input v-model="customLabel" maxlength="24" :class="inputCls" placeholder="例如：模板" aria-label="添加资源类型" />
              <button type="submit" class="ui-primary-button text-xs">添加</button>
              <button type="button" class="ui-ghost-button text-xs" @click="typeCustomAction = null">取消</button>
            </form>
            <div v-else-if="typeCustomAction === 'remove'" class="agent-taxonomy-remove-hint mt-2"><span>点击标签右侧的 × 删除</span><button type="button" class="ui-ghost-button text-xs" @click="typeCustomAction = null">完成</button></div>
            <button v-else type="button" class="agent-taxonomy-add mt-2" @click="openTypeCustomMenu"><Plus class="h-3 w-3" />自定义类型</button>
          </div>
          <div>
            <p class="agent-resource-field-label">作用范围</p>
            <div class="agent-resource-choice-row" role="group" aria-label="资源作用范围">
              <button type="button" :class="{ 'is-active': form.scope === 'project' }" :aria-pressed="form.scope === 'project'" @click="form.scope = 'project'">项目级</button>
              <button type="button" :class="{ 'is-active': form.scope === 'global' }" :aria-pressed="form.scope === 'global'" @click="form.scope = 'global'">全局</button>
            </div>
          </div>
        </div>
        <div class="mt-4 space-y-4">
          <label class="block sm:max-w-sm"><span class="agent-resource-field-label">名称 *</span><input v-model="form.name" :class="inputCls" placeholder="例如：frontend-ui-engineering" /></label>
          <label class="block"><span class="agent-resource-field-label">一句话作用 *</span><textarea v-model="form.summary" rows="2" :class="inputCls" placeholder="例如：为 Vue 页面做可维护的 UI 实现"></textarea></label>
        </div>
      </section>

      <section class="agent-resource-github-panel">
        <div class="flex min-w-0 items-start gap-3">
          <span class="agent-resource-github-icon"><FolderGit2 class="h-4 w-4" /></span>
          <div class="min-w-0"><p class="text-sm font-semibold text-t2">GitHub 补全</p><p class="mt-0.5 text-xs leading-relaxed text-t4">读取公开仓库与 README，补齐来源、调用说明和环境要求。</p></div>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <input v-model="form.githubUrl" :class="inputCls" class="min-w-0 flex-1 font-mono text-xs" placeholder="owner/repo 或 GitHub 链接（选填）" @keydown.enter.prevent="loadGithub" />
          <button :disabled="githubLoading || !form.githubUrl.trim()" type="button" class="ui-secondary-button shrink-0 gap-1.5 text-xs disabled:opacity-40" @click="loadGithub"><Search class="h-3.5 w-3.5" :class="{ 'animate-spin': githubLoading }" />{{ githubLoading ? '读取中' : '补全' }}</button>
        </div>
        <div v-if="form.githubRepo" class="agent-resource-github-result">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1"><span class="font-mono font-medium text-primary">{{ form.githubRepo }}</span><span v-if="form.githubStars" class="tabular-nums">★ {{ form.githubStars.toLocaleString() }}</span><span v-if="form.githubLanguage">{{ form.githubLanguage }}</span><span v-if="form.githubLicense">{{ form.githubLicense }}</span></div>
          <p v-if="form.githubDescription" class="mt-1 line-clamp-2 text-xs leading-relaxed text-t3">{{ form.githubDescription }}</p>
        </div>
        <p v-if="completionNote" class="mt-2 text-xs leading-relaxed text-ok">{{ completionNote }}</p>
      </section>

      <section class="agent-resource-classification">
        <div class="flex flex-wrap items-baseline justify-between gap-2"><p class="text-sm font-semibold text-t2">分类与适配</p><span class="text-xs text-t4">用于资源库筛选</span></div>
        <div class="mt-3 space-y-3">
          <div class="agent-resource-filter-line"><span>功能</span><div><div class="flex flex-wrap gap-1.5"><template v-for="category in agentResourceCategories" :key="category"><span v-if="isCustomAgentResourceTaxonomy('category', category)" class="agent-taxonomy-selection" :class="{ 'is-removable': classificationDeleteGroup === 'category' }"><button type="button" class="filter-chip" :class="{ 'is-active': form.categories.includes(category) }" @click="toggleCategory(category)">{{ category }}</button><button v-if="classificationDeleteGroup === 'category'" type="button" :aria-label="`移除自定义功能 ${category}`" @click="taxonomyDeleting = { group: 'category', label: category }"><X class="h-3 w-3" /></button></span><button v-else type="button" class="filter-chip" :class="{ 'is-active': form.categories.includes(category) }" @click="toggleCategory(category)">{{ category }}</button></template><button v-if="!classificationCustomMenu && customGroup !== 'category' && classificationDeleteGroup !== 'category'" type="button" class="agent-taxonomy-add" @click="openClassificationCustomMenu('category')"><Plus class="h-3 w-3" />自定义</button></div><div v-if="classificationCustomMenu === 'category'" class="agent-taxonomy-action-menu mt-2"><button type="button" class="agent-taxonomy-action" @click="beginClassificationAdd('category')"><Plus class="h-3.5 w-3.5" />添加功能</button><button v-if="customCategories.length" type="button" class="agent-taxonomy-action is-danger" @click="beginClassificationRemove('category')"><X class="h-3.5 w-3.5" />删除功能</button><button type="button" class="ui-ghost-button text-xs" @click="openClassificationCustomMenu('category')">取消</button></div><form v-if="customGroup === 'category'" class="agent-taxonomy-composer mt-2" @submit.prevent="saveCustomTaxonomy"><span>添加功能</span><input v-model="customLabel" maxlength="24" :class="inputCls" placeholder="例如：测试" aria-label="添加功能分类" /><button type="submit" class="ui-primary-button text-xs">添加</button><button type="button" class="ui-ghost-button text-xs" @click="customGroup = null">取消</button></form><div v-if="classificationDeleteGroup === 'category'" class="agent-taxonomy-remove-hint mt-2"><span>点击自定义功能右侧的 × 删除</span><button type="button" class="ui-ghost-button text-xs" @click="classificationDeleteGroup = null">完成</button></div></div></div>
          <div class="agent-resource-filter-line"><span>Agent</span><div><div class="flex flex-wrap gap-1.5"><template v-for="agent in agentResourceAgents" :key="agent"><span v-if="isCustomAgentResourceTaxonomy('agent', agent)" class="agent-taxonomy-selection" :class="{ 'is-removable': classificationDeleteGroup === 'agent' }"><button type="button" class="filter-chip" :class="{ 'is-active': form.agents.includes(agent) }" @click="toggleAgent(agent)">{{ agent }}</button><button v-if="classificationDeleteGroup === 'agent'" type="button" :aria-label="`移除自定义 Agent ${agent}`" @click="taxonomyDeleting = { group: 'agent', label: agent }"><X class="h-3 w-3" /></button></span><button v-else type="button" class="filter-chip" :class="{ 'is-active': form.agents.includes(agent) }" @click="toggleAgent(agent)">{{ agent }}</button></template><button v-if="!classificationCustomMenu && customGroup !== 'agent' && classificationDeleteGroup !== 'agent'" type="button" class="agent-taxonomy-add" @click="openClassificationCustomMenu('agent')"><Plus class="h-3 w-3" />自定义</button></div><div v-if="classificationCustomMenu === 'agent'" class="agent-taxonomy-action-menu mt-2"><button type="button" class="agent-taxonomy-action" @click="beginClassificationAdd('agent')"><Plus class="h-3.5 w-3.5" />添加 Agent</button><button v-if="customAgents.length" type="button" class="agent-taxonomy-action is-danger" @click="beginClassificationRemove('agent')"><X class="h-3.5 w-3.5" />删除 Agent</button><button type="button" class="ui-ghost-button text-xs" @click="openClassificationCustomMenu('agent')">取消</button></div><form v-if="customGroup === 'agent'" class="agent-taxonomy-composer mt-2" @submit.prevent="saveCustomTaxonomy"><span>添加 Agent</span><input v-model="customLabel" maxlength="24" :class="inputCls" placeholder="例如：Windsurf" aria-label="添加 Agent 分类" /><button type="submit" class="ui-primary-button text-xs">添加</button><button type="button" class="ui-ghost-button text-xs" @click="customGroup = null">取消</button></form><div v-if="classificationDeleteGroup === 'agent'" class="agent-taxonomy-remove-hint mt-2"><span>点击自定义 Agent 右侧的 × 删除</span><button type="button" class="ui-ghost-button text-xs" @click="classificationDeleteGroup = null">完成</button></div></div></div>
        </div>
      </section>

      <details class="agent-resource-advanced">
        <summary><span><strong>补充信息</strong><small>场景、调用说明、安装位置与配置</small></span><ChevronDown class="agent-resource-disclosure-chevron h-4 w-4" /></summary>
        <div class="agent-resource-advanced-body space-y-4">
          <label class="block"><span class="agent-resource-field-label">何时使用 / 触发场景</span><input v-model="form.useWhen" :class="inputCls" placeholder="例如：页面改版、组件视觉评审、检查响应式时" /></label>
          <label class="block"><span class="agent-resource-field-label">标签 <span class="font-normal text-t4">（用逗号分隔）</span></span><input v-model="tagsInput" :class="inputCls" placeholder="vue，设计系统，代码审查" /></label>
          <label class="block"><span class="agent-resource-field-label">补充介绍</span><textarea v-model="form.description" rows="2" :class="inputCls" placeholder="它解决什么问题、有哪些边界或特点（选填）"></textarea></label>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label class="block"><span class="agent-resource-field-label">文档链接</span><input v-model="form.docsUrl" :class="inputCls" placeholder="https://...（选填）" /></label>
            <label class="block"><span class="agent-resource-field-label">兼容性 / 环境要求</span><input v-model="form.compatibility" :class="inputCls" placeholder="例如：Codex CLI、Node 20+" /></label>
          </div>
          <label v-if="form.kind !== 'mcp'" class="block"><span class="agent-resource-field-label">来源路径或安装位置</span><input v-model="form.sourcePath" :class="inputCls" class="font-mono text-xs" :placeholder="form.kind === 'plugin' ? '例如：.codex/plugins/my-plugin' : '例如：.opencode/skills/frontend-ui-engineering'" /></label>
          <template v-else>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label class="block"><span class="agent-resource-field-label">传输方式</span><AppSelect v-model="form.mcpTransport" :options="[{ value: 'stdio', label: 'stdio（本地命令）' }, { value: 'streamable-http', label: 'Streamable HTTP' }, { value: 'sse', label: 'SSE（兼容）' }, { value: 'other', label: '其他' }]" /></label>
              <div><p class="agent-resource-field-label">提供的能力</p><div class="flex flex-wrap gap-1.5"><button v-for="capability in ([{ value: 'tools', label: '工具' }, { value: 'prompts', label: '提示' }, { value: 'resources', label: '资源' }] as const)" :key="capability.value" type="button" class="filter-chip" :class="{ 'is-active': form.mcpCapabilities.includes(capability.value) }" :aria-pressed="form.mcpCapabilities.includes(capability.value)" @click="toggleCapability(capability.value)">{{ capability.label }}</button></div></div>
            </div>
            <label class="block"><span class="agent-resource-field-label">配置片段 <span class="font-normal text-t4">（仅变量占位符，不填真实密钥）</span></span><textarea v-model="form.configSnippet" rows="4" :class="inputCls" class="font-mono text-xs" placeholder='例如：{ "command": "npx", "args": ["-y", "@scope/server"] }'></textarea></label>
          </template>
          <label class="block"><span class="agent-resource-field-label">调用说明 / 使用方式</span><textarea v-model="form.usage" rows="3" :class="inputCls" placeholder="例如：先读取 SKILL.md，再根据任务按需使用；或写下交给 Agent 的具体说明"></textarea></label>
        </div>
      </details>

      <label class="flex cursor-pointer items-center gap-2 text-xs text-t3"><input v-model="form.pinned" type="checkbox" class="accent-primary" />置顶这项资源</label>
      <p v-if="error" class="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">{{ error }}</p>
    </div>
    <footer class="agent-resource-modal-actions"><button class="ui-ghost-button" @click="emit('close')">取消</button><button class="ui-primary-button" @click="save">{{ entry ? '保存修改' : '收录资源' }}</button></footer>
    <AgentResourceDeleteModal
      :open="Boolean(taxonomyDeleting)"
      :title="taxonomyDeleting?.label ?? ''"
      :heading="taxonomyDeleting?.group === 'kind' ? '移除自定义类型' : '移除自定义分类'"
      :description="taxonomyDeleting?.group === 'kind' ? '会从类型列表移除，并将使用它的资源安全回退为 SKILL。' : '会从分类列表移除，并解除已收录资源上的这一分类。'"
      confirm-label="确认移除"
      @close="taxonomyDeleting = null"
      @confirm="confirmRemoveCustomTaxonomy"
    />
  </ModalShell>
</template>
