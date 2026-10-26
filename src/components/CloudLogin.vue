<script setup lang="ts">
import { ref } from 'vue'
import PasswordInput from './PasswordInput.vue'
import { authenticateCloud } from '@/lib/cloudAccount'
import { adoptCloudSession } from '@/lib/cloudAccountSession'
import CloudRecovery from './CloudRecovery.vue'
const recovering = ref(false)

const emit = defineEmits<{ local: [] }>()
const register = ref(false)
const name = ref('')
const password = ref('')
const confirmation = ref('')
const busy = ref(false)
const error = ref('')

async function submit() {
  if (busy.value) return
  error.value = ''
  if (register.value && password.value !== confirmation.value) { error.value = '两次密码不一致'; return }
  busy.value = true
  try {
    const result = await authenticateCloud(name.value, password.value, register.value)
    await adoptCloudSession(result)
    password.value = ''; confirmation.value = ''
  } catch (e) { error.value = e instanceof Error ? e.message : '连接失败，请检查网络后重试' }
  finally { busy.value = false }
}
</script>

<template>
  <CloudRecovery v-if="recovering" @cancel="recovering = false" />
  <template v-else>
  <h1 class="text-2xl font-semibold text-t1">{{ register ? '创建云账号' : '登录云账号' }}</h1>
  <p class="mt-2 text-sm leading-relaxed text-t3">手机、电脑和网页使用同一账号，登录后自动同步。</p>
  <form class="mt-6 space-y-4" @submit.prevent="submit">
    <label class="block text-sm font-medium text-t2">账号<input v-model="name" :disabled="busy" class="control-input mt-2 px-3" placeholder="3–40 位英文、数字或下划线" autocomplete="username" maxlength="40" required /></label>
    <label class="block text-sm font-medium text-t2">密码<PasswordInput v-model="password" :disabled="busy" class="mt-2" placeholder="账号密码（至少 8 位）" :autocomplete="register ? 'new-password' : 'current-password'" required /></label>
    <label v-if="register" class="block text-sm font-medium text-t2">确认密码<PasswordInput v-model="confirmation" :disabled="busy" class="mt-2" placeholder="再次输入账号密码" autocomplete="new-password" required /></label>
    <p v-if="register" class="text-xs leading-relaxed text-t3">请妥善保存账号密码。数据在设备上加密，登录后请在「设置 → 账户与恢复 → 账户恢复密钥」保存云恢复密钥，用于忘记密码时恢复。</p>
    <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
    <button class="ui-primary-button w-full" :disabled="busy" type="submit">{{ busy ? '正在连接并同步…' : register ? '注册并开始同步' : '登录并同步' }}</button>
    <button class="ui-secondary-button w-full" :disabled="busy" type="button" @click="register = !register; error = ''; confirmation = ''">{{ register ? '已有账号，去登录' : '首次使用，创建云账号' }}</button>
  </form>
  <button v-if="!register" class="ui-ghost-button mt-3 w-full" :disabled="busy" @click="recovering = true; password = ''">忘记云账号密码？</button>
  <p class="mt-5 text-xs leading-relaxed text-t3">首次登录需要联网，以后可离线解锁。附件按需下载；应用打开且联网时自动同步。</p>
  <button class="ui-ghost-button mt-4 w-full text-sm" :disabled="busy" @click="emit('local')">仅在本机使用 / 旧版设备加入</button>
  </template>
</template>
