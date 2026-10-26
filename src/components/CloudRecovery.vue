<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import PasswordInput from './PasswordInput.vue'
import { resetCloudPassword } from '@/lib/cloudAccount'
import { adoptCloudSession } from '@/lib/cloudAccountSession'

const props = defineProps<{ name?: string }>()
const emit = defineEmits<{ cancel: [] }>()
const name = ref(props.name ?? '')
const code = ref('')
const password = ref('')
const confirm = ref('')
const busy = ref(false)
const error = ref('')
let mounted = true
onBeforeUnmount(() => { mounted = false; code.value = ''; password.value = ''; confirm.value = '' })
async function submit() {
  if (busy.value) return
  error.value = ''
  if (password.value !== confirm.value) { error.value = '两次密码不一致'; return }
  busy.value = true
  let changed = false
  try {
    const result = await resetCloudPassword(name.value, code.value, password.value, () => mounted)
    changed = true
    if (!mounted) return
    await adoptCloudSession(result)
  } catch (e) { if (mounted) error.value = changed ? '云密码已重设，但本机暂未完成更新。请返回登录，使用新密码重试；本机数据仍保留。' : e instanceof Error ? e.message : '恢复失败，请稍后重试' }
  finally { busy.value = false }
}
</script>
<template>
  <h1 class="text-2xl font-semibold text-t1">找回云账号密码</h1>
  <p class="mt-2 text-sm leading-relaxed text-t3">用提前保存的云恢复密钥设置新密码，手机、电脑和网页通用。</p>
  <form class="mt-6 space-y-4" @submit.prevent="submit">
    <label class="block text-sm text-t2">账号<input v-model="name" :readonly="Boolean(props.name)" :disabled="busy" autocomplete="username" class="control-input mt-2 px-3" placeholder="云账号" required /></label>
    <label class="block text-sm text-t2">云恢复密钥<textarea v-model="code" :disabled="busy" class="control-input mt-2 p-3 font-mono" rows="3" autocomplete="off" placeholder="输入完整的 8 组云恢复密钥" required /></label>
    <label class="block text-sm text-t2">新密码<PasswordInput v-model="password" :disabled="busy" class="mt-2" placeholder="新云账号密码（至少 8 位）" autocomplete="new-password" required /></label>
    <label class="block text-sm text-t2">确认新密码<PasswordInput v-model="confirm" :disabled="busy" class="mt-2" placeholder="再次输入新云账号密码" autocomplete="new-password" required /></label>
    <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
    <button class="ui-primary-button w-full" :disabled="busy">{{ busy ? '正在恢复…' : '重设密码并登录' }}</button>
  </form>
  <p class="mt-4 text-xs leading-relaxed text-t3">重设后旧云密码及同步登录失效，其他设备需用新密码重新登录。未启用云恢复或遗失密钥时，可在仍能登录的设备上设置云恢复，或导出数据备份。旧版本机恢复密钥不适用。</p>
  <button class="ui-ghost-button mt-4 w-full" :disabled="busy" @click="emit('cancel')">返回登录</button>
</template>
