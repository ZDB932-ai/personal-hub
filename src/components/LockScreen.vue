<script setup lang="ts">
import { confirmAction } from '@/lib/confirmAction'
import { computed, onMounted, ref, watch } from 'vue'
import { Eye, EyeOff, Fingerprint, LockKeyhole, ShieldCheck } from '@lucide/vue'
import { isGated, lockHint, setupLock, unlockApp, usesSetupScreen } from '@/stores/lock'
import { biometricAvailable, biometricClear, biometricEnabled, biometricGetSecret } from '@/lib/biometric'
import { deleteAllBlobs } from '@/lib/docdb'
import { deleteAllImgs } from '@/lib/wallpaperdb'
import { resetVaultRepository } from '@/lib/vaultRepository'
import { clearNativeReminders } from '@/lib/reminders'
import DeviceJoin from './DeviceJoin.vue'
import { lockMode } from '@/stores/lock'

const mode = computed<'setup' | 'locked'>(() => (usesSetupScreen.value ? 'setup' : 'locked'))

const password = ref('')
const confirmPassword = ref('')
const hint = ref('')
const error = ref('')
const shake = ref(false)
const busy = ref(false)
const showPw = ref(false)
const showHint = ref(false)
const canBiometric = ref(false)
const resetting = ref(false)

onMounted(async () => {
  canBiometric.value = biometricEnabled() && (await biometricAvailable())
})

async function unlockWithBiometric(): Promise<void> {
  if (busy.value) return
  busy.value = true
  const secret = await biometricGetSecret('解锁 Personal Hub')
  if (!secret) {
    busy.value = false
    return
  }
  const ok = await unlockApp(secret)
  busy.value = false
  if (!ok) fail('指纹已通过，但主密码校验失败；请用密码解锁后重新设置指纹')
}

watch(isGated, () => {
  password.value = ''
  confirmPassword.value = ''
  hint.value = ''
  error.value = ''
  showPw.value = false
  showHint.value = false
})

function fail(message: string) {
  error.value = message
  shake.value = true
  setTimeout(() => (shake.value = false), 500)
}

async function submit() {
  if (busy.value) return
  if (mode.value === 'setup') {
    if (password.value.length < 4) return fail('主密码至少需要 4 位')
    if (password.value !== confirmPassword.value) return fail('两次输入的密码不一致')
    busy.value = true
    try {
      await setupLock(password.value, hint.value)
    } finally {
      busy.value = false
    }
  } else {
    busy.value = true
    const ok = await unlockApp(password.value)
    busy.value = false
    if (!ok) return fail('密码错误，请重试')
  }
}

async function resetAll(): Promise<void> {
  if (resetting.value) return
  const confirmed = await confirmAction(
    '重置将清除本机保存的全部数据（个人资料 + 所有账号密码），且无法恢复。云端备份不会被删除。确定继续吗？',
  )
  if (!confirmed) return
  const doubleCheck = await confirmAction('再次确认：真的要清除所有本地数据吗？')
  if (!doubleCheck) return
  resetting.value = true
  try {
    await clearNativeReminders()
    await resetVaultRepository()
    await Promise.allSettled([deleteAllBlobs(), deleteAllImgs(), biometricClear()])
    localStorage.clear()
    sessionStorage.clear()
    location.reload()
  } catch (e) {
    fail(e instanceof Error ? e.message : '重置失败，请重试')
    resetting.value = false
  }
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-sm text-t1 placeholder:text-t4 outline-none transition focus:border-primary/60 focus:bg-surface-2 focus:ring-2 focus:ring-primary/25'
</script>

<template>
  <div class="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-body p-4">
    <div
      class="relative max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-xl border border-line bg-surface p-8 shadow-2xl shadow-black/50"
      :class="{ shake }"
    >
      <div class="flex flex-col items-center text-center">
        <div
          class="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-ink"
        >
          <ShieldCheck v-if="mode === 'setup'" class="h-7 w-7" />
          <LockKeyhole v-else class="h-7 w-7" />
        </div>
        <h1 class="mt-4 text-lg font-semibold">
          {{ mode === 'setup' ? '创建主密码' : '已锁定' }}
        </h1>
        <p class="mt-1.5 text-xs leading-relaxed text-t4">
          {{
            mode === 'setup'
              ? '主密码将用于加密你的全部数据，每次进入需要解锁'
              : '输入主密码解锁，解密你的个人信息台'
          }}
        </p>
      </div>

      <form class="mt-6 space-y-3.5" @submit.prevent="submit">
        <div class="relative">
          <input
            v-model="password"
            :type="showPw ? 'text' : 'password'"
            :class="inputCls"
            class="pr-11"
            :placeholder="mode === 'setup' ? '创建主密码' : '主密码'"
            autofocus
          />
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-t4 transition hover:text-t2"
            :aria-label="showPw ? '隐藏主密码' : '显示主密码'"
            :aria-pressed="showPw"
            @click="showPw = !showPw"
          >
            <EyeOff v-if="showPw" class="h-4 w-4" />
            <Eye v-else class="h-4 w-4" />
          </button>
        </div>

        <input
          v-if="mode === 'setup'"
          v-model="confirmPassword"
          type="password"
          :class="inputCls"
          placeholder="再次输入主密码"
        />

        <input
          v-if="mode === 'setup'"
          v-model="hint"
          :class="inputCls"
          placeholder="密码提示（选填，别人看不到含义）"
        />

        <p v-if="error" class="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
          {{ error }}
        </p>

        <button
          v-if="mode === 'locked' && lockHint && !showHint"
          type="button"
          class="cursor-pointer text-center text-xs text-t4 transition hover:text-t3"
          @click="showHint = true"
        >
          查看密码提示
        </button>
        <p v-if="mode === 'locked' && lockHint && showHint" class="text-center text-xs text-warn/80">
          提示：{{ lockHint }}
        </p>

        <button
          type="submit"
          :disabled="busy"
          class="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-primary-strong disabled:opacity-50"
        >
          {{ busy ? mode === 'setup' ? '正在加密初始化…' : '正在解密…' : mode === 'setup' ? '创建并进入' : '解锁' }}
        </button>
        <button
          v-if="mode === 'locked' && canBiometric"
          type="button"
          :disabled="busy"
          class="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface py-3 text-sm font-medium text-t2 transition hover:border-primary/50 hover:text-t1 disabled:opacity-50"
          @click="unlockWithBiometric"
        >
          <Fingerprint class="h-5 w-5 text-primary" />
          指纹解锁
        </button>
      </form>
      <DeviceJoin v-if="lockMode === 'fresh'" :disabled="busy" @busy="busy = $event" />

      <p v-if="mode === 'setup'" class="mt-5 text-center text-[11px] leading-relaxed text-t4">
        主密码忘记后数据将永久无法解密找回，请务必牢记。<br />
        数据使用 Argon2id + AES-256-GCM 加密后保存在本机。
      </p>
      <button
        v-else
        :disabled="resetting"
        class="mx-auto mt-5 block text-center text-xs text-t4 transition hover:text-danger"
        @click="resetAll"
      >
        {{ resetting ? '正在清除本机数据…' : '忘记密码？重置并清除本机全部数据' }}
      </button>
    </div>
  </div>
</template>
