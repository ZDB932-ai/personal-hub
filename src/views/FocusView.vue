<script setup lang="ts">
import TaskScene from '@/components/TaskScene.vue'
import ProjectStory from '@/components/ProjectStory.vue'
import DayClosing from '@/components/DayClosing.vue'
import TaskResume from '@/components/TaskResume.vue'
import PageHeader from '@/components/PageHeader.vue'
import { computed, onUnmounted, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Bookmark, Check, Leaf, Lock, Play, Plus } from '@lucide/vue'
import { tasks } from '@/stores/tasks'
import { longPlans, weeklyPlans } from '@/stores/planning'
import { lockApp, isGated } from '@/stores/lock'
import { collectPocketDraft, pocketDraft, writePocketDraft, saveResume } from '@/stores/attention'
import { focusCandidates } from '@/lib/attention'
import { taskPlans } from '@/lib/calendarConnections'
import { todayYMD } from '@/lib/utils'
import { completeWithProgress, type CompletionInput } from '@/lib/taskCompletion'
import { persistNow, flushPendingSave, hasPendingSave } from '@/stores/database'
import { toast } from '@/lib/toast'
import { openHubItem } from '@/stores/hub'
import CalendarTaskContext from '@/components/CalendarTaskContext.vue'
import InspirationPocket from '@/components/InspirationPocket.vue'
import FocusTrail from '@/components/FocusTrail.vue'
import TaskCompletionModal from '@/components/TaskCompletionModal.vue'
import '@/attention-workspace.css'

