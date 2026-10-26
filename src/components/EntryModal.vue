<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import ModalShell from '@/components/ModalShell.vue'
import AppSelect from '@/components/AppSelect.vue'
import { Eye, EyeOff, RefreshCw, X } from '@lucide/vue'
import { addEntry, updateEntry } from '@/stores/vault'
import { emptyDraft, ENTRY_CATEGORIES, passwordStrength, randomPassword } from '@/lib/utils'
import { parseTotpInput } from '@/lib/totp'
import { toast } from '@/lib/toast'
import type { VaultDraft, VaultEntry } from '@/types'

const props = defineProps<{
  open: boolean
  entry: VaultEntry | null
}>()

const emit = defineEmits<{
  close: []
}>()

const form = reactive<VaultDraft>(emptyDraft())
const showPassword = ref(false)
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    showPassword.value = false
    error.value = ''
    if (props.entry) {
      const { title, username, password, url, notes, category, totp } = props.entry
      Object.assign(form, { title, username, password, url, notes, category, totp: totp ?? '' })
    } else {
      Object.assign(form, emptyDraft())
    }
  },
  { immediate: true },
)

const strength = computed(() => passwordStrength(form.password))
const strengthWidth = computed(() => {
  if (strength.value.score < 0) return '0%'
  return `${(strength.value.score / 3) * 100}%`
})

function generate() {
  form.password = randomPassword(16)
  showPassword.value = true
}

function save() {
  if (!form.title.trim() || !form.username.trim() || !form.password.trim()) {
    error.value = '名称、用户名、密码为必填项'
    return
  }
  const totp = form.totp?.trim() ?? ''
  if (totp) {
    try {
      parseTotpInput(totp)
    } catch (e) {
      error.value = e instanceof Error ? e.message : '两步验证密钥格式不正确'
      return
    }
  }
  if (props.entry) {
    updateEntry(props.entry.id, { ...form })
    toast('已更新')
  } else {
    addEntry({ ...form })
    toast('已添加')
  }
  emit('close')
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-t1 placeholder:text-t4 outline-none transition focus:border-primary/60 focus:bg-surface-2 focus:ring-2 focus:ring-primary/25'
</script>

<template>
  <ModalShell :open="open" @close="emit('close')">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold">{{ entry ? '编辑账号' : '添加账号' }}</h3>
      <button
        aria-label="关闭"
        class="rounded-lg p-1.5 text-t4 transition hover:bg-surface hover:text-t2"
        @click="emit('close')"
      >
        <X class="h-5 w-5" />
      </button>
    </div>

    <p v-if="error" class="mt-4 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
      {{ error }}
    </p>

    <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">名称 *</span>
        <input v-model="form.title" :class="inputCls" placeholder="如：GitHub" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">分类</span>
        <AppSelect
          v-model="form.category"
          :options="ENTRY_CATEGORIES.map((c) => ({ value: c, label: c }))"
        />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">用户名 *</span>
        <input v-model="form.username" :class="inputCls" placeholder="账号 / 邮箱 / 手机号" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">网址</span>
        <input v-model="form.url" :class="inputCls" placeholder="https://..." />
      </label>
      <label class="col-span-full block">
        <span class="mb-1.5 block text-xs font-medium text-t3">密码 *</span>
        <div class="relative">
          <input
            v-model="form.password"
            :type="showPassword ? 'text' : 'password'"
            :class="inputCls"
            class="pr-24 font-mono"
            placeholder="输入或生成密码"
          />
          <div class="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            <button
              type="button"
              class="rounded-lg p-1.5 text-t4 transition hover:bg-surface-2 hover:text-t2"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :title="showPassword ? '隐藏' : '显示'"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" class="h-4 w-4" />
              <Eye v-else class="h-4 w-4" />
            </button>
            <button
              type="button"
              class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/12 hover:text-primary"
              @click="generate"
            >
              <RefreshCw class="h-3.5 w-3.5" />
              生成
            </button>
          </div>
        </div>
        <div v-if="form.password" class="mt-2 flex items-center gap-2">
          <div class="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              class="h-full rounded-full transition-all"
              :class="strength.color"
              :style="{ width: strengthWidth }"
            ></div>
          </div>
          <span class="text-xs" :class="strength.score <= 1 ? 'text-danger' : strength.score === 2 ? 'text-warn' : 'text-ok'">
            {{ strength.label }}
          </span>
        </div>
      </label>
      <label class="col-span-full block">
        <span class="mb-1.5 block text-xs font-medium text-t3">两步验证密钥 TOTP（选填）</span>
        <input
          v-model="form.totp"
          :class="inputCls"
          class="font-mono text-xs"
          placeholder="otpauth:// 链接或 Base32 密钥"
        />
        <p class="mt-1.5 text-[11px] leading-relaxed text-t4">
          来自网站两步验证设置页的 setup key，或验证器导出的 otpauth 链接（Google / ChatGPT 等均兼容）。保存后卡片会显示实时动态码。
        </p>
      </label>
      <label class="col-span-full block">
        <span class="mb-1.5 block text-xs font-medium text-t3">备注</span>
        <textarea
          v-model="form.notes"
          rows="2"
          :class="inputCls"
          placeholder="选填，如绑定手机、安全问题等"
        ></textarea>
      </label>
    </div>

    <div class="mt-6 flex justify-end gap-3">
      <button
        class="rounded-lg px-4 py-2.5 text-sm font-medium text-t3 transition hover:bg-surface hover:text-t2"
        @click="emit('close')"
      >
        取消
      </button>
      <button
        class="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-primary-strong"
        @click="save"
      >
        {{ entry ? '保存修改' : '添加' }}
      </button>
    </div>
  </ModalShell>
</template>
