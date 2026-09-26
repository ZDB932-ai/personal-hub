<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { createNailong } from '@/lib/pet/tripo3d'
const props = withDefaults(defineProps<{ mood: string; actionId?: number; rotation?: number; direction?: number; pace?: number; distance?: number; previewRun?: boolean }>(), { actionId: 0, rotation: 0, direction: 1, pace: 0, distance: 0, previewRun: false })
const canvas = ref<HTMLCanvasElement>()
const failed = ref(false)
const ready = ref(false)
let puppet: Awaited<ReturnType<typeof createNailong>> | undefined
let disposed = false
function look(event: PointerEvent) {
  if (event.buttons & 2) { puppet?.leave(); return }
  const bounds = canvas.value?.getBoundingClientRect()
  if (bounds) puppet?.look((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2)
}
onMounted(async () => {
  try {
    const { createNailong } = await import('@/lib/pet/tripo3d')
    if (disposed || !canvas.value) return
    puppet = await createNailong(canvas.value)
    if (disposed) { puppet.dispose(); return }
    puppet.setMood(props.mood)
    puppet.setView(props.rotation,props.direction,props.previewRun)
    puppet.setPace(props.pace)
    puppet.setDistance(props.distance)
    ready.value = true
  } catch { failed.value = true }
})
watch(() => [props.mood, props.actionId], () => puppet?.setMood(props.mood))
watch(() => [props.rotation,props.direction,props.previewRun], () => puppet?.setView(props.rotation,props.direction,props.previewRun))
watch(() => props.pace, () => puppet?.setPace(props.pace))
watch(() => props.distance, () => puppet?.setDistance(props.distance))
onUnmounted(() => { disposed = true; puppet?.dispose() })
</script>
<template>
  <span class="dragon-render" :data-ready="ready" @pointermove="look" @pointerleave="puppet?.leave()">
    <canvas v-if="!failed" ref="canvas" class="dragon-canvas" aria-hidden="true" />
    <img v-else src="/pets/nailoong-reference.png" alt="奶龙，当前设备使用静态预览" class="dragon-fallback" draggable="false" />
  </span>
</template>
<style>
.dragon-render { display:block; width:100%; aspect-ratio:1; position:relative; }
.dragon-canvas,.dragon-fallback { display:block; width:100%; height:100%; object-fit:contain; }
</style>
