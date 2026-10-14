<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Bot, Boxes, CalendarCheck, CalendarDays, ChevronDown, FolderGit2, FolderLock, History, Inbox, KeyRound, Lock, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Search, Settings, ShieldCheck, StickyNote, Sun, UserRound, X } from '@lucide/vue'
import ModalShell from './ModalShell.vue'
import { syncStatusText } from '@/lib/sync'
import { profile } from '@/stores/profile'

const props = defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ 'update:collapsed': [value: boolean]; search: []; settings: [tab?: 'appearance' | 'security' | 'sync']; profile: []; lock: [] }>()
const route = useRoute()
const moreOpen = ref(false)
const toolsOpen = ref(false)
const navigation = ref<HTMLElement | null>(null)
const today = { to: '/', label: '今天', icon: Sun }
const calendar = { to: '/calendar', label: '日历', icon: CalendarDays }
const collect = { to: '/collect', label: '收集箱', icon: Inbox }
const groups = [
  { label: '日常', items: [today, calendar, { to: '/today?view=week', label: '计划', icon: CalendarCheck }, collect, { to: '/review', label: '回顾', icon: History }] },
  { label: '内容', items: [{ to: '/memos', label: '备忘录', icon: StickyNote }, { to: '/docs', label: '资料库', icon: FolderLock }, { to: '/vault', label: '密码库', icon: KeyRound }] },
  { label: '开发工具', items: [{ to: '/repos', label: '仓库', icon: FolderGit2 }, { to: '/ai', label: 'AI 工作台', icon: Bot }, { to: '/agent-library', label: 'Agent 资源库', icon: Boxes }] },
]
const mobileItems = [today, calendar, collect]
const overflowGroups = computed(() => groups.map(group => ({ ...group, items: group.items.filter(item => !mobileItems.includes(item)) })))
const overflowActive = computed(() => !mobileItems.some(item => active(item.to)))
function active(to: string): boolean { return route.path === to.split('?')[0] || (to === '/' && route.path === '/focus') }
function action(name: 'settings' | 'profile' | 'lock'): void { moreOpen.value = false; if (name === 'settings') emit('settings'); else if (name === 'profile') emit('profile'); else emit('lock') }
watch(() => route.fullPath, () => { moreOpen.value = false; if (groups[2]!.items.some(item => active(item.to))) toolsOpen.value = true }, { immediate: true })
watch([() => route.fullPath, () => props.collapsed], async () => {
  await nextTick()
  const container = navigation.value
  const current = container?.querySelector<HTMLElement>('[aria-current="page"]')
  if (!container || !current || !container.clientHeight) return
  const bounds = container.getBoundingClientRect(), item = current.getBoundingClientRect()
  if (item.bottom > bounds.bottom) container.scrollTop += item.bottom - bounds.bottom
  else if (item.top < bounds.top) container.scrollTop = Math.max(0, container.scrollTop + item.top - bounds.top)
}, { immediate: true })
</script>

