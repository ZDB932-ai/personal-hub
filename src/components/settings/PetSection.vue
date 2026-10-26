<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { isTauriDesktop } from '@/lib/desktop'
import { configurePet, initializePet, petPreferences } from '@/lib/pet'
import DragonPet from '@/components/DragonPet.vue'
import AppSelect from '@/components/AppSelect.vue'
import { petCatalog, isAvailablePet, selectedPet } from '@/lib/pet/catalog'
const PresetPet = defineAsyncComponent(() => import('@/components/PresetPet.vue'))
const character = computed(() => selectedPet(petPreferences.character))
const characterOptions = petCatalog.filter(entry => isAvailablePet(entry.id)).map(entry => ({ value: entry.id, label: entry.name }))
const PetAssetPreview = defineAsyncComponent(() => import('@/components/PetAssetPreview.vue'))
const showSamples = ref(false)
const desktop = isTauriDesktop()
const error = ref('')
const busy = ref(false)
async function selectCharacter(id: string | number) {
  busy.value = true
  try { await configurePet({ character: String(id) }); error.value = '' }
  catch { error.value = '角色未切换，请重试。' }
  finally { busy.value = false }
}
onMounted(() => { if (desktop) void initializePet().catch(() => { error.value = '玩偶配置读取失败，请重试。' }) })
async function change(key: 'enabled' | 'background' | 'reminders', event: Event) {
  const input = event.target as HTMLInputElement
  busy.value = true
  try { await configurePet({ [key]: input.checked }); error.value = '' }
  catch { input.checked = petPreferences[key]; error.value = '设置未保存，请重试。' }
  finally { busy.value = false }
}
async function reset() {
  try { await invoke('pet_reset_position'); error.value = '' }
  catch { error.value = '无法找回玩偶，请重新打开桌面端。' }
}
</script>
<template>
  <section class="settings-stack" aria-label="桌面伙伴设置">
    <section class="settings-card space-y-3">
      <div class="flex flex-wrap items-center gap-4">
        <div v-if="!showSamples" class="w-24 shrink-0" aria-hidden="true"><PresetPet v-if="character.renderer === 'preset'" :key="character.id" :asset="character.asset" /><DragonPet v-else mood="idle" /></div>
        <div class="min-w-0 flex-1"><h3 class="settings-section-title">{{ character.name }}</h3><p class="settings-description">{{ character.description }}</p></div>
      </div>
      <p class="settings-description">按住角色拖动 · 点击互动 · 双击打开主窗口</p>
      <p v-if="!desktop" class="settings-note text-sm text-t2">桌面伙伴可在 Windows 桌面版中开启。当前设备可浏览角色预览。</p>
      <template v-if="desktop">
        <div class="settings-subsection space-y-2"><label id="pet-character-label" class="text-sm font-medium text-t1">角色选择</label><AppSelect :model-value="petPreferences.character" :options="characterOptions" :disabled="busy" aria-labelledby="pet-character-label" @update:model-value="selectCharacter" /></div>
        <label class="settings-row min-h-11 cursor-pointer text-sm text-t1"><span class="settings-row-copy">开启桌面伙伴</span><input type="checkbox" :checked="petPreferences.enabled" :disabled="busy" @change="change('enabled', $event)" /></label>
      </template>
    </section>
    <section v-if="desktop" class="settings-card space-y-3">
      <h3 class="settings-section-title">显示与提醒</h3>
      <label class="settings-row min-h-11 cursor-pointer text-sm text-t1"><span class="settings-row-copy">主窗口最小化或关闭后继续显示</span><input type="checkbox" :checked="petPreferences.background" :disabled="busy" @change="change('background', $event)" /></label>
      <label class="settings-row min-h-11 cursor-pointer text-sm text-t1"><span class="settings-row-copy">任务到时提醒</span><input type="checkbox" :checked="petPreferences.reminders" :disabled="busy" @change="change('reminders', $event)" /></label>
      <p class="settings-description">提醒仅提示任务到时，不展示任务正文。锁定后停止提醒；从系统托盘退出应用时，桌面伙伴同时关闭。</p>
      <div class="settings-actions"><button class="ui-secondary-button" :disabled="busy" @click="reset">找回伙伴位置</button></div>
    </section>
    <section class="settings-card space-y-3"><div class="settings-row"><div class="settings-row-copy"><h3 class="settings-section-title">更多角色预览</h3><p class="settings-description">查看角色形象与可用动作，部分角色仅支持预览。</p></div><button class="ui-secondary-button" :aria-expanded="showSamples" @click="showSamples = !showSamples">{{ showSamples ? '收起预览' : '浏览角色' }}</button></div><PetAssetPreview v-if="showSamples" /></section>
    <p v-if="error" role="alert" class="settings-note text-sm text-danger">{{ error }}</p>
  </section>
</template>
