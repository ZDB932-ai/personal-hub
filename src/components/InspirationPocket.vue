<script setup lang="ts">
import { computed, ref } from 'vue'
import { Inbox, ArrowUpRight, Check } from '@lucide/vue'
import { collectPocketDraft, promoteSpark } from '@/stores/attention'
import { memos, updateMemo } from '@/stores/memos'
import { openHubItem } from '@/stores/hub'
import { persistNow } from '@/stores/database'
import IdeaNursery from './IdeaNursery.vue'
import MemoOrigin from './MemoOrigin.vue'
import { toast } from '@/lib/toast'
const props = defineProps<{ taskId?: string; review?: boolean }>()
const draft = defineModel<string>('draft', { default: '' })
const saved = ref(false), saving = ref(false), error = ref('')
const inbox = computed(() => memos.value.filter(memo => memo.captureStatus === 'inbox' || memo.captureStatus === 'draft').sort((a, b) => b.createdAt - a.createdAt))
async function capture(): Promise<void> {
  if (saving.value) return
  saving.value = true; error.value = ''; saved.value = false
  try { saved.value = await collectPocketDraft(props.taskId, persistNow) }
  catch { error.value = '尚未保存，文字已保留，请重试。' }
  finally { saving.value = false }
}
function promote(id: string): void { if (promoteSpark(id)) toast('已放入待安排，原便签保留') }
</script>
<template>
  <section class="attention-pocket" :class="{ 'is-review': review }" aria-label="收集箱">
    <h2 v-if="!review" class="flex items-center gap-2 text-base font-medium text-t1"><Inbox class="h-5 w-5 text-primary" />收集箱 <span class="ml-auto text-xs text-t3">{{ inbox.length }} 条待整理</span></h2>
    <p v-if="!review" class="mt-3 text-sm leading-6 text-t3">想到别的事情，先放在这里。此刻不用展开。</p>
    <form class="pocket-capture" :class="review ? '' : 'mt-4'" @submit.prevent="capture"><label class="text-xs text-t3" for="spark-input">记下一句话</label><textarea id="spark-input" v-model="draft" :disabled="saving" maxlength="2000" rows="3" class="control-input mt-2 resize-y px-3 py-2" placeholder="想法、链接，或者之后想查的事…" @input="saved = false"></textarea><button class="ui-secondary-button mt-3 w-full" :disabled="saving || !draft.trim()">{{ saving ? '正在保存…' : '保存到收集箱' }}</button><p v-if="saved" role="status" class="mt-3 flex items-center gap-2 text-xs text-ok"><Check class="h-4 w-4" />已保存到收集箱。</p><p v-if="error" role="alert" class="mt-3 text-xs text-danger">{{ error }}</p></form>
    <template v-if="review"><div class="pocket-inbox-heading"><h2 class="text-base font-medium text-t1">待整理</h2><span class="text-xs text-t3">{{ inbox.length }} 条</span></div><div v-for="memo in inbox" :key="memo.id" class="mt-5 border-t border-line pt-4"><button class="min-h-11 w-full break-words text-left text-sm font-medium text-t1 hover:text-primary" @click="openHubItem('memos', memo.id)">{{ memo.title }}</button><p v-if="memo.captureStatus === 'draft'" class="text-xs text-primary">草稿 · 点击标题继续编辑</p><MemoOrigin :memo="memo" /><p class="line-clamp-3 whitespace-pre-wrap break-words text-xs leading-6 text-t3">{{ memo.content }}</p><div class="mt-2 flex flex-wrap gap-3"><button v-if="memo.captureStatus !== 'draft'" class="min-h-11 text-xs text-primary" @click="promote(memo.id)">转为待办任务</button><button class="min-h-11 text-xs text-t3" @click="updateMemo(memo.id, { captureStatus: 'kept' })">留作便签</button><button v-if="memo.captureStatus !== 'draft'" class="min-h-11 text-xs text-primary" @click="updateMemo(memo.id, { ideaStage: 'resting', captureStatus: 'kept' })">加入灵感库</button></div></div><p v-if="!inbox.length" class="mt-5 text-xs leading-6 text-t3">收集箱已整理完毕。整理过的内容仍保留在备忘录。</p></template>
    <p v-if="!review" class="mt-3 text-xs leading-6 text-t3">草稿自动加密保存；完成或暂停任务时，会移入收集箱。</p>
    <RouterLink v-if="!review" to="/collect" class="mt-4 flex min-h-11 items-center gap-1 text-xs text-primary">结束后再整理<ArrowUpRight class="h-3 w-3" /></RouterLink>
    <IdeaNursery v-if="review" />
  </section>
</template>
