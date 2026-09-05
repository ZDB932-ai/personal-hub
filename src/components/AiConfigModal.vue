<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import ModalShell from '@/components/ModalShell.vue'
import AppSelect from '@/components/AppSelect.vue'
import { Cable } from '@lucide/vue'
import {
  activeProfile,
  activeProfileId,
  aiProfiles,
  deleteProfile,
  hydrateAiSecrets,
  setActiveProfile,
  upsertProfile,
  type AiAgentKind,
  type AiChannel,
} from '@/lib/aiopencode'
import { aiApi } from '@/lib/aiopencode'
import { toast } from '@/lib/toast'
import { uid } from '@/lib/utils'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const form = reactive({
  name: '',
  channel: 'lan' as AiChannel,
  agentKind: 'opencode' as AiAgentKind,
  baseUrl: '',
  username: 'opencode',
  password: '',
  bridgeUrl: '',
  bridgeToken: '',
  piProjectId: '',
})
const testing = ref(false)
const error = ref('')
const origin = window.location.origin

const canDelete = computed(() => aiProfiles.value.length > 1)

watch(
  () => props.open,
  async (open) => {
    if (open) {
      try {
        await hydrateAiSecrets()
        loadForm()
      } catch (e) {
        error.value = e instanceof Error ? e.message : 'AI 凭据读取失败'
      }
    }
  },
  { immediate: true },
)

function loadForm(): void {
  const p = activeProfile.value
  Object.assign(form, {
    name: p.name,
    channel: p.channel,
    agentKind: p.agentKind,
    baseUrl: p.baseUrl,
    username: p.username,
    password: p.password,
    bridgeUrl: p.bridgeUrl,
    bridgeToken: p.bridgeToken,
    piProjectId: p.piProjectId,
  })
  error.value = ''
  testing.value = false
}

async function saveCurrent(): Promise<boolean> {
  if (!form.name.trim()) {
    error.value = '请填写配置名称'
    return false
  }
  if (form.channel === 'lan') {
    if (form.agentKind === 'opencode' && !form.baseUrl.trim()) {
      error.value = '局域网模式需要填写 opencode 服务地址'
      return false
    }
    if (form.agentKind !== 'opencode' && !form.bridgeUrl.trim()) {
      error.value = '局域网模式需要填写 bridge 地址'
      return false
    }
  }
  await upsertProfile({
    id: activeProfileId.value,
    name: form.name.trim(),
    channel: form.channel,
    agentKind: form.agentKind,
    bridgeUrl: form.bridgeUrl.trim().replace(/\/+$/, ''),
    bridgeToken: form.bridgeToken.trim(),
    piProjectId: form.piProjectId,
    baseUrl: form.baseUrl.trim().replace(/\/+$/, ''),
    username: form.username.trim() || 'opencode',
    password: form.password,
  })
  return true
}

async function handleSave(): Promise<void> {
  error.value = ''
  if (await saveCurrent()) toast('配置已保存')
}

async function saveAsNew(): Promise<void> {
  error.value = ''
  const id = uid()
  await upsertProfile({
    id,
    name: form.name.trim() || '新配置',
    channel: form.channel,
    agentKind: form.agentKind,
    bridgeUrl: form.bridgeUrl.trim().replace(/\/+$/, ''),
    bridgeToken: form.bridgeToken.trim(),
    piProjectId: form.piProjectId,
    baseUrl: form.baseUrl.trim().replace(/\/+$/, ''),
    username: form.username.trim() || 'opencode',
    password: form.password,
  })
  loadForm()
  toast('已另存为新配置并切换')
}

async function handleDelete(): Promise<void> {
  if (!canDelete.value) return
  if (!window.confirm(`确定删除配置「${activeProfile.value.name}」吗？`)) return
  await deleteProfile(activeProfileId.value)
  loadForm()
  toast('配置已删除')
}

