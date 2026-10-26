<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Info, ShieldCheck } from '@lucide/vue'
import AppSelect from '@/components/AppSelect.vue'
import PasswordInput from '@/components/PasswordInput.vue'
import {
  autoLockMinutes,
  changePassword,
  lockMode,
  localCloudAccount,
  setAutoLock,
} from '@/stores/lock'
import { dataEnvelope } from '@/stores/database'
import {
  biometricAvailable,
  biometricClear,
  biometricEnabled,
  biometricStoreSecret,
  setBiometricEnabled,
} from '@/lib/biometric'
import { Capacitor } from '@capacitor/core'
import { unlockEnvelope } from '@/lib/vaultKeys'
import { toast } from '@/lib/toast'

const props = defineProps<{
  open: boolean
}>()

const AUTO_OPTIONS = [
  { value: 0, label: '从不' },
  { value: 1, label: '1 分钟' },
  { value: 5, label: '5 分钟' },
  { value: 10, label: '10 分钟' },
  { value: 30, label: '30 分钟' },
]

const pwForm = reactive({
  oldPw: '',
  newPw: '',
  confirmPw: '',
  hint: '',
})
const pwError = ref('')
const pwBusy = ref(false)
const showPassword = ref(false)

const isNative = Capacitor.isNativePlatform()
const bioEnabled = ref(false)
const bioAvailable = ref(false)
const bioPw = ref('')
const bioError = ref('')
const bioBusy = ref(false)

watch(
  () => props.open,
  async (open) => {
    if (open) {
      Object.assign(pwForm, { oldPw: '', newPw: '', confirmPw: '', hint: '' })
      pwError.value = ''
      pwBusy.value = false
      bioPw.value = ''
      bioError.value = ''
      bioEnabled.value = biometricEnabled()
      bioAvailable.value = isNative ? await biometricAvailable() : false
    }
  },
  { immediate: true },
)

const canSubmitPw = computed(
  () => pwForm.oldPw && pwForm.newPw && pwForm.confirmPw && !pwBusy.value,
)

async function submitChange() {
  if (pwBusy.value) return
  pwError.value = ''
  if (pwForm.newPw.length < 8 || pwForm.newPw.length > 256) {
    pwError.value = '新密码需要 8–256 个字符'
    return
  }
  if (pwForm.newPw !== pwForm.confirmPw) {
    pwError.value = '两次输入的新密码不一致'
    return
  }
  pwBusy.value = true
  try {
    const result = await changePassword(pwForm.oldPw, pwForm.newPw, pwForm.hint)
    if (!result.ok) {
      pwError.value = result.error ?? '修改主密码失败'
      return
    }
    toast(dataEnvelope.value?.v === 3 ? '本机主密码已更新，其他设备密码不受影响' : '主密码已更新，数据已用新密钥重新加密')
    Object.assign(pwForm, { oldPw: '', newPw: '', confirmPw: '', hint: '' })
  } catch (error) {
    pwError.value = error instanceof Error ? error.message : '密码未更新，请重试'
  } finally {
    pwBusy.value = false
  }
}

async function enableBiometric(): Promise<void> {
  if (bioBusy.value) return
  bioError.value = ''
  const env = dataEnvelope.value
  if (!env || !bioPw.value) return
  bioBusy.value = true
  let passwordVerified = false
  try {
    await unlockEnvelope(env, bioPw.value)
    passwordVerified = true
    await biometricStoreSecret(bioPw.value)
    setBiometricEnabled(true)
    bioEnabled.value = true
    bioPw.value = ''
    toast('生物识别解锁已开启')
  } catch {
    bioError.value = passwordVerified ? '无法保存系统解锁凭据，请检查设备的生物识别设置后重试' : '密码验证失败，请检查后重试'
  } finally {
    bioBusy.value = false
  }
}

async function disableBiometric(): Promise<void> {
  if (bioBusy.value) return
  bioBusy.value = true
  bioError.value = ''
  try {
    await biometricClear()
    bioEnabled.value = false
    toast('生物识别解锁已关闭')
  } catch {
    bioError.value = '未能移除系统解锁凭据，请重试'
  } finally {
    bioBusy.value = false
  }
}

</script>

