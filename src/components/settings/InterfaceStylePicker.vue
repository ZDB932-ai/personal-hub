<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Palette, Undo2 } from '@lucide/vue'
import { ACCENTS, INTERFACE_STYLES, interfaceStyle, previousInterfaceAppearance as previous, selectInterfaceStyle, themeAccent, themeMode, type InterfaceStyle } from '@/stores/theme'
import { INTERFACE_STYLE_CATEGORIES, type InterfaceStyleCategory } from '@/lib/interfaceStyles'

const filter = ref<'all' | InterfaceStyleCategory>('all')
const filters = [{ key: 'all' as const, label: '全部' }, ...INTERFACE_STYLE_CATEGORIES]
const presets = computed(() => INTERFACE_STYLES.filter(item => filter.value === 'all' || item.category === filter.value))
const current = computed(() => INTERFACE_STYLES.find(item => item.key === interfaceStyle.value) ?? INTERFACE_STYLES.find(item => item.key === 'classic')!)
const categoryLabel = (category: InterfaceStyleCategory) => INTERFACE_STYLE_CATEGORIES.find(item => item.key === category)?.label
const recommendedAccent = computed(() => ACCENTS.find(item => item.key === current.value.accent)?.label)
const recommendedApplied = computed(() => themeMode.value === current.value.mode && themeAccent.value === current.value.accent)
const snapshot = () => ({ style: interfaceStyle.value, mode: themeMode.value, accent: themeAccent.value })
const feedback = ref('')

function select(style: InterfaceStyle): void {
  if (style === interfaceStyle.value) return
  previous.value = snapshot()
  selectInterfaceStyle(style)
  feedback.value = `已切换为${current.value.label}，保留当前明暗、配色和背景。`
}

function recommend(): void {
  if (recommendedApplied.value) return
  previous.value = snapshot()
  themeMode.value = current.value.mode
  themeAccent.value = current.value.accent
  feedback.value = `已应用${current.value.label}的推荐配色，背景保持不变。`
}

function undo(): void {
  if (!previous.value) return
  const saved = previous.value
  selectInterfaceStyle(saved.style)
  themeMode.value = saved.mode
  themeAccent.value = saved.accent
  previous.value = null
  feedback.value = '已恢复上一次界面外观。'
}
</script>

<template>
  <section class="appearance-section" aria-labelledby="interface-style-title">
    <div class="appearance-section-heading">
      <h3 id="interface-style-title">界面风格</h3>
      <p>从 {{ INTERFACE_STYLES.length }} 种设计中选择适合你的布局。切换风格会保留明暗、强调色和背景。</p>
    </div>
    <div class="style-selection-summary">
      <div class="min-w-0">
        <span class="text-xs text-t3">正在使用</span>
        <h4 class="mt-1 text-lg font-semibold text-t1">{{ current.label }}</h4>
        <p class="mt-2 text-xs leading-relaxed text-t3">{{ current.detail }}</p>
      </div>
      <div class="style-selection-actions">
        <button type="button" class="ui-secondary-button gap-1.5" :disabled="recommendedApplied" @click="recommend"><Palette class="h-4 w-4" />{{ recommendedApplied ? '已使用推荐配色' : '应用推荐配色' }}</button>
        <span class="text-xs text-t3">{{ current.mode === 'dark' ? '深色' : '浅色' }} · {{ recommendedAccent }}</span>
        <button v-if="previous" type="button" class="ui-ghost-button gap-1.5" @click="undo"><Undo2 class="h-4 w-4" />撤销更改</button>
      </div>
    </div>
    <div class="style-collection-filters" role="group" aria-label="筛选界面风格">
      <button v-for="item in filters" :key="item.key" type="button" :aria-label="item.label" :aria-pressed="filter === item.key" @click="filter = item.key">{{ item.label }}<span aria-hidden="true">{{ item.key === 'all' ? INTERFACE_STYLES.length : INTERFACE_STYLES.filter(preset => preset.category === item.key).length }}</span></button>
    </div>
    <div class="interface-style-grid" role="group" aria-label="界面风格">
      <button
        v-for="preset in presets"
        :key="preset.key"
        type="button"
        class="interface-style-option"
        :aria-label="preset.label"
        :aria-pressed="interfaceStyle === preset.key"
        @click="select(preset.key)"
      >
        <span class="style-preview" :data-preview="preset.key" :data-navigation="preset.navigation" aria-hidden="true">
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
          <span class="min-w-0 text-sm font-semibold text-t1">{{ preset.label }}</span>
          <span v-if="interfaceStyle === preset.key" class="flex shrink-0 items-center gap-1 text-xs font-medium text-primary" aria-label="使用中">
            <Check class="h-3.5 w-3.5" /><span class="hidden sm:inline">使用中</span>
          </span>
          <span v-else class="shrink-0 text-xs text-t3">{{ categoryLabel(preset.category) }}</span>
        </span>
        <span class="mt-1 block px-3 pb-3 text-xs leading-relaxed text-t3">{{ preset.description }}</span>
      </button>
    </div>
    <p v-if="feedback" class="appearance-feedback" role="status" aria-live="polite">{{ feedback }}</p>
  </section>
</template>