async function handleTest(): Promise<void> {
  error.value = ''
  if (!(await saveCurrent())) return
  testing.value = true
  try {
    const info = await aiApi().ping()
    toast(`连接成功 · ${info}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '连接失败'
  } finally {
    testing.value = false
  }
}

function switchTo(id: string): void {
  if (id === activeProfileId.value) return
  setActiveProfile(id)
  loadForm()
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-t1 placeholder:text-t4 outline-none transition-colors duration-150 focus:border-primary/60'
</script>

<template>
  <ModalShell :open="open" max-width="max-w-lg" @close="emit('close')">
    <div class="flex items-center justify-between">
      <h3 class="flex items-center gap-2 text-lg font-semibold">
        <Cable class="h-5 w-5 text-primary" />
        连接配置
      </h3>
      <button
        aria-label="关闭"
        class="rounded-lg p-1.5 text-t4 transition-colors duration-150 hover:bg-surface-2 hover:text-t2"
        @click="emit('close')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
          <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div class="mt-4 space-y-3.5">
      <div class="rounded-xl border border-line bg-inset p-2.5">
        <p class="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-t4">配置档案（点击切换）</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="p in aiProfiles"
            :key="p.id"
            class="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-150"
            :class="
              p.id === activeProfileId
                ? 'border-primary/50 bg-primary/12 text-primary'
                : 'border-line bg-surface text-t3 hover:border-primary/40 hover:text-t2'
            "
            @click="switchTo(p.id)"
          >
            {{ p.name }}
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="p.channel === 'relay' ? 'bg-info' : 'bg-primary/60'"
              :title="p.channel === 'relay' ? '云中继' : '局域网直连'"
            ></span>
          </button>
        </div>
      </div>

      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">配置名称（如：家里局域网 / Tailscale / 云中继）</span>
        <input v-model="form.name" :class="inputCls" placeholder="配置名称" />
      </label>

      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">连接通道</span>
        <AppSelect
          v-model="form.channel"
          :options="[
            { value: 'lan', label: '局域网 / Tailscale 直连' },
            { value: 'relay', label: '云中继（PocketBase）' },
          ]"
        />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">Agent 类型</span>
        <AppSelect
          v-model="form.agentKind"
          :options="[
            { value: 'opencode', label: 'opencode' },
            { value: 'pi', label: 'pi' },
            { value: 'codex', label: 'Codex CLI' },
            { value: 'dsh', label: 'DeepSeek Harness' },
            { value: 'zcode', label: 'zcode' },
          ]"
        />
      </label>

      <div
        v-if="form.agentKind === 'pi' && form.channel === 'lan'"
        class="rounded-xl border border-line bg-inset p-3.5"
      >
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-t3">Bridge 地址（bridge --http 端口）</span>
          <input v-model="form.bridgeUrl" :class="inputCls" class="font-mono text-xs" placeholder="http://192.168.1.100:8811" />
        </label>
        <label class="mt-2.5 block">
          <span class="mb-1.5 block text-xs font-medium text-t3">Bridge Token（--http-token，只填值本身）</span>
          <input v-model="form.bridgeToken" type="password" :class="inputCls" placeholder="必须与启动 bridge 时的 Token 一致" />
        </label>
        <p class="mt-2 text-[10px] leading-relaxed text-t4">启动 bridge 后，在 AI 工作台添加项目目录；每个项目保持独立 pi 上下文。</p>
      </div>

      <div
        v-if="['codex', 'dsh', 'zcode'].includes(form.agentKind)"
        class="rounded-xl border border-line bg-inset p-3.5 text-[11px] leading-relaxed text-t4"
      >
        <p>
          {{
            form.agentKind === 'codex'
              ? 'Codex 走 exec 非交互模式（默认只读沙盒）；需要写文件请在 codex 配置中调整沙盒与审批设置。'
              : form.agentKind === 'dsh'
                ? 'DeepSeek Harness 走 headless profile（工作区内可写）。'
                : 'zcode 走 -p 单发模式（bare 调用默认 yolo，注意安全）。'
          }}
        </p>
        <p class="mt-1.5">
          bridge 启动需带
          <code class="font-mono">--agent {{ form.agentKind }}</code>
          <template v-if="form.channel === 'lan'">
            ，以及 <code class="font-mono">--http 8811 --http-token xxx</code>，并在下方填写 Bridge 地址与 Token。
          </template>
        </p>
      </div>

      <div
        v-if="['codex', 'dsh', 'zcode'].includes(form.agentKind) && form.channel === 'lan'"
        class="space-y-3"
      >
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-t3">Bridge 地址（bridge --http 端口）</span>
          <input v-model="form.bridgeUrl" :class="inputCls" class="font-mono text-xs" placeholder="http://192.168.1.100:8811" />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-t3">Bridge Token（--http-token，只填值本身）</span>
          <input v-model="form.bridgeToken" type="password" :class="inputCls" placeholder="必须与启动 bridge 时的 Token 一致" />
        </label>
      </div>

      <label v-if="form.channel === 'lan' && form.agentKind === 'opencode'" class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">服务地址（opencode serve）</span>
        <input v-model="form.baseUrl" :class="inputCls" class="font-mono text-xs" placeholder="http://192.168.1.100:4096" />
      </label>
      <div v-else-if="form.channel === 'relay'" class="rounded-lg border border-line bg-inset p-3 text-[11px] leading-relaxed text-t4">
        通过 PocketBase 中转，外网可用。需已配置同步、PB 建好
        <code class="font-mono">hub_ai_dev</code> / <code class="font-mono">hub_ai_cmd</code> 集合，并运行
        <code class="font-mono">bridge/phub-bridge.mjs</code>。
      </div>

      <div v-if="form.channel === 'lan' && form.agentKind === 'opencode'" class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-t3">用户名</span>
          <input v-model="form.username" :class="inputCls" placeholder="opencode" />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-t3">密码（未设置可留空）</span>
          <input v-model="form.password" type="password" :class="inputCls" placeholder="OPENCODE_SERVER_PASSWORD" />
        </label>
      </div>

      <p v-if="error" class="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
        {{ error }}
      </p>

      <div class="flex gap-2">
        <button
          :disabled="testing || form.channel === 'relay'"
          class="flex-1 rounded-lg border border-line py-2.5 text-sm font-medium text-t2 transition-colors duration-150 hover:bg-surface-2 disabled:opacity-40"
          @click="handleTest"
        >
          {{ testing ? '测试中…' : '测试连接' }}
        </button>
        <button
          class="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-primary-strong"
          @click="handleSave"
        >
          保存修改
        </button>
      </div>
      <div class="flex gap-2">
        <button
          class="flex-1 rounded-lg border border-dashed border-line py-2 text-xs text-t3 transition-colors duration-150 hover:border-primary/40 hover:text-t2"
          @click="saveAsNew"
        >
          另存为新配置
        </button>
        <button
          :disabled="!canDelete"
          class="flex-1 rounded-lg border border-danger/25 py-2 text-xs text-danger transition-colors duration-150 hover:bg-danger/10 disabled:opacity-40"
          @click="handleDelete"
        >
          删除此配置
        </button>
      </div>

      <div class="rounded-lg bg-inset px-3 py-2 text-[10px] leading-relaxed text-t4">
        诊断：应用源 <b class="font-mono">{{ origin }}</b>
        <span v-if="origin.startsWith('http://')" class="text-ok">（新包 ✓）</span>
        <span v-else class="text-warn">（旧包！完整卸载后安装最新 APK）</span>
      </div>
    </div>
  </ModalShell>
</template>