<template>
  <aside class="app-sidebar desktop-sidebar" :class="{ 'is-collapsed': collapsed }">
    <div class="sidebar-brand">
      <RouterLink to="/" class="hub-brand-link" aria-label="返回今天"><img src="/app-icon.png" alt="" class="sidebar-brand-mark" /><span class="sidebar-label text-sm font-semibold text-t1">Personal Hub</span></RouterLink>
      <button class="sidebar-collapse" :aria-label="collapsed ? '展开主导航' : '收起主导航'" :title="collapsed ? '展开主导航' : '收起主导航'" @click="emit('update:collapsed', !collapsed)"><PanelLeftOpen v-if="collapsed" class="h-4 w-4" /><PanelLeftClose v-else class="h-4 w-4" /></button>
    </div>
    <button class="sidebar-search mt-5 shrink-0" aria-label="搜索与收集" title="搜索与收集 · Ctrl K" @click="emit('search')"><Search class="h-4 w-4 shrink-0" /><span class="sidebar-label">搜索与收集</span><kbd class="sidebar-label ml-auto text-xs text-t4">Ctrl K</kbd></button>
    <nav ref="navigation" class="sidebar-nav" aria-label="主导航">
      <section v-for="group in groups" :key="group.label" class="sidebar-group">
        <button v-if="group.label === '开发工具' && !collapsed" class="sidebar-group-toggle" :aria-expanded="toolsOpen" aria-controls="developer-navigation" @click="toolsOpen = !toolsOpen"><span>开发工具</span><ChevronDown class="h-3.5 w-3.5" :class="{ '-rotate-90': !toolsOpen }" /></button>
        <p v-else class="sidebar-group-label sidebar-label">{{ group.label }}</p>
        <div v-show="group.label !== '开发工具' || toolsOpen || collapsed" :id="group.label === '开发工具' ? 'developer-navigation' : undefined" class="sidebar-nav-list">
          <RouterLink v-for="item in group.items" :key="item.to" :to="item.to" class="sidebar-link" :class="{ 'is-active': active(item.to) }" :aria-current="active(item.to) ? 'page' : undefined" :aria-label="item.label" :title="collapsed ? item.label : undefined"><span class="sidebar-link-icon"><component :is="item.icon" class="h-4 w-4" /></span><span class="sidebar-label">{{ item.label }}</span></RouterLink>
        </div>
      </section>
    </nav>
    <footer class="sidebar-footer">
      <button class="sidebar-profile" aria-label="编辑个人资料" :title="collapsed ? '个人资料' : undefined" @click="emit('profile')"><UserRound class="h-4 w-4 shrink-0" /><span class="sidebar-label truncate">{{ profile.nickname || profile.name || '个人资料' }}</span></button>
      <button class="sidebar-security" aria-label="查看同步状态" title="同步设置" @click="emit('settings', 'sync')"><ShieldCheck class="h-4 w-4 shrink-0 text-ok" /><span class="sidebar-label min-w-0 flex-1">本机加密</span><span class="sidebar-label text-xs">{{ syncStatusText }}</span></button>
      <div class="sidebar-footer-actions"><button class="ui-ghost-button gap-2" aria-label="设置" title="设置" @click="emit('settings')"><Settings class="h-4 w-4" /><span class="sidebar-label">设置</span></button><button class="ui-ghost-button gap-2" aria-label="锁定" title="锁定" @click="emit('lock')"><Lock class="h-4 w-4" /><span class="sidebar-label">锁定</span></button></div>
    </footer>
  </aside>
  <header class="hub-mobile-header"><RouterLink to="/" class="flex items-center gap-2 text-sm font-semibold text-t1"><img src="/app-icon.png" class="h-7 w-7" alt="" />Personal Hub</RouterLink><div class="flex"><button class="ui-icon-button" aria-label="搜索与收集" @click="emit('search')"><Search class="h-4 w-4" /></button><button class="ui-icon-button" aria-label="锁定应用" @click="emit('lock')"><Lock class="h-4 w-4" /></button></div></header>
  <nav class="hub-mobile-nav" aria-label="移动端主导航"><RouterLink v-for="item in mobileItems" :key="item.to" :to="item.to" :aria-current="active(item.to) ? 'page' : undefined"><component :is="item.icon" class="h-5 w-5" />{{ item.label }}</RouterLink><button :aria-expanded="moreOpen" :class="{ 'is-active': moreOpen || overflowActive }" aria-label="打开更多导航" @click="moreOpen = true"><MoreHorizontal class="h-5 w-5" />更多</button></nav>
  <ModalShell :open="moreOpen" mobile-sheet @close="moreOpen = false">
    <template #header><div class="flex items-center justify-between"><div><h2 class="text-lg font-semibold text-t1">更多</h2><p class="mt-1 text-xs text-t3">计划、内容与工具</p></div><button class="ui-icon-button min-h-11 min-w-11" aria-label="关闭更多导航" @click="moreOpen = false"><X class="h-5 w-5" /></button></div></template>
    <nav class="mobile-more-groups" aria-label="更多功能">
      <section v-for="group in overflowGroups" :key="group.label"><h3 class="mb-3 text-xs font-medium text-t3">{{ group.label }}</h3><div class="grid grid-cols-2 gap-2"><RouterLink v-for="item in group.items" :key="item.to" :to="item.to" class="mobile-more-link" :aria-current="active(item.to) ? 'page' : undefined"><component :is="item.icon" class="h-5 w-5 shrink-0" /><span>{{ item.label }}</span></RouterLink></div></section>
    </nav>
    <template #footer><div class="mobile-more-utilities"><button @click="action('profile')"><UserRound class="h-5 w-5" />个人资料</button><button @click="action('settings')"><Settings class="h-5 w-5" />设置</button><button @click="action('lock')"><Lock class="h-5 w-5" />锁定</button></div></template>
  </ModalShell>
</template>
