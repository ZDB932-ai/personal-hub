<script setup lang="ts">
import { ArrowUpRight, Check, Undo2 } from '@lucide/vue'
import { APPEARANCE_SCENES, applyAppearanceScene, previousAppearance, undoAppearanceScene } from '@/lib/appearanceScenes'
import { interfaceStyle, themeAccent, themeMode } from '@/stores/theme'
import { wallpaperConfig } from '@/lib/wallpaper'
import { toast } from '@/lib/toast'

function isSelected(scene: typeof APPEARANCE_SCENES[number]) {
  return interfaceStyle.value === scene.style && themeAccent.value === scene.accent && themeMode.value === scene.mode && wallpaperConfig.value.builtin === scene.wallpaper && !wallpaperConfig.value.custom
}

function apply(id: string) {
  applyAppearanceScene(id)
  toast('整套外观已应用，可撤销或继续调整')
}
</script>

<template>
  <section class="appearance-section" aria-labelledby="scene-title">
    <div class="appearance-section-heading">
      <h3 id="scene-title">推荐搭配</h3>
      <p>一次应用界面风格、明暗、强调色和背景。随时可以撤销，或在其他分区继续调整。</p>
    </div>
    <div class="appearance-scene-grid">
      <button v-for="scene in APPEARANCE_SCENES" :key="scene.id" type="button" class="appearance-scene" :aria-label="`应用${scene.name}`" :aria-pressed="isSelected(scene)" @click="apply(scene.id)">
        <img :src="`/wallpapers/${scene.wallpaper}-thumb.jpg`" alt="" width="420" height="236" loading="lazy" />
        <span class="appearance-scene-caption"><span><strong>{{ scene.name }}</strong><small>{{ scene.description }}</small></span><Check v-if="isSelected(scene)" class="h-4 w-4 shrink-0 text-primary" aria-label="使用中" /><ArrowUpRight v-else class="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /></span>
      </button>
    </div>
    <div class="appearance-scene-footer">
      <p class="appearance-help">应用搭配会重设背景调节。上传的图片会保留，可在「背景图片」中重新选择。</p>
      <button v-if="previousAppearance" type="button" class="ui-secondary-button gap-1.5" @click="undoAppearanceScene(); toast('已恢复之前的外观')"><Undo2 class="h-4 w-4" />撤销搭配</button>
    </div>
  </section>
</template>
