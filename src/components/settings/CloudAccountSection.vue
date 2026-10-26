<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { isGated, localCloudAccount } from '@/stores/lock'
import { getActiveKey } from '@/stores/database'
import { authenticateCloud, changeCloudPassword, enableCloudRecovery } from '@/lib/cloudAccount'
import { adoptCloudSession } from '@/lib/cloudAccountSession'
import { generateRecoveryCode } from '@/lib/vaultKeys'
import PasswordInput from '../PasswordInput.vue'
import RecoveryKeyCard from '../RecoveryKeyCard.vue'

const props = defineProps<{ open: boolean }>()
const password = ref(''), nextPassword = ref(''), confirmation = ref(''), code = ref('')
const busy = ref(false), error = ref(''), success = ref('')
const action = ref<'password' | 'recovery' | null>(null)
let epoch = 0
function clear() { epoch++; password.value = ''; nextPassword.value = ''; confirmation.value = ''; code.value = ''; error.value = ''; success.value = '' }
watch([() => props.open, isGated], clear, { flush: 'sync' })
onBeforeUnmount(clear)
async function submit() {
  if (busy.value || isGated.value || !props.open || !action.value) return
  if (action.value === 'password' && nextPassword.value !== confirmation.value) { error.value = '两次密码不一致'; return }
  error.value = ''; success.value = ''; busy.value = true
  const generation = epoch, key = getActiveKey(), name = localCloudAccount.value
  const valid = () => generation === epoch && !isGated.value && props.open && getActiveKey() === key && localCloudAccount.value === name
  let changed = false
  try {
    if (action.value === 'recovery') {
      if (!code.value) {
        await authenticateCloud(name, password.value, false)
        if (valid()) code.value = generateRecoveryCode()
      } else {
        await enableCloudRecovery(name, password.value, code.value, valid)
        if (valid()) { code.value = ''; password.value = ''; success.value = '云恢复已启用，此密钥可在手机、电脑和网页找回密码。' }
      }
    } else {
      const result = await changeCloudPassword(name, password.value, nextPassword.value, valid)
      changed = true
      if (!valid()) return
      await adoptCloudSession(result)
      password.value = ''; nextPassword.value = ''; confirmation.value = ''
      success.value = '云密码和本机密码已更新，数据已保留。其他设备请使用新密码重新登录。'
    }
  } catch (e) {
    if (generation === epoch) error.value = changed ? '云密码已修改，但本机暂未完成更新。请锁定后用新密码登录，本机数据仍保留。' : e instanceof Error ? e.message : '操作失败，请稍后重试'
  } finally { busy.value = false }
}
</script>
<template>
  <section v-if="localCloudAccount" class="settings-card space-y-4" aria-label="云账号与恢复">
    <div class="settings-row"><div class="settings-row-copy"><h3 class="settings-section-title">云账号</h3><p class="mt-1 break-words text-base font-semibold text-t1">{{ localCloudAccount }}</p></div><span class="settings-status text-primary">跨设备使用</span></div>
    <p class="settings-description">在手机、电脑和网页使用同一账号登录，即可连接个人内容。密码修改和账户恢复适用于所有设备。</p>
    <RecoveryKeyCard v-if="code" :code="code" :busy="busy" cloud @confirm="submit" @cancel="clear" />
    <template v-else>
      <div class="settings-actions flex flex-wrap gap-2">
        <button class="ui-secondary-button" :disabled="busy" :aria-expanded="action === 'password'" @click="clear(); action = action === 'password' ? null : 'password'">修改密码</button>
        <button class="ui-secondary-button" :disabled="busy" :aria-expanded="action === 'recovery'" @click="clear(); action = action === 'recovery' ? null : 'recovery'">设置恢复密钥</button>
      </div>
      <form v-if="action" class="settings-subsection space-y-3" @submit.prevent="submit">
        <h4 class="settings-section-title">{{ action === 'password' ? '修改账户密码' : '账户恢复密钥' }}</h4>
        <div class="settings-field"><label for="settings-cloud-current-password">当前密码</label><PasswordInput id="settings-cloud-current-password" v-model="password" :disabled="busy" placeholder="输入当前云账号密码" autocomplete="current-password" required /></div>
        <template v-if="action === 'password'">
          <div class="settings-field"><label for="settings-cloud-next-password">新密码</label><PasswordInput id="settings-cloud-next-password" v-model="nextPassword" :disabled="busy" placeholder="至少 8 个字符" autocomplete="new-password" required /></div>
          <div class="settings-field"><label for="settings-cloud-confirm-password">确认新密码</label><PasswordInput id="settings-cloud-confirm-password" v-model="confirmation" :disabled="busy" placeholder="再次输入新密码" autocomplete="new-password" required /></div>
          <p class="text-xs leading-relaxed text-t3">改密会撤销所有旧同步登录；本机数据、附件和待上传内容保留。离线设备需联网并用新密码登录后才更新本机解锁密码。</p>
        </template>
        <p v-else class="text-xs leading-relaxed text-t3">首次设置或重新生成均需验证密码。确认保存新密钥后，旧云恢复密钥失效。</p>
        <button class="ui-primary-button w-full" :disabled="busy || !password || (action === 'password' && (!nextPassword || !confirmation))">{{ busy ? '正在处理…' : action === 'password' ? '保存密码' : '生成恢复密钥' }}</button>
      </form>
    </template>
    <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
    <p v-if="success" role="status" class="text-sm text-ok">{{ success }}</p>
    <p class="settings-description">恢复密钥可在忘记密码时验证身份，请与密码分开妥善保管。恢复密钥不能代替数据备份。</p>
  </section>
</template>
