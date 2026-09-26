<script setup lang="ts">
import { effectiveWallpaperDim, wallpaperImageStyle, wallpaperUrl } from '@/lib/wallpaper'
defineProps<{ preview?: boolean }>()
</script>

<template>
  <div v-if="wallpaperUrl" class="wallpaper-layer" :class="{ 'is-preview': preview }" aria-hidden="true">
    <div class="wallpaper-image" :style="wallpaperImageStyle"></div>
    <div class="wallpaper-shade" :style="{ opacity: effectiveWallpaperDim / 100 }"></div>
  </div>
</template>