const route = useRoute(), router = useRouter()
const today = ref(todayYMD())
const timer = setInterval(() => { today.value = todayYMD() }, 60000)
onUnmounted(() => clearInterval(timer))
const task = computed(() => tasks.value.find(item => item.id === route.query.task))
const selected = computed(() => route.path === '/focus' && typeof route.query.task === 'string')
const tab = computed(() => route.path === '/collect' ? 'pocket' : route.query.tab === 'pocket' ? 'pocket' : route.query.tab === 'trail' ? 'trail' : route.query.tab === 'story' ? 'story' : route.query.tab === 'closing' ? 'closing' : route.path === '/review' ? 'trail' : 'start')
const returnTo = computed(() => typeof route.query.from === 'string' && /^(\/|\/(today|calendar|collect|review|focus)(\?[^#]*)?)$/.test(route.query.from) ? route.query.from : '/')
const workspaceTitle = computed(() => tab.value === 'pocket' ? '收集箱' : tab.value === 'start' ? '开始一件事' : '回顾')
const workspaceDescription = computed(() => tab.value === 'pocket' ? '先记下想法，再决定留作便签还是转成任务。' : tab.value === 'start' ? '从重点、继续线索和待安排中挑选。' : '查看完成的事情，留下进展，为下一次做准备。')
const draft = computed({ get: () => pocketDraft(selected.value ? String(route.query.task) : undefined)?.content ?? '', set: value => writePocketDraft(value, selected.value ? String(route.query.task) : undefined) })
const completing = ref(false)
const saving = ref(false)
const search = ref('')
const candidates = computed(() => focusCandidates(tasks.value, today.value).filter(item => {
  const goal = taskPlans(item, weeklyPlans.value, longPlans.value).goal
  return (!goal || (goal.status === 'active' && (!goal.deferredUntil || goal.deferredUntil <= today.value))) && item.title.toLowerCase().includes(search.value.trim().toLowerCase())
}))
async function guard(): Promise<boolean> {
  if (isGated.value) return true
  try { await flushPendingSave(); return true }
  catch { toast('草稿尚未保存，请重试后再离开', 'error'); return false }
}
onBeforeRouteLeave(guard)
onBeforeRouteUpdate(async () => { const allowed = await guard(); if (allowed) completing.value = false; return allowed })
function beforeUnload(event: BeforeUnloadEvent): void {
  if (!hasPendingSave()) return
  event.preventDefault()
  event.returnValue = ''
}
window.addEventListener('beforeunload', beforeUnload)
onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload))
async function savePocket(): Promise<void> {
  await collectPocketDraft(selected.value ? String(route.query.task) : undefined, persistNow)
}
async function pause(): Promise<void> {
  saving.value = true
  try { await savePocket(); await flushPendingSave(); const failure = await router.push(returnTo.value); if (!failure) toast('继续线索已保存，安心停在这里') }
  catch { toast('保存失败，请留在当前页重试', 'error') }
  finally { saving.value = false }
}
async function finish(input: CompletionInput): Promise<void> {
  if (task.value && completeWithProgress(task.value.id, input)) {
    completing.value = false
    try { await savePocket(); await flushPendingSave(); const failure = await router.push('/review'); if (!failure) toast('这一步已留下') }
    catch { toast('完成记录尚未保存，请重试保存', 'error') }
  }
}
async function lock(): Promise<void> { try { await savePocket(); await lockApp() } catch { toast('保存失败，暂未锁定', 'error') } }
</script>
<template>
  <div class="attention-workspace" :class="{ 'is-working': selected }">
    <header v-if="selected" class="attention-header"><RouterLink :to="returnTo" class="flex min-h-11 items-center gap-2 text-sm text-t3 hover:text-primary"><ArrowLeft class="h-4 w-4" />返回工作区</RouterLink><p class="text-xs text-t3">此刻 · 一件事</p><button class="ui-icon-button" aria-label="锁定专注空间" @click="lock"><Lock class="h-4 w-4" /></button></header>
    <template v-if="selected && task && !task.done">
      <div class="attention-focus-grid">
        <section class="attention-desk" aria-label="当前任务"><p class="attention-eyebrow"><Play class="h-4 w-4" />现在，只做这一件</p><h1 class="attention-title">{{ task.title }}</h1><p class="mt-4 text-sm text-t3">{{ task.date ? `${task.date}${task.time ? ` · ${task.time}` : ''}` : '尚未排期，也可以现在开始' }}{{ task.estimatedMinutes ? ` · 预计 ${task.estimatedMinutes} 分钟` : '' }}</p>
          <div class="attention-bookmark"><p class="flex items-center gap-2 text-sm font-medium text-primary"><Bookmark class="h-4 w-4" />回来时，从这里继续</p><p class="mt-2 text-xs leading-6 text-t3">现在可以沿着上次的线索开始；离开前，给下次的自己留一句话。输入会自动保存。</p><label class="mt-5 block text-xs text-t3">做到哪里了<textarea :value="task.resumeNote ?? ''" maxlength="2000" rows="3" class="control-input mt-2 resize-y px-3 py-2" placeholder="例如：选好了三张照片，第二张的色调还没统一" @input="saveResume(task.id, 'resumeNote', ($event.target as HTMLTextAreaElement).value)"></textarea></label><label class="mt-4 block text-xs text-t3">下次回来，先做什么<input :value="task.resumeNextStep ?? ''" maxlength="2000" class="control-input mt-2 px-3" placeholder="例如：打开修图文件，先调整第二张" @input="saveResume(task.id, 'resumeNextStep', ($event.target as HTMLInputElement).value)" /></label></div>
          <TaskScene :key="task.id" :task="task" /><details class="attention-materials"><summary>手边的资料与任务背景</summary><p v-if="task.notes" class="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-t2">{{ task.notes }}</p><CalendarTaskContext :task="task" /><button class="min-h-11 text-xs text-primary" @click="openHubItem('tasks', task.id)">编辑任务或关联资料</button></details>
          <footer class="attention-actions"><button class="ui-primary-button gap-2" @click="completing = true"><Check class="h-4 w-4" />完成这一件</button><button class="ui-secondary-button" :disabled="saving" @click="pause">{{ saving ? '正在保存…' : '保存线索，先停在这里' }}</button></footer>
        </section>
        <aside><InspirationPocket v-model:draft="draft" :task-id="task.id" /><div class="attention-aside-note"><Leaf class="h-4 w-4 text-primary" /><p>这里不累计连胜，也不催你加速。休息时，可以把下一步留给之后的自己。</p></div></aside>
      </div>
      <TaskCompletionModal :open="completing" :task="task" @close="completing = false" @confirm="finish" />
    </template>
    <div v-else-if="selected" class="attention-empty"><Check class="h-8 w-8 text-primary" /><h1 class="mt-4 text-xl text-t1">{{ task ? '这件事已经完成' : '这件事已移除或尚未同步' }}</h1><p class="mt-3 text-sm text-t3">可以回到工作入口，选择接下来想做的事。</p><TaskResume v-if="task" :task="task" /><CalendarTaskContext v-if="task" :task="task" /><RouterLink to="/focus" class="ui-secondary-button mt-5">返回开始</RouterLink><button v-if="task" class="ui-secondary-button mt-3" @click="pause">重试保存并返回</button></div>
    <template v-else>
      <PageHeader :title="workspaceTitle" :description="workspaceDescription" />
      <nav v-if="tab !== 'start' && tab !== 'pocket'" class="attention-tabs mt-5" aria-label="回顾视图"><RouterLink to="/review" :aria-current="tab === 'trail' ? 'page' : undefined">完成记录</RouterLink><RouterLink to="/review?tab=story" :aria-current="tab === 'story' ? 'page' : undefined">项目进展</RouterLink><RouterLink to="/review?tab=closing" :aria-current="tab === 'closing' ? 'page' : undefined">一天收尾</RouterLink></nav>
      <section v-if="tab === 'start'" class="attention-picker"><div class="flex flex-wrap items-center justify-between gap-3"><h2 class="text-lg font-medium text-t1">从重点、继续线索和待安排中挑选</h2><button class="ui-secondary-button gap-2" @click="openHubItem('tasks')"><Plus class="h-4 w-4" />添加一件事</button></div><input v-model="search" class="control-input my-5 px-3" aria-label="查找可开始的任务" placeholder="查找想做的事" /><RouterLink v-for="item in candidates" :key="item.id" :to="{ path: '/focus', query: { task: item.id } }" class="attention-choice"><span class="min-w-0"><span class="text-xs text-primary">{{ item.focusDate === today ? '今日重点' : item.resumeUpdatedAt ? '有继续线索' : item.date ? '已安排' : '待安排' }}</span><span class="mt-2 block break-words text-base font-medium text-t1">{{ item.title }}</span><span v-if="item.resumeNextStep || item.resumeNote" class="mt-2 block line-clamp-2 text-sm leading-6 text-t3">{{ item.resumeNextStep || item.resumeNote }}</span></span><ArrowRight class="h-5 w-5 shrink-0 text-primary" /></RouterLink><p v-if="!candidates.length" class="py-8 text-sm leading-7 text-t3">{{ search ? '没有匹配任务，换个关键词看看。' : '目前没有待开始的事。可以添加一件，也可以安心留白。' }}</p><RouterLink to="/calendar" class="mt-4 flex min-h-11 items-center text-sm text-primary">去日历安排时间，或保护一段留白 →</RouterLink></section>
      <InspirationPocket v-else-if="tab === 'pocket'" v-model:draft="draft" review />
      <ProjectStory v-else-if="tab === 'story'" :goal-id="typeof route.query.goal === 'string' ? route.query.goal : undefined" /><DayClosing v-else-if="tab === 'closing'" /><FocusTrail v-else />
    </template>
  </div>
</template>
