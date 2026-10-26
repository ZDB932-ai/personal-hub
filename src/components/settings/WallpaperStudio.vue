<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Expand, ImagePlus, RotateCcw, Trash2, X } from '@lucide/vue'
import ModalShell from '@/components/ModalShell.vue'
import WallpaperPreview from './WallpaperPreview.vue'
import { WALLPAPER_CATEGORIES, type WallpaperCategory } from '@/lib/wallpaperCatalog'
import { BUILT_IN_WALLPAPERS, customWallpaperUrl, effectiveWallpaperDim, hasCustomImage, refreshCustomWallpaper, removeCustomWallpaper, resetWallpaperAdjustments, selectCustomWallpaper, setBuiltInWallpaper, setCustomWallpaper, setWallpaperDim, updateWallpaper, wallpaperConfig, wallpaperError, wallpaperName, wallpaperReady, wallpaperUrl } from '@/lib/wallpaper'
import { confirmAction } from '@/lib/confirmAction'
import { toast } from '@/lib/toast'

const category = ref<WallpaperCategory>('全部')
const visibleWallpapers = computed(() => BUILT_IN_WALLPAPERS.filter(item => category.value === '全部' || item.category === category.value))
const input = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const expanded = ref(false)
const portrait = ref(false)
const adjustments = [
  { key: 'blur' as const, name: '背景柔化', min: 0, max: 16, step: 1, suffix: 'px' },
  { key: 'zoom' as const, name: '画面缩放', min: 100, max: 150, step: 5, suffix: '%' },
  { key: 'x' as const, name: '水平构图', min: 0, max: 100, step: 5, suffix: '%' },
  { key: 'y' as const, name: '垂直构图', min: 0, max: 100, step: 5, suffix: '%' },
]

async function upload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return
  busy.value = true
  try { await setCustomWallpaper(file); toast('图片已保存并应用') }
  catch (error) { toast(error instanceof Error ? error.message : '上传失败', 'error') }
  finally { busy.value = false }
}

async function remove() {
  if (!await confirmAction('删除本机保存的自定义壁纸？此操作不会删除你原来的图片文件。')) return
  busy.value = true
  try { await removeCustomWallpaper(); toast('已删除自定义壁纸') }
  catch (error) { toast(error instanceof Error ? error.message : '删除失败，请重试', 'error') }
  finally { busy.value = false }
}
</script>

