<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { LockKeyhole, Fingerprint } from '@lucide/vue'
import { isGated, usesSetupScreen, lockMode, localAccountName, hasLocalRecovery, lockHint, setupLock, unlockApp, createLocalAccount, resetLocalPassword } from '@/stores/lock'
import { generateRecoveryCode } from '@/lib/vaultKeys'
import { biometricAvailable, biometricEnabled, biometricGetSecret, biometricClear } from '@/lib/biometric'
import { confirmAction } from '@/lib/confirmAction'
import { deleteAllBlobs } from '@/lib/docdb'
import { deleteAllImgs } from '@/lib/wallpaperdb'
import { resetVaultRepository } from '@/lib/vaultRepository'
import { clearNativeReminders } from '@/lib/reminders'
import DeviceJoin from './DeviceJoin.vue'
import PasswordInput from './PasswordInput.vue'
import RecoveryKeyCard from './RecoveryKeyCard.vue'
const screen = ref<'login' | 'recovery' | 'key'>('login')
const setup = usesSetupScreen
const account = ref('')
const password = ref('')
const confirmation = ref('')
const recovery = ref('')
const generated = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')
const canBiometric = ref(false)
const title = computed(() => screen.value === 'recovery' ? '找回密码' : setup.value ? '创建本地账户' : '欢迎回来')
onMounted(async () => { canBiometric.value = biometricEnabled() && await biometricAvailable() })
watch(isGated, () => { password.value = ''; confirmation.value = ''; recovery.value = ''; generated.value = ''; screen.value = 'login'; error.value = '' })
function switchScreen(next: 'login' | 'recovery') { screen.value = next; error.value = ''; notice.value = ''; password.value = ''; confirmation.value = ''; recovery.value = ''; generated.value = '' }
async function submit() {
  if (busy.value) return
  error.value = ''; notice.value = ''
  if (setup.value || screen.value === 'recovery') {
    if (password.value.length < 8 || password.value.length > 256) { error.value = '密码需要 8–256 个字符'; return }
    if (password.value !== confirmation.value) { error.value = '两次输入的密码不一致'; return }
  }
  if (setup.value && lockMode.value === 'fresh') {
    if (!account.value.trim() || account.value.trim().length > 40) { error.value = '账户名称需要 1–40 个字符'; return }
    generated.value = generateRecoveryCode(); screen.value = 'key'; return
  }
  busy.value = true
  try {
    if (screen.value === 'recovery') {
      await resetLocalPassword(recovery.value, password.value)
      switchScreen('login'); canBiometric.value = false; notice.value = '密码已重设，数据已保留。请使用新密码登录。'
    } else if (setup.value) {
      await setupLock(password.value, '')
    } else if (!await unlockApp(password.value)) { error.value = '密码不正确或本机数据无法读取，请重试' }
  } catch (e) { error.value = e instanceof Error ? e.message : '操作失败，请重试' }
  finally { busy.value = false }
}
async function create() {
  busy.value = true; error.value = ''
  try { await createLocalAccount(account.value, password.value, generated.value) }
  catch (e) { error.value = e instanceof Error ? e.message : '创建失败，请重试' }
  finally { busy.value = false }
}
async function biometric() {
  busy.value = true; error.value = ''
  try { const secret = await biometricGetSecret('解锁 Personal Hub'); if (secret && !await unlockApp(secret)) error.value = '请使用密码登录后重新设置指纹' }
  catch { error.value = '指纹解锁失败，请使用密码' }
  finally { busy.value = false }
}
async function resetAll() {
  if (busy.value) return
  if (!await confirmAction('这会删除本机的任务、密码、资料、附件及恢复信息，无法撤销。云端数据不会删除。继续吗？')) return
  if (!await confirmAction('再次确认：清除本机全部数据并重新开始？')) return
  busy.value = true
  try { await clearNativeReminders(); await resetVaultRepository(); await Promise.allSettled([deleteAllBlobs(), deleteAllImgs(), biometricClear()]); localStorage.clear(); sessionStorage.clear(); location.reload() }
  catch (e) { error.value = e instanceof Error ? e.message : '清除失败'; busy.value = false }
}
</script>
<template>
  <main class="account-screen">
    <section class="account-card" aria-label="本地账户">
      <div class="account-brand"><LockKeyhole class="h-5 w-5" /><span>Personal Hub</span><span class="ml-auto text-xs text-t3">本地账户</span></div>
      <RecoveryKeyCard v-if="screen === 'key'" :code="generated" :busy="busy" @confirm="create" @cancel="switchScreen('login')" />
      <template v-else>
        <h1 class="text-2xl font-semibold text-t1">{{ title }}</h1>
        <p class="mt-2 text-sm leading-relaxed text-t3">{{ screen === 'recovery' ? '验证恢复密钥后，设置新的登录密码。' : setup ? '为这台设备创建账户，数据加密保存在本机。' : '登录你的个人信息台，继续今天的安排。' }}</p>
        <form v-if="screen !== 'recovery' || hasLocalRecovery" class="mt-6 space-y-4" @submit.prevent="submit">
          <label v-if="setup && lockMode === 'fresh'" class="account-label">账户名称<input v-model="account" class="control-input mt-2 px-3" maxlength="40" autocomplete="username" placeholder="例如：我的工作台" required /><span class="mt-1 block text-xs font-normal text-t3">名称会显示在登录页，请勿填写敏感信息。</span></label>
          <div v-else class="rounded-lg border border-line bg-inset px-4 py-3"><p class="text-xs text-t3">当前账户</p><p class="mt-1 break-words text-sm text-t1">{{ localAccountName || '本机账户' }}</p></div>
          <label v-if="screen === 'recovery'" class="account-label">恢复密钥<textarea v-model="recovery" rows="3" class="control-input mt-2 p-3 font-mono" autocomplete="off" placeholder="输入完整的 8 组恢复密钥" required /></label>
          <label class="account-label">{{ screen === 'recovery' ? '新密码' : '密码' }}<PasswordInput v-model="password" class="mt-2" :placeholder="screen === 'recovery' ? '新密码（至少 8 位）' : setup ? '创建主密码' : '主密码'" :autocomplete="setup || screen === 'recovery' ? 'new-password' : 'current-password'" required /></label>
          <label v-if="setup || screen === 'recovery'" class="account-label">确认密码<PasswordInput v-model="confirmation" class="mt-2" placeholder="再次输入主密码" autocomplete="new-password" required /></label>
          <div v-if="!setup && screen === 'login'" class="flex justify-end"><button type="button" class="ui-ghost-button text-sm text-primary" :disabled="busy" @click="switchScreen('recovery')">忘记密码？</button></div>
          <button type="submit" class="ui-primary-button w-full" :disabled="busy">{{ busy ? '正在处理…' : screen === 'recovery' ? '重设密码' : setup ? '下一步：保存恢复密钥' : '登录' }}</button>
          <button v-if="canBiometric && !setup && screen === 'login'" type="button" class="ui-secondary-button w-full gap-2" :disabled="busy" @click="biometric"><Fingerprint class="h-4 w-4" />指纹解锁</button>
        </form>
        <template v-if="screen === 'recovery'">
          <p v-if="!hasLocalRecovery" class="mt-6 rounded-lg border border-warn/25 bg-surface p-4 text-sm leading-relaxed text-t2">此设备尚未设置恢复密钥，无法直接重设密码。若记得原密码，请登录后在「设置 → 安全 → 本地账户与恢复」中启用。</p>
          <details v-if="lockHint" class="mt-4 text-sm text-t3"><summary class="cursor-pointer py-2">查看密码提示</summary><p class="py-2">{{ lockHint }}</p></details>
          <p class="mt-4 text-xs leading-relaxed text-t3">没有可用密钥时，可在仍能解锁的其他设备上导出数据。恢复密钥不能恢复已丢失的数据文件，也不适用于其他设备。</p>
          <button type="button" class="ui-ghost-button mt-4 w-full" :disabled="busy" @click="switchScreen('login')">返回登录</button>
          <details class="mt-5 border-t border-line pt-3 text-xs text-t3"><summary class="cursor-pointer py-2">无法恢复？其他选项</summary><p class="py-2 leading-relaxed">清除操作不是密码恢复。请先确认已有可用的数据副本。</p><button type="button" class="ui-ghost-button text-danger" :disabled="busy" @click="resetAll">清除本机数据并重新开始</button></details>
        </template>
        <DeviceJoin v-if="lockMode === 'fresh' && screen === 'login'" :disabled="busy" @busy="busy = $event" />
      </template>
      <p v-if="error" role="alert" class="mt-4 rounded-lg border border-danger/25 bg-danger/10 p-3 text-sm text-danger">{{ error }}</p>
      <p v-if="notice" role="status" class="mt-4 text-sm text-ok">{{ notice }}</p>
      <p class="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-t3">本地账户可离线使用。账户名称不是云端账号；跨设备使用需另行加入保险库。</p>
    </section>
  </main>
</template>
<style scoped>
.account-screen { position: fixed; inset: 0; z-index: 90; overflow-y: auto; display: flex; align-items: flex-start; justify-content: center; padding: max(24px, 6vh) 16px 24px; background: var(--tk-body); }
.account-card { width: 100%; max-width: 440px; padding: 32px; border: 1px solid var(--tk-line); border-radius: var(--ui-card-radius, 12px); background: var(--tk-surface); }
.account-brand { display: flex; align-items: center; gap: 8px; margin-bottom: 32px; color: var(--tk-primary); font-size: 14px; font-weight: 600; }
.account-label { display: block; font-size: 14px; font-weight: 500; color: var(--tk-t2); }
@media(max-width: 479px) { .account-card { padding: 24px 20px; } .account-brand { margin-bottom: 24px; } }
</style>
