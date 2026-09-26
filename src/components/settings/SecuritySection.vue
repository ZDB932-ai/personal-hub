<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Info, ShieldCheck } from '@lucide/vue'
import AppSelect from '@/components/AppSelect.vue'
import PasswordInput from '@/components/PasswordInput.vue'
import {
  autoLockMinutes,
  changePassword,
  lockMode,
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
import DeviceSection from './DeviceSection.vue'

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
  pwError.value = ''
  if (pwForm.newPw.length < 4) {
    pwError.value = '新密码至少需要 4 位'
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
  } finally {
    pwBusy.value = false
  }
}

async function enableBiometric(): Promise<void> {
  bioError.value = ''
  const env = dataEnvelope.value
  if (!env || !bioPw.value) return
  bioBusy.value = true
  try {
    await unlockEnvelope(env, bioPw.value)
    await biometricStoreSecret(bioPw.value)
    setBiometricEnabled(true)
    bioEnabled.value = true
    bioPw.value = ''
    toast('指纹解锁已开启')
  } catch {
    bioError.value = '主密码不正确'
  } finally {
    bioBusy.value = false
  }
}

async function disableBiometric(): Promise<void> {
  await biometricClear()
  bioEnabled.value = false
  toast('指纹解锁已关闭')
}

</script>

<template>
  <div>
    <DeviceSection :key="String(props.open)" />
    <div class="flex items-center justify-between">
      <h4 class="text-xs font-semibold uppercase tracking-wider text-t4">加密保护 · 已开启</h4>
      <span
        v-if="lockMode === 'legacy'"
        class="rounded-lg border border-warn/25 bg-warn/15 px-2 py-0.5 text-[11px] text-warn"
      >
        数据迁移完成
      </span>
    </div>

    <div class="mt-3 flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
      <div>
        <p class="text-sm font-medium">自动锁定</p>
        <p class="mt-0.5 text-xs text-t4">无操作达到时限后回到锁屏并清除内存密钥</p>
      </div>
      <div class="w-32">
        <AppSelect
          :model-value="autoLockMinutes"
          :options="AUTO_OPTIONS"
          @update:model-value="setAutoLock(Number($event))"
        />
      </div>
    </div>

    <div class="mt-3 space-y-3 rounded-xl border border-line bg-surface p-4">
      <p class="text-sm font-medium">修改主密码</p>
      <PasswordInput v-model="pwForm.oldPw"  placeholder="当前主密码" autocomplete="current-password" />
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PasswordInput v-model="pwForm.newPw"  placeholder="新密码" autocomplete="new-password" />
        <PasswordInput v-model="pwForm.confirmPw"  placeholder="确认新密码" autocomplete="new-password" />
      </div>
      <input v-model="pwForm.hint" class="control-input px-3" placeholder="新的密码提示（选填）" />
      <p v-if="pwError" class="text-xs text-danger">{{ pwError }}</p>
      <button
        :disabled="!canSubmitPw"
        class="ui-primary-button w-full disabled:cursor-not-allowed disabled:opacity-40"
        @click="submitChange"
      >
        {{ pwBusy ? '正在重新加密…' : '确认修改' }}
      </button>
    </div>

    <section v-if="isNative" class="mt-4">
      <div class="rounded-xl border border-line bg-surface p-4">
        <template v-if="!bioAvailable">
          <p class="text-sm text-t3">此设备未启用指纹/面容，或插件不可用</p>
        </template>
        <template v-else-if="bioEnabled">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">指纹解锁 · 已开启</p>
              <p class="mt-0.5 text-xs text-t4">锁屏页会出现指纹按钮，主密码仍可随时使用</p>
            </div>
            <button
              class="ui-danger-button shrink-0 px-3 text-xs"
              @click="disableBiometric"
            >
              关闭
            </button>
          </div>
        </template>
        <template v-else>
          <p class="text-sm font-medium">开启指纹解锁</p>
          <p class="mt-0.5 text-xs text-t4">验证主密码后，指纹凭据将存入系统安全芯片（Keystore）</p>
          <div class="mt-2.5 flex gap-2">
            <div class="min-w-0 flex-1">
              <PasswordInput
                v-model="bioPw"
                
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
          <p v-if="bioError" class="mt-2 text-xs text-danger">{{ bioError }}</p>
        </template>
      </div>
    </section>

    <div class="mt-4 flex items-center gap-2 rounded-xl border border-ok/20 bg-ok/10 px-4 py-3 text-xs text-ok">
      <ShieldCheck class="h-4 w-4 shrink-0" />
      Argon2id 密钥派生 + AES-256-GCM 加密，本机存储与云端备份均为密文。
    </div>

    <div class="mt-3 flex items-start gap-2.5 rounded-xl border border-line bg-inset p-3.5 text-[11px] leading-relaxed text-t4">
      <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
      备份保留导出时的密码保护。设备独立密码模式下，本机改密不会撤销旧备份或其他设备的数据密钥；恢复到其他保险库时会重新加密。
    </div>
  </div>
</template>
