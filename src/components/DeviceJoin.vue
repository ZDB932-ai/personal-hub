<script setup lang="ts">
import { ref } from 'vue'
import PasswordInput from './PasswordInput.vue'
import { joinDeviceTransfer, parseDeviceTransfer } from '@/lib/deviceTransfer'

const emit = defineEmits<{ busy: [value: boolean] }>()
const props = defineProps<{ disabled?: boolean }>()
const file = ref<File | null>(null)
const code = ref('')
const password = ref('')
const confirm = ref('')
const busy = ref(false)
const error = ref('')

function choose(event: Event): void {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null
}

async function join(): Promise<void> {
  if (busy.value || props.disabled) return
  error.value = ''
  if (!file.value) { error.value = '请选择设备加入文件'; return }
  if (password.value !== confirm.value) { error.value = '两次主密码不一致'; return }
  busy.value = true
  emit('busy', true)
  try {
    await joinDeviceTransfer(parseDeviceTransfer(await file.value.text()), code.value, password.value)
    code.value = ''; password.value = ''; confirm.value = ''
    location.reload()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加入失败，请检查文件与转移码'
    busy.value = false
    emit('busy', false)
  }
}
</script>

<template>
  <details class="mt-4 rounded-lg border border-line bg-surface-2 p-3 text-xs text-t2">
    <summary class="cursor-pointer">加入已有保险库</summary>
    <div class="mt-3 space-y-3">
      <p class="leading-relaxed">从原设备的「设置 → 备份与迁移 → 迁移到其他设备」生成文件和转移码。这里只复制当前数据，不会开启自动同步。</p>
      <input type="file" accept=".phub-device" :disabled="busy || props.disabled" class="w-full text-xs" @change="choose" />
      <PasswordInput v-model="code" :disabled="busy || props.disabled" class="py-2.5" placeholder="32 位转移码" />
      <PasswordInput v-model="password" :disabled="busy || props.disabled" class="py-2.5" placeholder="本机新主密码（至少 8 位）" />
      <PasswordInput v-model="confirm" :disabled="busy || props.disabled" class="py-2.5" placeholder="确认本机新主密码" />
      <p v-if="error" role="alert" class="text-danger">{{ error }}</p>
      <button :disabled="busy || props.disabled" class="rounded-lg bg-primary px-3 py-2 text-ink disabled:opacity-50" @click="join">{{ busy ? '正在加入…' : '加入并设置本机密码' }}</button>
    </div>
  </details>
</template>
