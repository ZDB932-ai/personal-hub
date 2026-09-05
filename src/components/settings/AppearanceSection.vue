<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ImagePlus, Monitor, Moon, Palette, Sun, Trash2 } from '@lucide/vue'
import { ACCENTS, themeAccent, themeMode, type ThemeMode } from '@/stores/theme'
import {
  BUILT_IN_WALLPAPERS,
  hasCustomImage,
  removeCustomWallpaper,
  setBuiltInWallpaper,
  setCustomWallpaper,
  setWallpaperDim,
  wallpaperConfig,
  wallpaperUrl,
} from '@/lib/wallpaper'
import { toast } from '@/lib/toast'

const MODES: { key: ThemeMode; label: string; icon: typeof Moon }[] = [
  { key: 'dark', label: '深色', icon: Moon },
  { key: 'light', label: '浅色', icon: Sun },
  { key: 'system', label: '跟随系统', icon: Monitor },
]

const customThumb = ref<string | null>(null)
const uploading = ref(false)

onMounted(async () => {
  if (hasCustomImage.value) {
    try {
      const { getImg } = await import('@/lib/wallpaperdb')
      const blob = await getImg('custom')
      if (blob) customThumb.value = URL.createObjectURL(blob)
    } catch {
      /* ignore */
    }
  }
})

function selectBuiltIn(id: string | null): void {
  setBuiltInWallpaper(id)
}

function triggerUpload(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    uploading.value = true
    void setCustomWallpaper(file)
      .then(async () => {
        if (customThumb.value) URL.revokeObjectURL(customThumb.value)
        customThumb.value = URL.createObjectURL(file)
        toast('背景已更新')
      })
      .catch((e) => toast(e instanceof Error ? e.message : '上传失败', 'error'))
      .finally(() => (uploading.value = false))
  }
  input.click()
}

async function handleRemoveCustom(): Promise<void> {
  if (customThumb.value) {
    URL.revokeObjectURL(customThumb.value)
    customThumb.value = null
  }
  await removeCustomWallpaper()
  toast('已删除自定义背景')
}

const tileBase =
  'relative overflow-hidden rounded-lg border transition-colors duration-150 aspect-video'
</script>

