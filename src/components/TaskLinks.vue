<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EntityLink } from '@/types'
import { memos } from '@/stores/memos'
import { docMetas } from '@/stores/docs'
import { repos } from '@/stores/repos'
import { hubLabels } from '@/lib/hubSearch'

const model = defineModel<EntityLink[]>({ required: true })
const emit = defineEmits<{ open: [link: EntityLink] }>()
const query = ref('')
const candidates = computed(() => [
  ...memos.value.map(x => ({ kind: 'memos' as const, id: x.id, title: x.title || x.content.slice(0, 40) || '未命名备忘录' })),
  ...docMetas.value.map(x => ({ kind: 'docMetas' as const, id: x.id, title: x.name })),
  ...repos.value.map(x => ({ kind: 'repos' as const, id: x.id, title: x.fullName })),
])
const matches = computed(() => query.value.trim() ? candidates.value.filter(x => x.title.toLowerCase().includes(query.value.trim().toLowerCase()) && !model.value.some(link => link.kind === x.kind && link.id === x.id)).slice(0, 8) : [])
function title(link: EntityLink): string { return candidates.value.find(x => x.kind === link.kind && x.id === link.id)?.title ?? '原条目已删除或尚未同步' }
</script>

<template>
  <section class="space-y-2 rounded-xl border border-line p-3">
    <label class="block text-xs font-medium text-t3">关联备忘录、资料或仓库
      <input v-model="query" class="control-input mt-2 w-full px-3" placeholder="输入名称查找关联条目" />
    </label>
    <div v-if="matches.length" class="space-y-1">
      <button v-for="item in matches" :key="`${item.kind}:${item.id}`" type="button" class="min-h-11 w-full rounded-lg px-2 text-left text-xs text-t2 hover:bg-surface-2" @click="model = [...model, { kind: item.kind, id: item.id }]; query = ''">添加 · {{ hubLabels[item.kind] }} · {{ item.title }}</button>
    </div>
    <div v-for="link in model" :key="`${link.kind}:${link.id}`" class="flex items-center gap-2">
      <button type="button" :disabled="!candidates.some(x => x.kind === link.kind && x.id === link.id)" class="min-h-11 min-w-0 flex-1 truncate text-left text-xs text-primary hover:underline disabled:text-t4" @click="emit('open', link)">{{ hubLabels[link.kind] }} · {{ title(link) }}</button>
      <button type="button" class="min-h-11 shrink-0 px-2 text-xs text-t3 hover:text-danger" @click="model = model.filter(x => x.kind !== link.kind || x.id !== link.id)">解除关联</button>
    </div>
    <p class="text-xs text-t4">保存引用，不复制正文。打开关联条目前请先保存任务修改。</p>
  </section>
</template>
