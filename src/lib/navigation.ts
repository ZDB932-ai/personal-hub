import { Bot, Boxes, CalendarCheck, CalendarDays, FolderGit2, FolderLock, History, Inbox, KeyRound, StickyNote, Sun } from '@lucide/vue'
import type { Component } from 'vue'

export type NavigationItem = {
  id: string
  to: string
  label: string
  description: string
  icon: Component
}

export type NavigationSection = {
  id: string
  label: string
  collapsible?: boolean
  items: NavigationItem[]
}

export const navigationItems = {
  dashboard: { id: 'dashboard', to: '/', label: '今天', description: '查看今日重点、任务和日程', icon: Sun },
  calendar: { id: 'calendar', to: '/calendar', label: '日历', description: '按日、周或月安排时间', icon: CalendarDays },
  today: { id: 'today', to: '/today?view=week', label: '任务与计划', description: '管理任务、周计划与长期目标', icon: CalendarCheck },
  collect: { id: 'collect', to: '/collect', label: '收集箱', description: '记录想法，整理成任务或备忘录', icon: Inbox },
  review: { id: 'review', to: '/review', label: '回顾', description: '查看完成记录、项目进展与每日总结', icon: History },
  memos: { id: 'memos', to: '/memos', label: '备忘录', description: '保存笔记、清单与工作记录', icon: StickyNote },
  docs: { id: 'docs', to: '/docs', label: '资料库', description: '整理文件、预览内容与关联任务', icon: FolderLock },
  repos: { id: 'repos', to: '/repos', label: '项目收藏', description: '收藏 GitHub 项目，查看自己的仓库', icon: FolderGit2 },
  vault: { id: 'vault', to: '/vault', label: '密码库', description: '加密保存账号、密码与验证码', icon: KeyRound },
  ai: { id: 'ai', to: '/ai', label: 'AI 工作台', description: '连接 Agent，处理任务与权限请求', icon: Bot },
  'agent-library': { id: 'agent-library', to: '/agent-library', label: 'Agent 资源库', description: '管理技能、MCP 服务与插件', icon: Boxes },
} satisfies Record<string, NavigationItem>

export const navigationSections: NavigationSection[] = [
  { id: 'planning', label: '日程与行动', items: [navigationItems.dashboard, navigationItems.calendar, navigationItems.today, navigationItems.collect, navigationItems.review] },
  { id: 'knowledge', label: '知识与资料', items: [navigationItems.memos, navigationItems.docs, navigationItems.repos] },
  { id: 'security', label: '账号与安全', items: [navigationItems.vault] },
  { id: 'tools', label: 'AI 与扩展', collapsible: true, items: [navigationItems.ai, navigationItems['agent-library']] },
]

export const primaryNavigation = navigationSections[0]!.items
export const mobileNavigation: NavigationItem[] = [navigationItems.dashboard, navigationItems.calendar, navigationItems.collect]

export function navigationItemForPath(path: string): NavigationItem | undefined {
  return Object.values(navigationItems).find(item => item.to.split('?')[0] === path)
}

export function isNavigationActive(to: string, path: string): boolean {
  return path === to.split('?')[0] || (to === '/' && path === '/focus')
}