<template>
  <div>
    <section>
      <h4 class="text-xs font-semibold uppercase tracking-wider text-t4">外观模式</h4>
      <div class="mt-3 grid grid-cols-3 gap-2">
        <button
          v-for="m in MODES"
          :key="m.key"
          class="flex flex-col items-center gap-1.5 rounded-lg border py-3.5 text-xs font-medium transition-colors duration-150"
          :class="
            themeMode === m.key
              ? 'border-primary/50 bg-primary/12 text-primary'
              : 'border-line bg-surface text-t3 hover:border-t3 hover:text-t2'
          "
          @click="themeMode = m.key"
        >
          <component :is="m.icon" class="h-5 w-5" />
          {{ m.label }}
        </button>
      </div>
      <p class="mt-2 text-[11px] text-t4">
        浅色模式为 v1 实现，个别第三方预览内容（如 PDF 白底）不受影响；「跟随系统」实时响应系统明暗切换。
      </p>
    </section>

    <section class="mt-6">
      <h4 class="text-xs font-semibold uppercase tracking-wider text-t4">主题色调</h4>
      <div class="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <button
          v-for="a in ACCENTS"
          :key="a.key"
          class="group flex flex-col items-center gap-1.5 rounded-lg border py-3 transition-colors duration-150"
          :class="
            themeAccent === a.key
              ? 'border-primary/60 bg-primary/10'
              : 'border-line bg-surface hover:border-t3'
          "
          @click="themeAccent = a.key"
        >
          <span
            class="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold"
            :style="{ background: a.color, color: a.key === 'teal' || a.key === 'amber' ? '#1a1a1a' : '#fff' }"
          >
            <template v-if="themeAccent === a.key">✓</template>
          </span>
          <span class="text-[11px]" :class="themeAccent === a.key ? 'text-primary' : 'text-t3'">
            {{ a.label }}
          </span>
        </button>
      </div>
      <p class="mt-2 text-[11px] text-t4">
        色调即时生效并同步到按钮、链接、焦点环、进度条等全部强调元素。
      </p>
    </section>

    <section class="mt-6">
      <h4 class="text-xs font-semibold uppercase tracking-wider text-t4">背景图片</h4>
      <div class="mt-3 space-y-3 rounded-xl border border-line bg-surface p-4">
        <div class="grid grid-cols-4 gap-2 sm:grid-cols-5">
          <button
            :class="[tileBase, !wallpaperConfig.builtin && !wallpaperConfig.custom ? 'border-primary/60 ring-2 ring-primary/30' : 'border-line hover:border-t3']"
            title="不使用背景图"
            @click="selectBuiltIn(null)"
          >
            <span class="flex h-full w-full items-center justify-center bg-inset text-xs text-t4">无</span>
          </button>
          <button
            v-for="w in BUILT_IN_WALLPAPERS"
            :key="w.id"
            :class="[tileBase, wallpaperConfig.builtin === w.id && !wallpaperConfig.custom ? 'border-primary/60 ring-2 ring-primary/30' : 'border-line hover:border-t3']"
            :title="w.name"
            @click="selectBuiltIn(w.id)"
          >
            <img :src="`/wallpapers/${w.id}.jpg`" :alt="w.name" class="h-full w-full object-cover" loading="lazy" />
          </button>
          <button
            v-if="customThumb"
            :class="[tileBase, wallpaperConfig.custom ? 'border-primary/60 ring-2 ring-primary/30' : 'border-line hover:border-t3']"
            title="自定义图片"
            @click="setBuiltInWallpaper(null); wallpaperConfig.custom = true"
          >
            <img :src="customThumb" alt="自定义图片" class="h-full w-full object-cover" />
          </button>
          <button
            :class="[tileBase, 'border-dashed border-line bg-inset hover:border-primary/50']"
            :title="hasCustomImage ? '重新上传自定义图片' : '上传自定义图片'"
            :disabled="uploading"
            @click="triggerUpload"
          >
            <span class="flex h-full w-full flex-col items-center justify-center gap-1 text-t4">
              <ImagePlus class="h-4 w-4" />
              <span class="text-[10px]">{{ uploading ? '处理中…' : '上传' }}</span>
            </span>
          </button>
        </div>

        <div v-if="wallpaperUrl" class="flex items-center gap-3">
          <span class="shrink-0 text-xs text-t4">背景暗度</span>
          <input
            type="range"
            min="0"
            max="85"
            step="5"
            :value="wallpaperConfig.dim"
            class="h-1.5 flex-1 accent-primary"
            @input="setWallpaperDim(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="w-10 shrink-0 text-right text-xs tabular-nums text-t4">{{ wallpaperConfig.dim }}%</span>
        </div>

        <div class="flex items-center justify-between gap-2">
          <p class="text-[11px] leading-relaxed text-t4">
            自定义图片仅保存在本机（IndexedDB，≤8MB），不会同步到云端。
          </p>
          <button
            v-if="hasCustomImage"
            class="flex shrink-0 items-center gap-1 rounded-lg border border-danger/25 bg-danger/10 px-2.5 py-1.5 text-[11px] font-medium text-danger transition-colors duration-150 hover:bg-danger/20"
            @click="handleRemoveCustom"
          >
            <Trash2 class="h-3 w-3" />
            删除自定义图
          </button>
        </div>
      </div>
    </section>

    <div class="mt-6 flex items-start gap-2.5 rounded-xl border border-line bg-inset p-3.5 text-[11px] leading-relaxed text-t4">
      <Palette class="mt-0.5 h-3.5 w-3.5 shrink-0" />
      主题偏好保存在本机（xk.theme.v1），多设备各自独立；分类色板与功能色保持固定以保证信息识别一致。
    </div>
  </div>
</template>
