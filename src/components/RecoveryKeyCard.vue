<script setup lang="ts">
import { ref } from 'vue'
import { saveFile } from '@/lib/saveFile'
const props = defineProps<{ code: string; busy: boolean }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const confirmed = ref(false)
const check = ref('')
const message = ref('')
async function download() {
  message.value = ''
  try {
    const code = props.code
    const saved = await saveFile(new Blob([`Personal Hub 本机恢复密钥\n\n${code}\n\n请单独保管。此密钥配合当前设备的恢复信息可以重设密码。它不是数据备份，不随同步或普通备份转移。重新生成后，旧密钥对当前设备失效；历史副本仍可能有效。\n`], { type: 'text/plain;charset=utf-8' }), 'personal-hub-recovery.txt', () => props.code === code)
    message.value = saved ? '恢复密钥文件已保存，请单独妥善保管' : '已取消保存'
  } catch (e) { message.value = e instanceof Error ? e.message : '保存失败，请手动记录密钥' }
}
</script>
<template>
  <section class="space-y-4" aria-label="保存恢复密钥">
    <div><h2 class="text-lg font-semibold text-t1">保存你的恢复密钥</h2><p class="mt-2 text-sm leading-relaxed text-t3">忘记密码时，用它重设密码并保留本机数据。请保存在应用之外，拥有它的人也可以恢复访问。</p></div>
    <label class="block text-sm text-t2">恢复密钥<textarea :value="code" readonly rows="4" class="mt-2 w-full resize-none rounded-lg border border-line bg-inset p-3 font-mono text-sm leading-relaxed text-t1" /></label>
    <button type="button" class="ui-secondary-button w-full" :disabled="busy" @click="download">保存恢复密钥文件</button>
    <p class="text-xs leading-relaxed text-t3">仅适用于当前设备。它不能找回已删除的数据，请另外保留数据备份。</p>
    <label class="block text-sm text-t2">确认密钥最后 8 位<input v-model="check" maxlength="8" autocomplete="off" class="control-input mt-2 px-3 font-mono" /></label>
    <label class="flex items-start gap-3 text-sm text-t2"><input v-model="confirmed" type="checkbox" class="mt-1" />我已在应用之外保存完整密钥</label>
    <p v-if="message" role="status" class="text-xs text-t3">{{ message }}</p>
    <button type="button" class="ui-primary-button w-full" :disabled="busy || !confirmed || check.toUpperCase() !== code.slice(-8)" @click="emit('confirm')">{{ busy ? '正在保存…' : '确认保存并启用' }}</button>
    <button type="button" class="ui-ghost-button w-full" :disabled="busy" @click="emit('cancel')">返回</button>
  </section>
</template>
