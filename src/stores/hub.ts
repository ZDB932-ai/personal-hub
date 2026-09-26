import { ref } from 'vue'

export type HubKind = 'tasks' | 'memos' | 'docMetas' | 'repos' | 'entries'
export const hubSearchOpen = ref(false)
export const hubSelection = ref<{ kind: HubKind; id?: string } | null>(null)

export function openHubItem(kind: HubKind, id?: string): void {
  hubSearchOpen.value = false
  hubSelection.value = { kind, id }
}
