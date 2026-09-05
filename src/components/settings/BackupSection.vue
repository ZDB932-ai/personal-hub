<script setup lang="ts">
import { ref, watch } from 'vue'
import { applyBackup, exportBackup, NEED_PASSWORD, parseBackup, type BackupFile } from '@/lib/backup'
import { toast } from '@/lib/toast'

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
  busy.value = true
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
  error.value = ''
  try {
    const parsed = await parseBackup(file)
    if (
      !window.confirm(
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
  }
}

async function confirmBackupPassword(): Promise<void> {
  if (!pendingBackup.value) return
  busy.value = true
  error.value = ''
  try {
    await applyBackup(pendingBackup.value, backupPw.value)
    needPw.value = false
    pendingBackup.value = null
    backupPw.value = ''
    toast('备份已恢复（密钥已换绑到当前主密码）')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '恢复失败'
  } finally {
    busy.value = false
  }
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-t1 placeholder:text-t4 outline-none transition focus:border-primary/60 focus:bg-surface-2 focus:ring-2 focus:ring-primary/25'
</script>

<template>
  <div>
    <div class="space-y-3 rounded-xl border border-line bg-surface p-4">
      <p class="text-sm font-medium">加密备份</p>
      <p v-if="error" class="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">{{ error }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <button
          :disabled="busy"
          class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/12 py-2.5 text-xs font-medium text-primary transition hover:bg-primary/20 disabled:opacity-40"
          @click="handleExport"
        >
          导出加密备份
        </button>
        <button
          :disabled="busy"
          class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-2.5 text-xs font-medium text-t2 transition hover:bg-surface disabled:opacity-40"
          @click="triggerImport"
        >
          从备份恢复
        </button>
      </div>
      <label class="flex cursor-pointer items-center gap-2 text-xs text-t3">
        <input v-model="includeDocs" type="checkbox" class="accent-primary" />
        包含资料库文件本体（体积更大，可跨设备搬运文件）
      </label>

      <div v-if="needPw" class="space-y-2 rounded-lg border border-warn/25 bg-warn/10 p-3">
        <p class="text-xs text-warn">该备份使用了不同的主密码，输入备份的主密码完成恢复：</p>
        <input
          v-model="backupPw"
          type="password"
          :class="inputCls"
          placeholder="备份文件的主密码"
          @keydown.enter="confirmBackupPassword"
        />
        <button
          :disabled="!backupPw || busy"
          class="w-full rounded-lg bg-primary py-2 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-primary-strong disabled:opacity-40"
          @click="confirmBackupPassword"
        >
          {{ busy ? '恢复中…' : '确认恢复' }}
        </button>
      </div>

      <p class="text-[11px] leading-relaxed text-t4">
        备份文件本身是加密的，恢复时需要对应的主密码。换新设备：先用相同主密码完成初始化，再导入备份即可。建议养成每月导出一次的习惯。
      </p>
    </div>
  </div>
</template>
