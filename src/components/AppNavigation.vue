<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronDown, Lock, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Search, Settings, ShieldCheck, UserRound, X } from '@lucide/vue'
import ModalShell from './ModalShell.vue'
import { syncStatusText } from '@/lib/sync'
import { profile } from '@/stores/profile'
import { interfaceStyle } from '@/stores/theme'
import { isNavigationActive, mobileNavigation, navigationSections, primaryNavigation } from '@/lib/navigation'

const props = defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ 'update:collapsed': [value: boolean]; search: []; settings: [tab?: 'appearance' | 'security' | 'sync']; profile: []; lock: [] }>()
const route = useRoute()
const moreOpen = ref(false)
const moreSource = ref<'desktop' | 'mobile'>('mobile')
const toolsOpen = ref(false)
const navigation = ref<HTMLElement | null>(null)
const alternativeNavigation = computed(() => ['swiss', 'gallery', 'sunrise', 'retro', 'orbital'].includes(interfaceStyle.value))
const navigationLayout = computed(() => interfaceStyle.value === 'retro' ? 'bottom' : interfaceStyle.value === 'orbital' ? 'dock' : 'top')
const navigationTitle = computed(() => (({ swiss: '个人日报', gallery: '私人藏馆', sunrise: '晨间工作室', retro: '我的工作桌面', orbital: '轨道控制台' } as Record<string, string>)[interfaceStyle.value] ?? 'Personal Hub'))
const groups = navigationSections
const mobileItems = mobileNavigation
const desktopOverflowActive = computed(() => !primaryNavigation.some(item => active(item.to)))
const overflowGroups = computed(() => {
  const visibleItems = moreSource.value === 'desktop' ? primaryNavigation : mobileItems
  return groups.map(group => ({ ...group, items: group.items.filter(item => !visibleItems.includes(item)) })).filter(group => group.items.length)
})
const overflowActive = computed(() => !mobileItems.some(item => active(item.to)))
function active(to: string): boolean { return isNavigationActive(to, route.path) }
function openMore(source: 'desktop' | 'mobile'): void { moreSource.value = source; moreOpen.value = true }
function action(name: 'settings' | 'profile' | 'lock'): void { moreOpen.value = false; if (name === 'settings') emit('settings'); else if (name === 'profile') emit('profile'); else emit('lock') }
watch(() => route.fullPath, () => { moreOpen.value = false; if (groups.some(group => group.collapsible && group.items.some(item => active(item.to)))) toolsOpen.value = true }, { immediate: true })
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
      <button class="sidebar-collapse" data-navigation-collapse :aria-expanded="!collapsed" :aria-label="collapsed ? '展开主导航' : '收起主导航'" :title="collapsed ? '展开主导航' : '收起主导航'" @click="emit('update:collapsed', !collapsed)"><PanelLeftOpen v-if="collapsed" class="h-4 w-4" /><PanelLeftClose v-else class="h-4 w-4" /></button>
    </div>
    <button class="sidebar-search mt-5 shrink-0" aria-label="搜索与收集" title="搜索与收集 · Ctrl K" @click="emit('search')"><Search class="h-4 w-4 shrink-0" /><span class="sidebar-label">搜索与收集</span><kbd class="sidebar-label ml-auto text-xs text-t4">Ctrl K</kbd></button>
    <nav ref="navigation" class="sidebar-nav" aria-label="主导航">
      <section v-for="group in groups" :key="group.id" class="sidebar-group">
        <button v-if="group.collapsible && !collapsed" class="sidebar-group-toggle" :aria-expanded="toolsOpen" :aria-controls="`navigation-${group.id}`" @click="toolsOpen = !toolsOpen"><span>{{ group.label }}</span><ChevronDown class="h-3.5 w-3.5" :class="{ '-rotate-90': !toolsOpen }" /></button>
        <p v-else class="sidebar-group-label sidebar-label">{{ group.label }}</p>
        <div v-show="!group.collapsible || toolsOpen || collapsed" :id="`navigation-${group.id}`" class="sidebar-nav-list">
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
  <aside v-if="alternativeNavigation" class="style-desktop-navigation" :class="{ 'is-collapsed': collapsed }" :data-navigation-layout="navigationLayout" aria-label="工作区导航">
    <RouterLink to="/" class="style-navigation-brand" aria-label="返回今天"><img src="/app-icon.png" alt="" /><span>{{ navigationTitle }}</span></RouterLink>
    <nav class="style-navigation-links" aria-label="主导航">
      <RouterLink v-for="item in primaryNavigation" :key="item.to" :to="item.to" :aria-label="item.label" :title="item.label" :aria-current="active(item.to) ? 'page' : undefined"><component :is="item.icon" /><span>{{ item.label }}</span></RouterLink>
      <button :class="{ 'is-active': desktopOverflowActive }" aria-label="打开更多导航" title="更多功能" :aria-expanded="moreOpen" @click="openMore('desktop')"><MoreHorizontal /><span>更多</span></button>
    </nav>
    <div class="style-navigation-tools">
      <button aria-label="搜索与收集" title="搜索与收集 · Ctrl K" @click="emit('search')"><Search /></button>
      <button aria-label="编辑个人资料" title="个人资料" @click="emit('profile')"><UserRound /></button>
      <button aria-label="设置" title="设置" @click="emit('settings')"><Settings /></button>
      <button aria-label="锁定" title="锁定" @click="emit('lock')"><Lock /></button>
      <button data-navigation-collapse :aria-expanded="!collapsed" :aria-label="collapsed ? '展开主导航' : '收起主导航'" :title="collapsed ? '展开主导航' : '收起主导航'" @click="emit('update:collapsed', !collapsed)"><PanelLeftOpen v-if="collapsed" /><PanelLeftClose v-else /></button>
    </div>
  </aside>
  <header class="hub-mobile-header"><RouterLink to="/" class="flex items-center gap-2 text-sm font-semibold text-t1"><img src="/app-icon.png" class="h-7 w-7" alt="" />Personal Hub</RouterLink><div class="flex"><button class="ui-icon-button" aria-label="搜索与收集" @click="emit('search')"><Search class="h-4 w-4" /></button><button class="ui-icon-button" aria-label="锁定应用" @click="emit('lock')"><Lock class="h-4 w-4" /></button></div></header>
  <nav class="hub-mobile-nav" aria-label="移动端主导航"><RouterLink v-for="item in mobileItems" :key="item.to" :to="item.to" :aria-current="active(item.to) ? 'page' : undefined"><component :is="item.icon" class="h-5 w-5" />{{ item.label }}</RouterLink><button :aria-expanded="moreOpen" :class="{ 'is-active': moreOpen || overflowActive }" aria-label="打开更多导航" @click="openMore('mobile')"><MoreHorizontal class="h-5 w-5" />更多</button></nav>
  <ModalShell :open="moreOpen" mobile-sheet @close="moreOpen = false">
    <template #header><div class="flex items-center justify-between"><div><h2 class="text-lg font-semibold text-t1">更多功能</h2><p class="mt-1 text-xs text-t3">任务、资料、账号与 AI 工具</p></div><button class="ui-icon-button min-h-11 min-w-11" aria-label="关闭更多导航" @click="moreOpen = false"><X class="h-5 w-5" /></button></div></template>
    <nav class="mobile-more-groups" aria-label="更多功能">
      <section v-for="group in overflowGroups" :key="group.id"><h3 class="mb-3 text-xs font-medium text-t3">{{ group.label }}</h3><div class="grid grid-cols-2 gap-2"><RouterLink v-for="item in group.items" :key="item.to" :to="item.to" class="mobile-more-link" :aria-label="item.label" :aria-current="active(item.to) ? 'page' : undefined"><component :is="item.icon" class="h-5 w-5 shrink-0" /><span>{{ item.label }}</span></RouterLink></div></section>
    </nav>
    <template #footer><div class="mobile-more-utilities"><button @click="action('profile')"><UserRound class="h-5 w-5" />个人资料</button><button @click="action('settings')"><Settings class="h-5 w-5" />设置</button><button @click="action('lock')"><Lock class="h-5 w-5" />锁定</button></div></template>
  </ModalShell>
</template>
