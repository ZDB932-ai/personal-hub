<script setup lang="ts">
import { confirmAction } from '@/lib/confirmAction'
import { ref, watch } from 'vue'
import { applyBackup, exportBackup, NEED_PASSWORD, parseBackup, type BackupFile } from '@/lib/backup'
import { toast } from '@/lib/toast'
import PasswordInput from '@/components/PasswordInput.vue'

const props = defineProps<{
  open: boolean
}>()

const includeDocs = ref(true)
const busy = ref(false)
const needPw = ref(false)
const backupPw = ref('')
const pendingBackup = ref<BackupFile | null>(null)
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (open) {
      error.value = ''
      needPw.value = false
      backupPw.value = ''
      pendingBackup.value = null
      busy.value = false
    }
  },
  { immediate: true },
)

async function handleExport(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const msg = await exportBackup(includeDocs.value)
    toast(msg)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '导出失败'
  } finally {
    busy.value = false
  }
}

function triggerImport(): void {
  if (busy.value) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.phub,.json'
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) void handleImportFile(file)
  }
  input.click()
}

async function handleImportFile(file: File): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const parsed = await parseBackup(file)
    if (
      !await confirmAction(
        '导入将完全覆盖当前的全部数据（含资料库文件）。确定继续吗？建议先导出一份当前备份。',
      )
    ) {
      return
    }
    busy.value = true
    try {
      await applyBackup(parsed)
      toast('备份已恢复')
    } catch (e) {
      if (e instanceof Error && e.message === NEED_PASSWORD) {
        pendingBackup.value = parsed
        needPw.value = true
      } else {
        error.value = e instanceof Error ? e.message : '恢复失败'
      }
    } finally {
      busy.value = false
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取备份失败'
  } finally {
    busy.value = false
  }
}

async function confirmBackupPassword(): Promise<void> {
  if (!pendingBackup.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await applyBackup(pendingBackup.value, backupPw.value)
    needPw.value = false
    pendingBackup.value = null
    backupPw.value = ''
    toast('备份已恢复，继续使用当前设备密码解锁')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '恢复失败'
  } finally {
    busy.value = false
  }
}

</script>

<template>
  <div class="settings-stack">
    <section class="settings-card space-y-3">
      <h3 class="settings-section-title">导出加密备份</h3>
      <p class="settings-description">将个人内容保存为一份独立文件，便于长期保留或在其他设备恢复。</p>
      <label class="settings-row min-h-11 cursor-pointer text-sm text-t2"><span class="settings-row-copy"><span class="block font-medium">包含资料库文件</span><span class="settings-description">同时保存附件，文件体积会相应增大。</span></span><input v-model="includeDocs" :disabled="busy" type="checkbox" class="accent-primary" /></label>
      <div class="settings-actions">
        <button
          :disabled="busy"
          class="ui-primary-button disabled:opacity-40"
          @click="handleExport"
        >
          {{ busy && !needPw ? '正在处理…' : '导出备份' }}
        </button>
      </div>
      <p class="settings-description">恢复时需要导出时使用的密码。建议定期备份，并将文件保存在另一台设备或可信存储位置。</p>
    </section>
    <section class="settings-card space-y-3">
      <h3 class="settings-section-title">从备份恢复</h3>
      <p class="settings-description">选择 Personal Hub 备份文件（.phub 或 .json）。恢复后继续使用当前设备的密码解锁。</p>
      <p class="settings-note text-xs leading-relaxed text-warn">恢复将覆盖当前全部数据及资料库文件。请先导出当前内容，以便需要时还原。</p>
      <div class="settings-actions">
        <button
          :disabled="busy"
          class="ui-secondary-button disabled:opacity-40"
          @click="triggerImport"
        >
          选择备份文件
        </button>
      </div>
      <form v-if="needPw" class="settings-subsection space-y-3" @submit.prevent="confirmBackupPassword">
        <p class="text-xs text-warn">该备份使用了不同的主密码，输入备份的主密码完成恢复：</p>
        <div class="settings-field"><label for="settings-backup-password">备份密码</label><PasswordInput
          id="settings-backup-password"
          v-model="backupPw"
          :disabled="busy"
          autocomplete="current-password"
          placeholder="输入导出此备份时的密码"
        /></div>
        <button
          :disabled="!backupPw || busy"
          class="ui-primary-button w-full disabled:opacity-40"
          type="submit"
        >
          {{ busy ? '恢复中…' : '确认恢复' }}
        </button>
      </form>
    </section>
    <p v-if="error" role="alert" class="settings-note text-sm text-danger">{{ error }}</p>
  </div>
</template>
