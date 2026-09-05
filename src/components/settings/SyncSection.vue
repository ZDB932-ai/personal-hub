<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Cloud, CloudOff, RefreshCw } from '@lucide/vue'
import {
  connectSync,
  disconnectSync,
  isSyncConfigured,
  setAutoSync,
  syncConfig,
  syncMeta,
  syncing,
  syncNow,
} from '@/lib/sync'
import { toast } from '@/lib/toast'
import PasswordInput from '@/components/PasswordInput.vue'

const props = defineProps<{
  open: boolean
}>()

const form = reactive({
  serverUrl: '',
  email: '',
  password: '',
  autoSync: true,
})
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (open) {
      Object.assign(form, { serverUrl: '', email: '', password: '', autoSync: true })
      error.value = ''
    }
  },
  { immediate: true },
)

async function submitConnect(): Promise<void> {
  error.value = ''
  if (!form.serverUrl.trim() || !form.email.trim()) {
    error.value = '请填写服务器地址和邮箱'
    return
  }
  try {
    await connectSync(form.serverUrl, form.email, form.password, form.autoSync)
    toast('云同步已开启')
    Object.assign(form, { serverUrl: '', email: '', password: '' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '连接失败，请稍后重试'
  }
}

async function handleDisconnect(): Promise<void> {
  if (!window.confirm('断开后将停止云同步（云端已有备份会保留）。确定断开吗？')) return
  await disconnectSync()
  toast('已断开云同步')
}

const lastSyncText = computed(() =>
  syncMeta.value.lastSyncAt
    ? new Date(syncMeta.value.lastSyncAt).toLocaleString('zh-CN')
    : '从未同步',
)

</script>

<template>
  <div>
    <template v-if="!isSyncConfigured">
      <div class="space-y-3 rounded-xl border border-line bg-surface p-4">
        <p class="text-sm font-medium">连接 PocketBase 服务器</p>
        <input v-model="form.serverUrl" class="control-input px-3" placeholder="服务器地址，如 pb.example.com" />
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input v-model="form.email" class="control-input px-3" placeholder="同步账号邮箱" />
          <PasswordInput v-model="form.password" placeholder="同步密码（≥8位）" />
        </div>
        <label class="flex cursor-pointer items-center gap-2 text-xs text-t3">
          <input v-model="form.autoSync" type="checkbox" class="accent-primary" />
          自动同步：修改后约 5 秒推送，进入应用时拉取
        </label>
        <p v-if="error" class="text-xs text-danger">{{ error }}</p>
        <button
          :disabled="!form.serverUrl || !form.email || !form.password || syncing"
          class="ui-primary-button w-full gap-2 disabled:cursor-not-allowed disabled:opacity-40"
          @click="submitConnect"
        >
          <Cloud class="h-4 w-4" />
          {{ syncing ? '正在连接…' : '连接并开启同步' }}
        </button>
        <details class="group">
          <summary class="cursor-pointer list-none text-xs text-primary hover:text-primary">
            如何部署 PocketBase？展开说明
          </summary>
          <ol class="mt-2 list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-t4">
            <li>从 pocketbase.io 下载单文件程序，在服务器运行 <code class="rounded bg-inset px-1">./pocketbase serve</code></li>
            <li>打开 <code class="rounded bg-inset px-1">http://服务器IP:8090/_/</code> 创建管理员</li>
            <li>新建集合 <code class="rounded bg-inset px-1">vaults</code>：字段 user(关联 users)、data(JSON)</li>
            <li>API Rules 全部四项均填：<code class="rounded bg-inset px-1">@request.auth.id != "" && user = @request.auth.id</code></li>
            <li>users 集合保持默认开启注册即可；建议给域名配置 HTTPS</li>
          </ol>
        </details>
      </div>
    </template>

    <template v-else>
      <div class="space-y-3 rounded-xl border border-line bg-surface p-4">
        <div class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div class="min-w-0">
            <p class="text-xs text-t4">服务器</p>
            <p class="truncate">{{ syncConfig?.serverUrl }}</p>
          </div>
          <div class="min-w-0">
            <p class="text-xs text-t4">账号</p>
            <p class="truncate">{{ syncConfig?.email }}</p>
          </div>
          <div>
            <p class="text-xs text-t4">上次同步</p>
            <p>{{ lastSyncText }}</p>
          </div>
          <div>
            <p class="text-xs text-t4">状态</p>
            <p :class="syncing ? 'text-primary' : syncMeta.lastError ? 'text-danger' : 'text-ok'">
              {{ syncing ? '同步中…' : syncMeta.lastError ? syncMeta.lastError : '正常' }}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 pt-1">
          <button
            :disabled="syncing"
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/12 py-2 text-xs font-medium text-primary transition hover:bg-primary/20 disabled:opacity-40"
            @click="void syncNow()"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': syncing }" />
            立即同步
          </button>
          <button
            class="flex-1 rounded-lg border border-line py-2 text-xs font-medium transition hover:bg-surface"
            :class="syncConfig?.autoSync ? 'text-ok' : 'text-t3'"
            @click="void setAutoSync(!syncConfig?.autoSync)"
          >
            {{ syncConfig?.autoSync ? '自动同步：开' : '自动同步：关' }}
          </button>
          <button
            class="flex items-center justify-center gap-1.5 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs font-medium text-danger transition hover:bg-danger/20"
            @click="handleDisconnect"
          >
            <CloudOff class="h-3.5 w-3.5" />
            断开
          </button>
        </div>

        <p class="text-[11px] leading-relaxed text-t4">
          同步范围：资料 / 密码 / 任务 / 备忘录 / 项目收藏 / 资料库文件列表。文件本体不随同步（用备份导出搬运）。
        </p>
      </div>
    </template>
  </div>
</template>
