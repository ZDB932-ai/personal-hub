<script setup lang="ts">
import { ArrowUpRight, Undo2 } from '@lucide/vue'
import { APPEARANCE_SCENES, applyAppearanceScene, previousAppearance, undoAppearanceScene } from '@/lib/appearanceScenes'
import { toast } from '@/lib/toast'

function apply(id: string) {
  applyAppearanceScene(id)
  toast('整套外观已应用，可撤销或继续调整')
}
</script>

<template>
  <section aria-labelledby="scene-title">
    <div class="appearance-heading">
      <div><h4 id="scene-title">推荐搭配</h4><p>一次应用界面风格、明暗、配色和背景设置。应用后可到另外两个分区微调。</p></div>
    </div>
    <div class="appearance-scene-grid">
      <button v-for="scene in APPEARANCE_SCENES" :key="scene.id" type="button" class="appearance-scene" :aria-label="`应用${scene.name}`" @click="apply(scene.id)">
        <img :src="`/wallpapers/${scene.wallpaper}-thumb.jpg`" alt="" width="420" height="236" loading="lazy" />
        <span class="appearance-scene-caption"><span><strong>{{ scene.name }}</strong><small>{{ scene.description }}</small></span><ArrowUpRight class="h-4 w-4 shrink-0 text-primary" /></span>
      </button>
    </div>
    <div class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-inset p-3">
      <p class="text-xs leading-relaxed text-t3">自定义上传的图片会保留，可随时重新选择。</p>
      <button v-if="previousAppearance" class="ui-secondary-button gap-1.5" @click="undoAppearanceScene(); toast('已恢复之前的外观')"><Undo2 class="h-4 w-4" />撤销搭配</button>
    </div>
  </section>
</template>
