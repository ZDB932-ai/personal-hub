import { reactive } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { isTauriDesktop } from './desktop'
import { isAvailablePet } from './pet/catalog'

export interface PetPreferences { enabled: boolean; background: boolean; reminders: boolean; character: string }
export const petPreferences = reactive<PetPreferences>({ enabled: false, background: false, reminders: false, character: 'nailong' })
function applyPreferences(value: PetPreferences) {
  Object.assign(petPreferences, value, { character: isAvailablePet(value.character) ? value.character : 'nailong' })
}
let ready: Promise<void> | undefined
let preferenceRevision = 0
let configureQueue: Promise<void> = Promise.resolve()
export function initializePet(): Promise<void> {
  if (!isTauriDesktop()) return Promise.resolve()
  return ready ??= (async () => {
    let receivedUpdate = false
    const unlisten = await listen<PetPreferences>('pet://preferences', event => {
      receivedUpdate = true
      preferenceRevision++
      applyPreferences(event.payload)
    })
    try {
      const saved = await invoke<PetPreferences>('pet_preferences')
      if (!receivedUpdate) applyPreferences(saved)
    } catch (error) {
      unlisten()
      throw error
    }
  })().catch(error => { ready = undefined; throw error })
}
export async function configurePet(patch: Partial<PetPreferences>): Promise<void> {
  if (patch.character !== undefined && !isAvailablePet(patch.character)) throw new Error('此角色尚不可用')
  if (!isTauriDesktop()) throw new Error('请在桌面版中设置玩偶')
  const preferences = { ...patch }
  const operation = configureQueue.then(async () => {
    await initializePet()
    const revision = preferenceRevision
    const saved = await invoke<PetPreferences>('pet_configure', { preferences })
    if (revision === preferenceRevision) applyPreferences(saved)
  })
  configureQueue = operation.catch(() => {})
  return operation
}
