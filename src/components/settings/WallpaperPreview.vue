<script setup lang="ts">
import WallpaperLayer from '@/components/WallpaperLayer.vue'
import { wallpaperConfig, wallpaperPanelStyle } from '@/lib/wallpaper'
defineProps<{ portrait?: boolean }>()
</script>

<template>
  <div class="wallpaper-preview" :style="wallpaperPanelStyle" :class="{ 'is-portrait': portrait, 'preview-transparent': wallpaperConfig.transparentPanels }" role="img" :aria-label="portrait ? '手机壁纸构图预览' : '桌面壁纸构图预览'">
    <WallpaperLayer preview />
    <div class="wallpaper-preview-ui" :class="{ 'with-reading': wallpaperConfig.readingSurface && !wallpaperConfig.transparentPanels }" aria-hidden="true">
      <span class="wallpaper-preview-eyebrow">PERSONAL HUB</span>
      <strong>留一点空间，给自己。</strong>
      <span class="wallpaper-preview-task"><i></i><span>记录灵感，慢慢实现<small>我的一天 · 从这里开始</small></span></span>
    </div>
  </div>
</template>
