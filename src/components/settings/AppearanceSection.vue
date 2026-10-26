<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Monitor, Moon, Sun } from '@lucide/vue'
import { ACCENTS, INTERFACE_STYLES, interfaceStyle, themeAccent, themeMode, type ThemeMode } from '@/stores/theme'
import InterfaceStylePicker from './InterfaceStylePicker.vue'
import AppearanceScenes from './AppearanceScenes.vue'
import WallpaperStudio from './WallpaperStudio.vue'

const props = defineProps<{ open?: boolean; initialCategory?: string }>()
const tab = ref('display')
const tabs = [
  { key: 'display', name: '颜色与显示' },
  { key: 'interface', name: '界面风格' },
  { key: 'wallpapers', name: '背景图片' },
  { key: 'scenes', name: '推荐搭配' },
]
watch(() => props.initialCategory, value => {
  if (value && tabs.some(item => item.key === value)) tab.value = value
}, { immediate: true })
const currentStyle = computed(() => INTERFACE_STYLES.find(item => item.key === interfaceStyle.value)?.label ?? '经典纸感')
const MODES: { key: ThemeMode; label: string; icon: typeof Moon }[] = [
  { key: 'light', label: '浅色', icon: Sun },
  { key: 'dark', label: '深色', icon: Moon },
  { key: 'system', label: '跟随系统', icon: Monitor },
]
</script>

<template>
  <div class="appearance-studio">
    <nav class="appearance-tabs" aria-label="外观设置内容">
      <button v-for="item in tabs" :key="item.key" type="button" :aria-pressed="tab === item.key" @click="tab = item.key">{{ item.name }}</button>
    </nav>

    <section v-if="tab === 'display'" class="appearance-section" aria-labelledby="appearance-display-title">
      <div class="appearance-section-heading">
        <h3 id="appearance-display-title">颜色与显示</h3>
        <p>选择舒适的明暗和强调色，适用于当前的「{{ currentStyle }}」风格。</p>
      </div>
      <fieldset class="appearance-setting-group">
        <legend>外观模式</legend>
        <div class="appearance-modes">
          <button v-for="mode in MODES" :key="mode.key" type="button" :aria-pressed="themeMode === mode.key" class="appearance-mode" @click="themeMode = mode.key">
            <component :is="mode.icon" class="h-5 w-5" />
            <span>{{ mode.label }}</span>
            <Check v-if="themeMode === mode.key" class="appearance-option-check h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <p class="appearance-help">跟随系统会根据设备设置自动切换浅色与深色。</p>
      </fieldset>
      <fieldset class="appearance-setting-group">
        <legend>强调色</legend>
        <p class="appearance-help appearance-help-leading">用于按钮、链接和选中状态。</p>
        <div class="appearance-accents">
          <button v-for="accent in ACCENTS" :key="accent.key" type="button" class="appearance-accent" :aria-pressed="themeAccent === accent.key" @click="themeAccent = accent.key">
            <span class="appearance-accent-swatch" :style="{ background: accent.color }" aria-hidden="true"></span>
            <span>{{ accent.label }}</span>
            <Check v-if="themeAccent === accent.key" class="appearance-accent-check h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </fieldset>
    </section>
    <InterfaceStylePicker v-else-if="tab === 'interface'" />
    <WallpaperStudio v-else-if="tab === 'wallpapers'" />
    <AppearanceScenes v-else />

    <p class="appearance-note">更改会自动保存到此设备。背景图片只在解锁后的工作区显示。</p>
  </div>
</template>
