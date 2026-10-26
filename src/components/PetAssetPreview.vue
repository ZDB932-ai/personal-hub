<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PresetPet from './PresetPet.vue'
import DragonPet from './DragonPet.vue'
import { petCatalog, getPetCatalogEntry } from '@/lib/pet/catalog'
const selectedId = ref('repairer-clap-sample')
const selected = computed(() => getPetCatalogEntry(selectedId.value)!)
const actionId = ref(0)
const rotation = ref(0)
const mood = ref('idle')
const ready = ref(false)
const details = ref('')
watch(selectedId, () => { ready.value = false; details.value = ''; mood.value = 'idle'; rotation.value = 0; actionId.value = 0 })
function loaded(stats: { triangles: number; calls: number; clips: { name: string; duration: number }[] }) {
  ready.value = true
  details.value = `${stats.triangles.toLocaleString()} 个三角形 · ${stats.calls} 次绘制 · ${stats.clips.map(clip => `${clip.name} ${clip.duration.toFixed(2)} 秒`).join('、')}`
}
</script>
<template>
  <section class="space-y-4 rounded-xl border border-line bg-surface p-4">
    <div><h2 class="font-semibold text-t1">角色预览</h2><p class="mt-1 text-sm text-t3">选择角色查看外观与支持的动作。预览不会更换当前桌面伙伴。</p></div>
    <div class="grid gap-4 sm:grid-cols-2" aria-label="角色预览选择">
      <button v-for="entry in petCatalog" :key="entry.id" class="min-h-11 rounded-xl border p-4 text-left hover:bg-surface-2" :class="selectedId === entry.id ? 'border-primary bg-inset' : 'border-line bg-surface'" :aria-pressed="selectedId === entry.id" @click="selectedId = entry.id">
        <span class="block font-semibold text-t1">{{ entry.name }}</span>
        <span class="mt-1 block text-sm text-t3">{{ entry.category }} · {{ entry.status === 'available' ? '可用伙伴' : '动作样片，尚不可启用' }}</span>
      </button>
    </div>
    <p class="text-sm text-t2">{{ selected.description }}</p>
    <div class="mx-auto w-full max-w-96 rounded-xl border border-line bg-inset">
      <PresetPet v-if="selected.renderer === 'preset'" :key="selected.id" :asset="selected.asset" :mood="mood" :action-id="actionId" :rotation="rotation" @ready="loaded" @error="ready = false; details = ''" />
      <DragonPet v-else mood="idle" />
    </div>
    <p v-if="selected.renderer === 'legacy'" class="text-sm text-t3">支持：{{ selected.actions.join('、') }}。本页展示待机，完整互动在桌面伙伴中使用。</p>
    <div v-else class="flex flex-wrap gap-2">
      <button v-for="action in selected.actions" :key="action.mood" :disabled="!ready" class="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-ink disabled:opacity-50" @click="mood = action.mood; actionId++">{{ action.label }}</button>
      <button :disabled="!ready" class="min-h-11 rounded-lg border border-line px-4 text-sm text-t2 hover:bg-surface-2 disabled:opacity-50" @click="mood = 'idle'; actionId++">停止播放</button>
      <button :disabled="!ready" class="min-h-11 rounded-lg border border-line px-4 text-sm text-t2 hover:bg-surface-2 disabled:opacity-50" @click="rotation -= 45">左转 45°</button>
      <button :disabled="!ready" class="min-h-11 rounded-lg border border-line px-4 text-sm text-t2 hover:bg-surface-2 disabled:opacity-50" @click="rotation += 45">右转 45°</button>
      <button :disabled="!ready" class="min-h-11 rounded-lg border border-line px-4 text-sm text-t2 hover:bg-surface-2 disabled:opacity-50" @click="rotation = 0">恢复正面</button>
    </div>
    <p class="text-xs text-t3">遵循系统“减少动态效果”；开启时不播放连续动画。切到后台或离开可见区域会暂停渲染。</p>
    <details v-if="details" class="text-xs text-t3"><summary class="flex min-h-11 cursor-pointer items-center">渲染信息</summary><p class="break-words" data-testid="pet-render-stats">{{ details }}</p></details>
  </section>
</template>
