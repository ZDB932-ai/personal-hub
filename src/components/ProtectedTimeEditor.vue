<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Leaf } from '@lucide/vue'
import { planner } from '@/stores/planning'
import { tasks } from '@/stores/tasks'
import { protectTime, releaseTime } from '@/stores/attention'
import { dayBlocks, minuteLabel, timeMinutes } from '@/lib/calendar'
const props = defineProps<{ date: string }>()
const open = ref(false), start = ref('12:00'), end = ref('12:30'), label = ref('散步与休息'), error = ref('')
const items = computed(() => (planner.value.protectedTimes ?? []).filter(item => item.date === props.date).sort((a, b) => a.start - b.start))
const overlaps = computed(() => dayBlocks(tasks.value.filter(task => !task.done), props.date).filter(block => block.start < timeMinutes(end.value) && block.end > timeMinutes(start.value)).length)
watch(() => props.date, () => { error.value = ''; open.value = false })
function save(): void { try { protectTime({ date: props.date, start: timeMinutes(start.value), end: timeMinutes(end.value), label: label.value }); error.value = ''; open.value = false } catch (reason) { error.value = reason instanceof Error ? reason.message : '无法保存留白' } }
</script>
<template>
  <section class="mt-4 border-t border-line pt-3" aria-label="保护留白"><button class="flex min-h-11 w-full items-center gap-2 text-left text-xs text-primary" :aria-expanded="open" @click="open = !open"><Leaf class="h-4 w-4" />保护一段留白<span class="ml-auto text-t3">{{ items.length ? `${items.length} 段` : '不必填满' }}</span></button>
    <form v-if="open" class="space-y-3 py-3" @submit.prevent="save"><label class="block text-xs text-t3">留给什么<input v-model="label" maxlength="80" class="control-input mt-1 px-3" /></label><div class="grid grid-cols-2 gap-2"><label class="min-w-0 text-xs text-t3">留白开始<input v-model="start" type="time" required class="control-input mt-1 px-2" /></label><label class="min-w-0 text-xs text-t3">留白结束<input v-model="end" type="time" required class="control-input mt-1 px-2" /></label></div><p class="text-xs leading-6 text-t3">排期建议会避开这段时间，同时限制 09:00–18:00 可安排时段。已有任务不会自动移动。</p><p v-if="overlaps" class="text-xs text-warn">与 {{ overlaps }} 项已有任务重叠，可以先调整任务，也可保留这段留白。</p><p v-if="error" role="alert" class="text-xs text-danger">{{ error }}</p><button class="ui-secondary-button w-full">保存留白</button></form>
    <div v-for="item in items" :key="item.id" class="mt-2 rounded-lg border border-line bg-surface px-3 py-2"><p class="break-words text-xs text-t2">{{ item.label }} · {{ minuteLabel(item.start) }}–{{ minuteLabel(item.end) }}</p><button class="min-h-11 text-xs text-t3 hover:text-primary" :aria-label="`取消留白 ${item.label}`" @click="releaseTime(item.id)">取消这段留白</button></div>
  </section>
</template>
