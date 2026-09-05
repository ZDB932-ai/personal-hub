<script setup lang="ts">
import { ref, watch } from 'vue'
import { FolderPlus } from '@lucide/vue'
import ModalShell from '@/components/ModalShell.vue'
import { aiApi, type PiProject } from '@/lib/aiopencode'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  created: [project: PiProject]
}>()

const name = ref('')
const cwd = ref('')
const saving = ref(false)
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    name.value = ''
    cwd.value = ''
    error.value = ''
  },
)

async function submit(): Promise<void> {
  const directory = cwd.value.trim()
  if (!directory) {
    error.value = '请填写项目目录'
    return
  }
  const api = aiApi()
  if (!api.addPiProject) {
    error.value = '当前 Agent 不支持 pi 项目管理'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const project = await api.addPiProject(name.value.trim(), directory)
    emit('created', project)
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '添加项目失败'
  } finally {
    saving.value = false
  }
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-t1 placeholder:text-t4 outline-none transition-colors duration-150 focus:border-primary/60'
</script>

<template>
  <ModalShell :open="open" max-width="max-w-md" @close="emit('close')">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h3 class="flex items-center gap-2 text-lg font-semibold text-t1">
          <FolderPlus class="h-5 w-5 text-primary" />
          添加 pi 项目
        </h3>
        <p class="mt-1 text-xs text-t4">项目首次被选中时才会启动独立的 pi 会话。</p>
      </div>
      <button
        type="button"
        aria-label="关闭"
        class="rounded-lg p-1.5 text-t4 transition-colors duration-150 hover:bg-surface-2 hover:text-t2"
        @click="emit('close')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
          <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <form class="mt-5 space-y-4" @submit.prevent="submit">
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">项目名称（可选）</span>
        <input v-model="name" :class="inputCls" placeholder="默认使用文件夹名称" maxlength="80" />
      </label>

      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">项目目录</span>
        <input
          v-model="cwd"
          :class="inputCls"
          class="font-mono text-xs"
          placeholder="E:\\Projects\\my-app"
          autocomplete="off"
          spellcheck="false"
        />
      </label>

      <p class="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-t3">
        bridge 会在此文件夹中启动 pi。仅添加你信任并允许 agent 访问的项目目录。
      </p>

      <p v-if="error" role="alert" class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
        {{ error }}
      </p>

      <div class="flex gap-2 pt-1">
        <button
          type="button"
          class="flex-1 rounded-lg border border-line bg-surface py-2.5 text-sm font-medium text-t2 transition-colors duration-150 hover:bg-surface-2"
          @click="emit('close')"
        >
          取消
        </button>
        <button
          type="submit"
          :disabled="saving"
          class="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-primary-strong disabled:opacity-40"
        >
          {{ saving ? '添加中…' : '添加项目' }}
        </button>
      </div>
    </form>
  </ModalShell>
</template>
