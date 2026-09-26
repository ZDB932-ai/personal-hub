<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { ArrowUpRight, Plus, Search, ListTodo, StickyNote, FolderOpen, CheckCheck } from '@lucide/vue'
import { tasks } from '@/stores/tasks'
import { memos } from '@/stores/memos'
import { docMetas } from '@/stores/docs'
import { repos } from '@/stores/repos'
import { hubSearchOpen, openHubItem, type HubKind } from '@/stores/hub'
import { todayYMD, formatDate } from '@/lib/utils'
import { dayCapacity, dayLoad } from '@/stores/planning'

const day = ref(todayYMD())
const timer = setInterval(() => { day.value = todayYMD() }, 60000)
onUnmounted(() => clearInterval(timer))
const today = computed(() => tasks.value.filter(task => task.date === day.value))
const completed = computed(() => today.value.filter(task => task.done).length)
const agenda = computed(() => today.value.filter(task => !task.done).sort((a, b) => Number(b.focusDate === day.value) - Number(a.focusDate === day.value) || a.priority - b.priority || (a.time || '99').localeCompare(b.time || '99')).slice(0, 5))
const capacity = computed(() => dayCapacity(day.value))
const load = computed(() => dayLoad(day.value))
const recent = computed(() => [
  ...memos.value.map(item => ({ id: item.id, kind: 'memos' as HubKind, title: item.title || '未命名备忘录', label: '备忘录', icon: StickyNote, updated: item.updatedAt })),
  ...docMetas.value.map(item => ({ id: item.id, kind: 'docMetas' as HubKind, title: item.name, label: '资料', icon: FolderOpen, updated: item.createdAt })),
  ...repos.value.map(item => ({ id: item.id, kind: 'repos' as HubKind, title: item.fullName, label: '项目', icon: FolderOpen, updated: item.updatedAt })),
].sort((a, b) => b.updated - a.updated).slice(0, 4))
</script>

<template>
  <div class="workspace-layout mt-6">
    <section class="workspace-panel" aria-labelledby="agenda-title">
      <div class="flex items-start justify-between gap-4">
        <div><p class="text-xs font-medium text-primary">把注意力留给重要的事</p><h2 id="agenda-title" class="mt-2 text-xl font-semibold text-t1">今天，从这里开始</h2></div>
        <RouterLink to="/today" class="ui-icon-button shrink-0" aria-label="查看每日计划"><ArrowUpRight class="h-5 w-5" /></RouterLink>
      </div>
      <div class="my-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-t3">
        <span>已完成 <strong class="text-t1 tabular-nums">{{ completed }} / {{ today.length }}</strong></span>
        <span>待办预计 <strong class="text-t1 tabular-nums">{{ load }} 分钟</strong></span>
        <span>{{ load > capacity ? '超出可用时间' : '还可留白' }} <strong :class="load > capacity ? 'text-warn' : 'text-primary'">{{ Math.abs(capacity - load) }} 分钟</strong></span>
      </div>
      <ul v-if="agenda.length" class="space-y-2">
        <li v-for="task in agenda" :key="task.id">
          <button class="workspace-task" @click="openHubItem('tasks', task.id)">
            <span class="shrink-0 text-xs tabular-nums text-t3">{{ task.time || '待安排' }}</span>
            <span class="min-w-0 flex-1 truncate text-sm font-medium text-t1">{{ task.title }}</span>
            <span v-if="task.focusDate === day" class="badge badge-emerald shrink-0 rounded-lg px-2 py-1 text-xs">重点</span>
            <ArrowUpRight class="h-4 w-4 shrink-0 text-t4" />
          </button>
        </li>
      </ul>
      <div v-else class="rounded-xl border border-dashed border-line px-5 py-6">
        <CheckCheck class="mb-3 h-6 w-6 text-primary" />
        <p class="text-sm font-medium text-t1">{{ today.length ? '今天的计划已经完成' : '今天还没有安排' }}</p>
        <p class="mt-1 text-xs leading-relaxed text-t3">{{ today.length ? '可以收个尾，也可以把余下的时间留给自己。' : '从一件小事开始，也可以先留一点空白。' }}</p>
        <button class="ui-secondary-button mt-4 gap-2" @click="openHubItem('tasks')"><Plus class="h-4 w-4" />添加一件事</button>
      </div>
      <RouterLink to="/today" class="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary">查看完整计划 <ArrowUpRight class="h-4 w-4" /></RouterLink>
    </section>
    <div class="min-w-0 space-y-4">
      <section class="workspace-panel" aria-labelledby="capture-title">
        <h2 id="capture-title" class="text-base font-semibold text-t1">随手记录</h2>
        <p class="mt-1 text-xs text-t3">先记下来，再慢慢整理。</p>
        <div class="mt-4 grid grid-cols-2 gap-3">
          <button class="workspace-capture" @click="openHubItem('tasks')"><ListTodo class="h-5 w-5 text-primary" /><span>新建任务</span></button>
          <button class="workspace-capture" @click="openHubItem('memos')"><StickyNote class="h-5 w-5 text-primary" /><span>写备忘录</span></button>
        </div>
        <button class="ui-secondary-button mt-3 w-full justify-between gap-2" @click="hubSearchOpen = true"><span class="flex items-center gap-2"><Search class="h-4 w-4" />查找与收集</span><span class="text-xs text-t4">Ctrl / ⌘ K</span></button>
      </section>
      <section class="workspace-panel" aria-labelledby="recent-title">
        <h2 id="recent-title" class="text-base font-semibold text-t1">接着上次的内容</h2>
        <ul v-if="recent.length" class="mt-3 divide-y divide-line">
          <li v-for="item in recent" :key="`${item.kind}:${item.id}`"><button class="flex min-h-16 w-full items-center gap-3 py-3 text-left hover:text-primary" @click="openHubItem(item.kind, item.id)"><component :is="item.icon" class="h-4 w-4 shrink-0 text-primary" /><span class="min-w-0 flex-1"><span class="block truncate text-sm text-t1">{{ item.title }}</span><span class="mt-1 block text-xs text-t3">{{ item.label }} · {{ formatDate(item.updated) }}</span></span><ArrowUpRight class="h-4 w-4 shrink-0 text-t4" /></button></li>
        </ul>
        <div v-else class="mt-4 rounded-lg border border-dashed border-line p-4 text-xs leading-relaxed text-t3">最近编辑的备忘录、资料和项目会出现在这里。<RouterLink to="/docs" class="mt-2 flex min-h-11 items-center gap-2 font-medium text-primary">前往资料库 <ArrowUpRight class="h-4 w-4" /></RouterLink></div>
      </section>
    </div>
  </div>
</template>
