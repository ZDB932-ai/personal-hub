<script setup lang="ts">
import { ref, watch } from 'vue'
import { configureLocalAccount, hasLocalRecovery, isGated, localAccountName } from '@/stores/lock'
import { dataEnvelope } from '@/stores/database'
import { generateRecoveryCode, unlockEnvelope } from '@/lib/vaultKeys'
import PasswordInput from '../PasswordInput.vue'
import RecoveryKeyCard from '../RecoveryKeyCard.vue'
const name = ref(localAccountName.value || '我的账户')
const props = defineProps<{ open: boolean }>()
const expanded = ref(false)
const password = ref('')
const code = ref('')
const busy = ref(false)
const error = ref('')
const success = ref('')
watch(isGated, () => { password.value = ''; code.value = ''; error.value = '' })
watch(() => props.open, open => { if (!open) { password.value = ''; code.value = ''; error.value = ''; success.value = '' } })
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
  <section class="settings-card space-y-4" aria-label="本机账户与恢复">
    <div class="settings-row"><div class="settings-row-copy"><h3 class="settings-section-title">本机账户</h3><p class="mt-1 break-words text-base font-semibold text-t1">{{ localAccountName || '我的账户' }}</p></div><span class="settings-status text-t2">仅此设备</span></div>
    <p class="settings-description">此账户用于本机登录。恢复密钥在此设备生效，不会随云同步、数据备份或设备迁移转移。</p>
    <div class="settings-row"><div class="settings-row-copy"><h4 class="text-sm font-medium text-t1">密码恢复</h4><p class="settings-description">{{ hasLocalRecovery ? '已设置恢复密钥，可在忘记密码时重新验证身份。' : '尚未设置。保存恢复密钥后，忘记密码时仍可找回本机内容。' }}</p></div><button class="ui-secondary-button" :disabled="busy" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '收起' : hasLocalRecovery ? '管理恢复密钥' : '设置恢复密钥' }}</button></div>
    <RecoveryKeyCard v-if="code" :code="code" :busy="busy" @confirm="enable" @cancel="code = ''; password = ''; error = ''" />
    <form v-else-if="expanded" class="settings-subsection space-y-4" @submit.prevent="prepare">
      <label class="block text-sm text-t2">账户名称<input v-model="name" :disabled="busy" maxlength="40" autocomplete="username" class="control-input mt-2 px-3" required /></label>
      <p class="text-xs text-t3">账户名称会在登录页显示，不要填写敏感信息。</p>
      <div class="settings-field"><label for="settings-local-recovery-password">当前密码</label><PasswordInput id="settings-local-recovery-password" v-model="password" :disabled="busy" placeholder="验证当前密码" autocomplete="current-password" required /></div>
      <p v-if="dataEnvelope?.v !== 3" class="text-xs leading-relaxed text-warn">此操作会升级本机加密格式，请先导出数据备份。升级需要所有附件在本机；旧版整库同步将停用，之后可使用逐条加密同步。</p>
      <p v-if="hasLocalRecovery" class="settings-description">保存新密钥后，旧密钥在当前设备失效；历史副本不受影响。</p>
      <button class="ui-primary-button w-full" :disabled="busy || !password || !name.trim()">{{ busy ? '正在验证…' : hasLocalRecovery ? '重新生成恢复密钥' : '生成恢复密钥' }}</button>
    </form>
    <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
    <p v-if="success" role="status" class="text-sm text-ok">{{ success }}</p>
  </section>
</template>
