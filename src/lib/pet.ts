import { reactive } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { isTauriDesktop } from './desktop'

export interface PetPreferences { enabled: boolean; background: boolean; reminders: boolean }
export const petPreferences = reactive<PetPreferences>({ enabled: false, background: false, reminders: false })
let ready: Promise<void> | undefined
export function initializePet(): Promise<void> {
  if (!isTauriDesktop()) return Promise.resolve()
  return ready ??= (async () => {
    await listen<PetPreferences>('pet://preferences', event => Object.assign(petPreferences, event.payload))
    Object.assign(petPreferences, await invoke<PetPreferences>('pet_preferences'))
  })().catch(error => { ready = undefined; throw error })
}
export async function configurePet(patch: Partial<PetPreferences>): Promise<void> {
  await invoke('pet_configure', { preferences: { ...petPreferences, ...patch } })
  Object.assign(petPreferences, patch)
}
