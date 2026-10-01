import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export type PlanView = 'today' | 'week' | 'inbox' | 'long' | 'all' | 'done'
const views: PlanView[] = ['today', 'week', 'inbox', 'long', 'all', 'done']
export function usePlanView() {
  const route = useRoute()
  const router = useRouter()
  return computed<PlanView>({
    get: () => views.includes(route.query.view as PlanView) ? route.query.view as PlanView : 'today',
    set: view => { void router.replace({ path: '/today', query: { ...route.query, view } }) },
  })
}
