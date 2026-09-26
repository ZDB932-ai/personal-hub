<script setup lang="ts">
import { Check } from '@lucide/vue'
import { INTERFACE_STYLES, interfaceStyle, selectInterfaceStyle } from '@/stores/theme'
</script>

<template>
  <section aria-labelledby="interface-style-title">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h4 id="interface-style-title" class="text-sm font-semibold text-t1">界面风格</h4>
      <span class="text-xs text-t3">调整卡片、排版与边框</span>
    </div>
    <div class="interface-style-grid mt-3" role="group" aria-label="界面风格">
      <button
        v-for="preset in INTERFACE_STYLES"
        :key="preset.key"
        type="button"
        class="interface-style-option"
        :aria-label="preset.label"
        :aria-pressed="interfaceStyle === preset.key"
        @click="selectInterfaceStyle(preset.key)"
      >
        <span class="style-preview" :data-preview="preset.key" aria-hidden="true">
          <span class="style-preview-nav">
            <span class="style-preview-logo"></span>
            <i></i><i></i><i></i><i></i>
          </span>
          <span class="style-preview-main">
            <span class="style-preview-heading">我的一天<span>让重要的事，有自己的位置</span></span>
            <span class="style-preview-stats"><i></i><i></i><i></i></span>
            <span class="style-preview-card"><i></i><i></i><i></i></span>
          </span>
        </span>
        <span class="flex items-center justify-between gap-2 px-3 pt-3">
          <span class="shrink-0 text-sm font-semibold text-t1">{{ preset.label }}</span>
          <span v-if="interfaceStyle === preset.key" class="flex shrink-0 items-center gap-1 text-xs font-medium text-primary" aria-label="使用中">
            <Check class="h-3.5 w-3.5" /><span class="hidden sm:inline">使用中</span>
          </span>
          <span v-else-if="preset.key === 'classic'" class="text-xs text-t3">原版</span>
        </span>
        <span class="mt-1 block px-3 pb-3 text-xs leading-relaxed text-t3">{{ preset.description }}</span>
      </button>
    </div>
    <p class="mt-3 text-xs leading-relaxed text-t3" aria-live="polite">
      {{ INTERFACE_STYLES.find((preset) => preset.key === interfaceStyle)?.detail }}
      切换风格保留当前配色、明暗和背景设置。
    </p>
  </section>
</template>
