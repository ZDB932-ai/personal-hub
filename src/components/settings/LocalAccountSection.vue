<script setup lang="ts">
import { ref, watch } from 'vue'
import { configureLocalAccount, hasLocalRecovery, isGated, localAccountName } from '@/stores/lock'
import { dataEnvelope } from '@/stores/database'
import { generateRecoveryCode, unlockEnvelope } from '@/lib/vaultKeys'
import PasswordInput from '../PasswordInput.vue'
import RecoveryKeyCard from '../RecoveryKeyCard.vue'
const name = ref(localAccountName.value || '我的账户')
const password = ref('')
const code = ref('')
const busy = ref(false)
const error = ref('')
const success = ref('')
watch(isGated, () => { password.value = ''; code.value = ''; error.value = '' })
async function prepare() {
  if (busy.value) return
  error.value = ''; success.value = ''
  if (!name.value.trim() || name.value.trim().length > 40 || !password.value) { error.value = '请填写账户名称和当前密码'; return }
  busy.value = true
  try {
    const env = dataEnvelope.value
    if (!env || isGated.value) throw new Error('请重新登录')
    await unlockEnvelope(env, password.value)
    if (isGated.value || dataEnvelope.value !== env) throw new Error('账户状态已变化，请重试')
    code.value = generateRecoveryCode()
  } catch { error.value = '密码不正确或账户状态已变化，请重试' }
  finally { busy.value = false }
}
async function enable() {
  busy.value = true; error.value = ''
  try {
    await configureLocalAccount(name.value, password.value, code.value)
    code.value = ''; password.value = ''; success.value = '本地账户与恢复密钥已启用。请另外保留数据备份。'
  } catch (e) { error.value = e instanceof Error ? e.message : '设置失败，请重试' }
  finally { busy.value = false }
}
</script>
<template>
  <section class="mb-6 space-y-4 rounded-xl border border-line bg-surface p-4" aria-label="本地账户与恢复">
    <div><h3 class="text-sm font-semibold text-t1">本地账户与恢复</h3><p class="mt-2 text-xs leading-relaxed text-t3">{{ hasLocalRecovery ? '恢复密钥已启用。重新生成并确认后，旧密钥对当前设备失效；历史副本不受影响。' : '为本机账户设置名称和恢复密钥，忘记密码时可以保留数据并重设密码。' }}</p></div>
    <RecoveryKeyCard v-if="code" :code="code" :busy="busy" @confirm="enable" @cancel="code = ''; password = ''; error = ''" />
    <form v-else class="space-y-4" @submit.prevent="prepare">
      <label class="block text-sm text-t2">账户名称<input v-model="name" maxlength="40" autocomplete="username" class="control-input mt-2 px-3" required /></label>
      <p class="text-xs text-t3">账户名称会在登录页显示，不要填写敏感信息。</p>
      <label class="block text-sm text-t2">当前密码<PasswordInput v-model="password" class="mt-2" placeholder="验证当前密码" autocomplete="current-password" required /></label>
      <p v-if="dataEnvelope?.v !== 3" class="text-xs leading-relaxed text-warn">此操作会升级本机加密格式，请先导出数据备份。升级需要所有附件在本机；旧版整库同步将停用，之后可使用逐条加密同步。</p>
      <button class="ui-secondary-button w-full" :disabled="busy">{{ hasLocalRecovery ? '重新生成恢复密钥' : '设置账户与恢复密钥' }}</button>
    </form>
    <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
    <p v-if="success" role="status" class="text-sm text-ok">{{ success }}</p>
  </section>
</template>
