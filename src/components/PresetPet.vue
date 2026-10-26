<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { createPresetPet, PresetPetAsset } from '@/lib/pet/preset3d'
const props = withDefaults(defineProps<{ asset: PresetPetAsset; mood?: string; actionId?: number; rotation?: number; travelSpeed?: number; inlineRetry?: boolean }>(), { mood: 'idle', actionId: 0, rotation: 0, inlineRetry: true })
const emit = defineEmits<{ ready: [stats: Awaited<ReturnType<typeof createPresetPet>>['stats']]; error: [message: string] }>()
const canvas = ref<HTMLCanvasElement>()
const state = ref<'loading' | 'ready' | 'error'>('loading')
let controller: AbortController | undefined
let puppet: Awaited<ReturnType<typeof createPresetPet>> | undefined
let generation = 0
async function load() {
  const current = ++generation
  controller?.abort(); puppet?.dispose(); puppet = undefined
  controller = new AbortController()
  const signal = controller.signal
  state.value = 'loading'
  try {
    const { createPresetPet } = await import('@/lib/pet/preset3d')
    if (!canvas.value || signal.aborted) return
    const result = await createPresetPet(canvas.value, props.asset, signal)
    if (current !== generation || signal.aborted) { result.dispose(); return }
    puppet = result
    result.setMood(props.mood)
    result.setRotation(props.rotation)
    result.setTravelSpeed(props.travelSpeed)
    state.value = 'ready'
    requestAnimationFrame(() => { if (current === generation && !signal.aborted) emit('ready', result.stats) })
  } catch {
    if (current !== generation || signal.aborted) return
    state.value = 'error'
    emit('error', '角色加载失败，请重试。')
  }
}
onMounted(load)
watch(() => props.asset, load)
watch(() => [props.mood, props.actionId], () => puppet?.setMood(props.mood))
watch(() => props.rotation, () => puppet?.setRotation(props.rotation))
watch(() => props.travelSpeed, () => puppet?.setTravelSpeed(props.travelSpeed))
onUnmounted(() => { generation++; controller?.abort(); puppet?.dispose() })
</script>
<template>
  <div class="relative aspect-square w-full" :data-state="state" :aria-busy="state === 'loading'">
    <canvas ref="canvas" class="block h-full w-full" role="img" :aria-label="asset.name" />
    <p v-if="state === 'loading'" class="absolute inset-x-0 bottom-4 text-center text-sm text-t3" role="status">角色加载中…</p>
    <div v-if="state === 'error'" class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface text-sm text-t2" role="alert">
      <p>角色加载失败，未切换为其他角色。</p>
      <button v-if="inlineRetry" class="min-h-11 rounded-lg border border-line px-4 hover:bg-surface-2" @click="load">重新加载</button>
    </div>
  </div>
</template>