<template>
  <section class="appearance-section" aria-labelledby="wallpaper-title">
    <div class="appearance-section-heading"><h3 id="wallpaper-title">背景图片</h3><p>选择内置壁纸或上传图片，为工作区添加适合自己的背景。</p></div>
    <div class="wallpaper-preview-toolbar">
      <span class="text-sm font-semibold text-t1">{{ wallpaperName }}</span>
      <div class="flex flex-wrap gap-1">
        <button type="button" class="ui-ghost-button" :aria-pressed="!portrait" @click="portrait = false">桌面构图</button>
        <button type="button" class="ui-ghost-button" :aria-pressed="portrait" @click="portrait = true">手机构图</button>
        <button type="button" class="ui-icon-button" aria-label="放大壁纸预览" @click="expanded = true"><Expand class="h-4 w-4" /></button>
      </div>
    </div>
    <WallpaperPreview :portrait="portrait" />
    <div v-if="wallpaperError" class="mt-3 rounded-lg border border-warn/40 bg-inset p-3 text-xs text-warn" role="status">{{ wallpaperError }} <button type="button" class="ui-ghost-button" @click="refreshCustomWallpaper">重试读取</button></div>
    <details v-if="wallpaperUrl" class="wallpaper-adjustments"><summary>背景与可读性<span>明暗、透明度与构图</span></summary><div class="wallpaper-adjustments-content">
      <div class="flex flex-wrap items-center justify-between gap-2"><h4 class="text-sm font-semibold">画面与阅读</h4><button type="button" class="ui-ghost-button gap-1.5" @click="resetWallpaperAdjustments"><RotateCcw class="h-3.5 w-3.5" />重置调节</button></div>
      <label class="appearance-toggle"><span><strong>自动平衡明暗</strong><small>浅色轻遮罩，深色加深，随外观模式变化。</small></span><input type="checkbox" :checked="wallpaperConfig.autoDim" @change="updateWallpaper({ autoDim: ($event.target as HTMLInputElement).checked })" /></label>
      <label class="wallpaper-range"><span>遮罩强度 <output>{{ effectiveWallpaperDim }}%</output></span><input aria-label="遮罩强度" type="range" min="0" max="90" step="5" :disabled="wallpaperConfig.autoDim" :value="effectiveWallpaperDim" @input="setWallpaperDim(Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="appearance-toggle"><span><strong>透明信息框</strong><small>让壁纸透过侧栏和内容卡片，开启后隐藏阅读衬底。</small></span><input type="checkbox" :checked="wallpaperConfig.transparentPanels" @change="updateWallpaper({ transparentPanels: ($event.target as HTMLInputElement).checked })" /></label>
      <label v-if="wallpaperConfig.transparentPanels" class="wallpaper-range"><span>信息框透明度 <output>{{ wallpaperConfig.panelTransparency }}%</output></span><input aria-label="信息框透明度" type="range" min="0" max="90" step="5" :value="wallpaperConfig.panelTransparency" @input="updateWallpaper({ panelTransparency: Number(($event.target as HTMLInputElement).value) })" /><small class="text-t3">0% 为不透明。调高透明度可显示更多背景；文字与按钮不受影响。</small></label>
      <label v-else class="appearance-toggle"><span><strong>阅读衬底</strong><small>给内容区域加一层稳定底色，保留周围的壁纸。</small></span><input type="checkbox" :checked="wallpaperConfig.readingSurface" @change="updateWallpaper({ readingSurface: ($event.target as HTMLInputElement).checked })" /></label>
      <details class="wallpaper-composition"><summary>构图与质感</summary><div class="mt-4 grid gap-4 sm:grid-cols-2"><label v-for="item in adjustments" :key="item.key" class="wallpaper-range"><span>{{ item.name }}<output>{{ wallpaperConfig[item.key] }}{{ item.suffix }}</output></span><input :aria-label="item.name" type="range" :min="item.min" :max="item.max" :step="item.step" :value="wallpaperConfig[item.key]" @input="updateWallpaper({ [item.key]: Number(($event.target as HTMLInputElement).value) })" /></label></div><p class="mt-3 text-xs text-t3">按窗口比例自动铺满；位置调节作用于被裁切的部分。手机与桌面构图预览用于比较不同画幅。</p></details>
    </div>
    </details>
    <div class="wallpaper-library-heading"><h4>选择背景</h4><span>{{ BUILT_IN_WALLPAPERS.length }} 张内置壁纸 · 离线可用</span></div><div class="wallpaper-category-filters" role="group" aria-label="壁纸分类">
      <button type="button" v-for="item in WALLPAPER_CATEGORIES" :key="item" class="wallpaper-filter" :aria-pressed="category === item" @click="category = item">{{ item }}</button>
    </div>
    <div class="wallpaper-gallery mt-3" role="group" aria-label="壁纸资源">
      <button type="button" class="wallpaper-tile" :aria-pressed="!wallpaperConfig.builtin && !wallpaperConfig.custom" @click="setBuiltInWallpaper(null)"><span class="wallpaper-empty">纯色空间</span><span class="wallpaper-tile-label">不使用图片<Check v-if="!wallpaperConfig.builtin && !wallpaperConfig.custom" class="h-3.5 w-3.5 text-primary" /></span></button>
      <button type="button" v-for="item in visibleWallpapers" :key="item.id" class="wallpaper-tile" :aria-label="`使用壁纸：${item.name}`" :aria-pressed="wallpaperConfig.builtin === item.id && !wallpaperConfig.custom" :title="item.description" @click="setBuiltInWallpaper(item.id)">
        <img :src="item.thumb" alt="" width="420" height="236" loading="lazy" />
        <span class="wallpaper-tile-label">{{ item.name }}<Check v-if="wallpaperConfig.builtin === item.id && !wallpaperConfig.custom" class="h-3.5 w-3.5 text-primary" /></span>
      </button>
      <button type="button" v-if="customWallpaperUrl" class="wallpaper-tile" :aria-pressed="wallpaperConfig.custom" aria-label="使用自定义图片" @click="selectCustomWallpaper"><img :src="customWallpaperUrl" alt="" /><span class="wallpaper-tile-label">我的图片<Check v-if="wallpaperConfig.custom" class="h-3.5 w-3.5 text-primary" /></span></button>
      <button type="button" class="wallpaper-tile wallpaper-upload" :disabled="busy || !wallpaperReady" @click="input?.click()"><span class="wallpaper-empty"><ImagePlus class="h-6 w-6" /></span><span class="wallpaper-tile-label">{{ busy ? '正在处理…' : hasCustomImage ? '替换我的图片' : '上传我的图片' }}</span></button>
    </div>
    <input ref="input" type="file" accept="image/jpeg,image/png,image/webp,image/avif" class="hidden" aria-label="上传壁纸文件" @change="upload" />
    <p class="mt-3 text-xs leading-relaxed text-t3">支持 JPG、PNG、WebP、AVIF，最大 8MB。你的图片仅保存在本机；切换内置壁纸后仍可切回来。</p>
    <button type="button" v-if="hasCustomImage" class="ui-danger-button mt-4 gap-1.5" :disabled="busy" @click="remove"><Trash2 class="h-3.5 w-3.5" />删除我的图片</button>
    <ModalShell :open="expanded" max-width="max-w-5xl" @close="expanded = false"><div class="mb-4 flex items-center justify-between gap-3"><h3 class="font-semibold">{{ wallpaperName }} · 构图预览</h3><button type="button" class="ui-icon-button" aria-label="关闭壁纸预览" @click="expanded = false"><X class="h-4 w-4" /></button></div><WallpaperPreview :portrait="portrait" /><p class="mt-3 text-xs text-t3">示例内容用于观察可读性，实际画面随窗口大小裁切。</p></ModalShell>
  </section>
</template>