<template>
  <div class="settings-stack">
    <section class="settings-card">
    <div class="settings-row">
      <div class="settings-row-copy"><h3 class="settings-section-title">加密与自动锁定</h3><p class="settings-description">锁定或重新启动应用后，需要再次验证身份才能查看内容。</p></div>
      <span class="settings-status" :class="lockMode === 'encrypted' ? 'text-ok' : 'text-warn'">{{ lockMode === 'encrypted' ? '加密已开启' : '尚未启用加密' }}</span>
    </div>
    <p v-if="lockMode !== 'encrypted'" class="settings-description text-warn">当前数据尚未确认加密，请先完成账户设置与加密迁移。</p>

    <div class="settings-row mt-4">
      <div class="settings-row-copy">
        <p id="auto-lock-label" class="text-sm font-medium">自动锁定</p>
        <p class="settings-description">无操作达到此时长后，自动保护当前内容。</p>
      </div>
      <div class="w-32">
        <AppSelect
          :model-value="autoLockMinutes"
          :options="AUTO_OPTIONS"
          aria-labelledby="auto-lock-label"
          @update:model-value="setAutoLock(Number($event))"
        />
      </div>
    </div>
    </section>

    <section v-if="!localCloudAccount" class="settings-card space-y-3">
      <div class="settings-row"><div class="settings-row-copy"><h3 class="settings-section-title">本机解锁密码</h3><p class="settings-description">用于打开此设备上保存的内容。</p></div><button class="ui-secondary-button" :aria-expanded="showPassword" :disabled="pwBusy" @click="showPassword = !showPassword">{{ showPassword ? '收起' : '修改密码' }}</button></div>
      <form v-if="showPassword" class="space-y-3" @submit.prevent="submitChange">
      <div class="settings-field"><label for="settings-current-password">当前密码</label><PasswordInput id="settings-current-password" v-model="pwForm.oldPw" :disabled="pwBusy" placeholder="输入当前密码" autocomplete="current-password" /></div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="settings-field"><label for="settings-next-password">新密码</label><PasswordInput id="settings-next-password" v-model="pwForm.newPw" :disabled="pwBusy" placeholder="8–256 个字符" autocomplete="new-password" /></div>
        <div class="settings-field"><label for="settings-confirm-password">确认新密码</label><PasswordInput id="settings-confirm-password" v-model="pwForm.confirmPw" :disabled="pwBusy" placeholder="再次输入新密码" autocomplete="new-password" /></div>
      </div>
      <label class="settings-field">密码提示（选填）<input v-model="pwForm.hint" :disabled="pwBusy" class="control-input px-3" placeholder="帮助回忆密码，不要填写密码本身" /></label>
      <p class="settings-description">{{ dataEnvelope?.v === 3 ? '修改仅影响本机密码。其他设备和已导出的备份仍使用各自原有密码。' : '修改后会重新加密本机数据，请保存一份新的加密备份。' }}</p>
      <p v-if="pwError" role="alert" class="text-xs text-danger">{{ pwError }}</p>
      <button
        :disabled="!canSubmitPw"
        class="ui-primary-button w-full disabled:cursor-not-allowed disabled:opacity-40"
        type="submit"
      >
        {{ pwBusy ? '正在更新密码…' : '保存密码' }}
      </button>
      </form>
    </section>

    <section v-if="isNative" class="settings-card">
      <div>
        <template v-if="!bioAvailable">
          <h3 class="settings-section-title">生物识别解锁</h3><p class="settings-description">此设备暂不可用。请检查系统中的生物识别设置，或继续使用密码解锁。</p>
        </template>
        <template v-else-if="bioEnabled">
          <div class="settings-row">
            <div class="settings-row-copy">
              <h3 class="settings-section-title">生物识别解锁 · 已开启</h3>
              <p class="settings-description">使用系统身份验证快速解锁，也可使用密码。</p>
            </div>
            <button
              class="ui-danger-button shrink-0 px-3 text-xs"
              :disabled="bioBusy"
              @click="disableBiometric"
            >
              {{ bioBusy ? '正在关闭…' : '关闭' }}
            </button>
          </div>
        </template>
        <template v-else>
          <h3 class="settings-section-title">生物识别解锁</h3>
          <p class="settings-description">验证密码后，解锁凭据由系统安全存储保护。</p>
          <div class="mt-3 flex flex-wrap items-end gap-2">
            <div class="settings-field min-w-0 flex-1"><label for="settings-biometric-password">当前密码</label>
              <PasswordInput
                id="settings-biometric-password"
                v-model="bioPw"
                :disabled="bioBusy"
                placeholder="输入当前主密码"
                autocomplete="current-password"
                @keydown.enter="enableBiometric"
              />
            </div>
            <button
              :disabled="!bioPw || bioBusy"
              class="ui-primary-button shrink-0 px-4 disabled:opacity-40"
              @click="enableBiometric"
            >
              {{ bioBusy ? '验证中…' : '开启' }}
            </button>
          </div>
        </template>
        <p v-if="bioError" role="alert" class="mt-2 text-xs text-danger">{{ bioError }}</p>
      </div>
    </section>

    <div v-if="lockMode === 'encrypted'" class="settings-note flex items-center gap-2 text-xs text-ok">
      <ShieldCheck class="h-4 w-4 shrink-0" />
      个人内容在设备上加密，再保存或同步。
    </div>

    <details class="settings-card settings-disclosure"><summary class="settings-section-title"><Info class="h-4 w-4" />加密与备份说明</summary><div class="settings-disclosure-body space-y-2"><p class="settings-description">使用 Argon2id 密钥派生和 AES-256-GCM 加密。解锁密钥仅保存在内存，锁定时释放。</p><p class="settings-description">备份保留导出时的密码保护。设备独立密码模式下，本机改密不会撤销旧备份或其他设备的数据密钥；恢复到其他保险库时会重新加密。</p></div></details>
  </div>
</template>
