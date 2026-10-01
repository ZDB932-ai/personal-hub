import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/collect', name: 'collect', component: () => import('@/views/FocusView.vue') },
    { path: '/review', name: 'review', component: () => import('@/views/FocusView.vue') },
    { path: '/focus', name: 'focus', component: () => import('@/views/FocusView.vue'), beforeEnter: to => {
      if (to.query.task) return
      if (to.query.tab === 'pocket') return { path: '/collect' }
      if (['trail', 'story', 'closing'].includes(String(to.query.tab))) return { path: '/review', query: to.query }
    } },
    {
      path: '/calendar',
      name: 'calendar',
      component: () => import('@/views/CalendarView.vue'),
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    {
      path: '/today',
      name: 'today',
      component: () => import('@/views/TodayView.vue'),
    },
    {
      path: '/memos',
      name: 'memos',
      component: () => import('@/views/MemosView.vue'),
    },
    {
      path: '/docs',
      name: 'docs',
      component: () => import('@/views/DocsView.vue'),
    },
    {
      path: '/repos',
      name: 'repos',
      component: () => import('@/views/ReposView.vue'),
    },
    {
      path: '/ai',
      name: 'ai',
      component: () => import('@/views/AiView.vue'),
    },
    {
      path: '/agent-library',
      name: 'agent-library',
      component: () => import('@/views/AgentLibraryView.vue'),
    },
    {
      path: '/vault',
      name: 'vault',
      component: () => import('@/views/VaultView.vue'),
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

export default router
