<script setup lang="ts">
import { ref, watch } from 'vue'
import PasswordInput from '@/components/PasswordInput.vue'
import { dataEnvelope } from '@/stores/database'
import { changePassword, isGated, lockHint } from '@/stores/lock'
import { createDeviceTransfer } from '@/lib/deviceTransfer'
import { toast } from '@/lib/toast'
import { saveFile } from '@/lib/saveFile'
import { getActiveKey } from '@/lib/keyring'

const password = ref('')
const code = ref('')
const busy = ref(false)
const error = ref('')

watch(isGated, () => { password.value = ''; code.value = ''; error.value = '' })

async function upgrade(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const result = await changePassword(password.value, password.value, lockHint.value, true)
    if (!result.ok) throw new Error(result.error)
    password.value = ''
    toast('设备独立密码已启用，请导出一份新的备份')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '升级失败，原数据已保留'
  } finally {
    busy.value = false
  }
}

async function exportDevice(): Promise<void> {
  busy.value = true
  error.value = ''
  code.value = ''
  try {
    const key = getActiveKey()
    const result = await createDeviceTransfer(password.value)
    const saved = await saveFile(new Blob([JSON.stringify(result.file)], { type: 'application/json' }), 'personal-hub-device.phub-device', () => getActiveKey() === key && !isGated.value)
    if (!saved || getActiveKey() !== key || isGated.value) return
    code.value = result.code
    password.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : '导出失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="mt-4 space-y-3 rounded-xl border border-line bg-surface p-4">
    <p class="text-sm font-medium text-t1">设备独立密码</p>
    <template v-if="dataEnvelope?.v !== 3">
      <p class="text-xs leading-relaxed text-t2">升级后，各设备可设置自己的主密码，共用同一把数据密钥。现有数据和附件会重新加密一次，请先在「备份」中保留副本。</p>
      <p class="text-xs leading-relaxed text-warn">升级后旧版整库云同步停用，旧客户端无法读取新格式；可在「同步」中连接逐条加密同步服务。</p>
    </template>
    <template v-else>
      <p class="text-xs leading-relaxed text-t2">已启用。修改本机主密码不会改变其他设备的密码，也不会撤销已加入设备的访问。</p>
      <p class="text-xs leading-relaxed text-t3">生成设备文件，在尚未创建保险库的新设备首页选择「加入已有保险库」，输入转移码并设置该设备密码。包含当前数据与附件，不转移云端、GitHub 和 AI 连接凭据。</p>
      <p class="text-xs leading-relaxed text-warn">这是一次离线复制，之后需在各设备连接同一同步服务才能继续同步。设备文件和转移码组合可反复加入，没有自动过期或远程撤销；请分开传递，完成后妥善删除。</p>
      <p class="text-xs leading-relaxed text-t3">附件较多时，建议先在「同步」中暂停同步，待显示“同步已暂停”后生成文件，完成后再恢复同步。</p>
    </template>
    <PasswordInput v-model="password" :disabled="busy" class="py-2.5" placeholder="验证本机主密码" />
    <p v-if="error" role="alert" class="text-xs text-danger">{{ error }}</p>
    <button :disabled="busy || !password" class="rounded-lg bg-primary px-3 py-2 text-sm text-ink disabled:opacity-50" @click="dataEnvelope?.v === 3 ? exportDevice() : upgrade()">
      {{ busy ? '正在处理…' : dataEnvelope?.v === 3 ? '生成设备加入文件' : '升级并启用' }}
    </button>
    <div v-if="code" class="space-y-2 rounded-lg border border-line bg-surface-2 p-3">
      <p class="text-xs text-t2">转移码（关闭此设置页后不再显示）</p>
      <code class="block break-all select-all text-sm text-t1">{{ code }}</code>
    </div>
  </section>
</template>
