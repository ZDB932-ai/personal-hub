<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { isTauriDesktop } from '@/lib/desktop'
import { configurePet, initializePet, petPreferences } from '@/lib/pet'
import DragonPet from '@/components/DragonPet.vue'
const desktop = isTauriDesktop()
const error = ref('')
const busy = ref(false)
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
  <section class="space-y-4">
    <div class="flex items-center gap-4 rounded-xl border border-line bg-inset p-4">
      <div class="w-28 shrink-0"><DragonPet mood="idle" /></div>
      <div><h4 class="font-semibold text-t1">奶龙 · 桌面伙伴</h4><p class="mt-1 text-sm text-t3">摸摸头、喂一口，忙碌时也有小伙伴陪你。</p><p class="mt-2 text-xs text-t3">按住身体拖动 · 点击互动 · 双击打开主页</p></div>
    </div>
    <p v-if="!desktop" class="text-sm text-t3">桌面悬浮玩偶仅在 Windows 桌面版中开启，此处可预览角色。</p>
    <template v-else>
      <label class="flex min-h-11 items-center justify-between gap-4 text-sm text-t1">开启桌面玩偶<input type="checkbox" :checked="petPreferences.enabled" :disabled="busy" @change="change('enabled', $event)" /></label>
      <label class="flex min-h-11 items-center justify-between gap-4 text-sm text-t1">最小化或关闭到托盘后继续显示<input type="checkbox" :checked="petPreferences.background" :disabled="busy" @change="change('background', $event)" /></label>
      <label class="flex min-h-11 items-center justify-between gap-4 text-sm text-t1">任务到点时由玩偶提醒<input type="checkbox" :checked="petPreferences.reminders" :disabled="busy" @change="change('reminders', $event)" /></label>
      <p class="text-xs text-t3">提醒只显示「有任务到时间啦」，不展示任务正文。锁定后停止任务提醒；从托盘退出应用时，玩偶也会退出。</p>
      <button class="min-h-11 rounded-lg border border-line bg-surface px-4 text-sm text-t2 hover:bg-surface-2" @click="reset">找回玩偶位置</button>
      <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
    </template>
  </section>
</template>
