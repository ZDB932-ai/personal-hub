<script setup lang="ts">
import { ref } from 'vue'
import { Check, Monitor, Moon, Sun } from '@lucide/vue'
import { ACCENTS, themeAccent, themeMode, type ThemeMode } from '@/stores/theme'
import InterfaceStylePicker from './InterfaceStylePicker.vue'
import AppearanceScenes from './AppearanceScenes.vue'
import WallpaperStudio from './WallpaperStudio.vue'

defineProps<{ open?: boolean }>()
const tab = ref('scenes')
const tabs = [{ key: 'scenes', name: '整套搭配', detail: '一键应用' }, { key: 'interface', name: '界面样式', detail: '风格 · 明暗 · 配色' }, { key: 'wallpapers', name: '背景设置', detail: '壁纸 · 透明度' }]
const MODES: { key: ThemeMode; label: string; icon: typeof Moon }[] = [
  { key: 'dark', label: '深色', icon: Moon }, { key: 'light', label: '浅色', icon: Sun }, { key: 'system', label: '跟随系统', icon: Monitor },
]
</script>

<template>
  <div class="appearance-studio">
    <div class="appearance-studio-heading"><h3>外观设置</h3><span>使用整套搭配快速开始，或分别调整界面与背景。</span></div>
    <div class="appearance-tabs" role="group" aria-label="外观设置分区"><button v-for="item in tabs" :key="item.key" type="button" :aria-label="item.name" :aria-pressed="tab === item.key" @click="tab = item.key"><strong>{{ item.name }}</strong><span>{{ item.detail }}</span></button></div>
    <AppearanceScenes v-if="tab === 'scenes'" />
    <div v-else-if="tab === 'interface'">
      <InterfaceStylePicker />
      <section class="mt-6"><h4 class="text-sm font-semibold text-t1">外观模式</h4><div class="mt-3 grid grid-cols-3 gap-2"><button v-for="mode in MODES" :key="mode.key" :aria-pressed="themeMode === mode.key" class="appearance-mode" @click="themeMode = mode.key"><component :is="mode.icon" class="h-5 w-5" />{{ mode.label }}</button></div><p class="mt-2 text-xs text-t3">所有风格都支持深浅色。跟随系统时，自动遮罩也会一起调整。</p></section>
      <section class="mt-6"><h4 class="text-sm font-semibold text-t1">主题色调</h4><div class="appearance-accents mt-3"><button v-for="accent in ACCENTS" :key="accent.key" class="appearance-accent" :aria-pressed="themeAccent === accent.key" @click="themeAccent = accent.key"><span :style="{ background: accent.color }"><Check v-if="themeAccent === accent.key" class="h-4 w-4 text-white" /></span>{{ accent.label }}</button></div><p class="mt-2 text-xs text-t3">用于按钮、链接和选中状态。</p></section>
    </div>
    <WallpaperStudio v-else />
    <p class="mt-6 border-t border-line pt-3 text-xs leading-relaxed text-t3">外观仅保存在本机，不改变资料与任务。锁屏保持纯色，不展示你的自定义图片。</p>
  </div>
</template>
