<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { dayCapacity, dayLoad, planner, setDayCapacity } from '@/stores/planning'
import { toast } from '@/lib/toast'
const props = defineProps<{ date: string }>()
const minutes = ref<number | ''>('')
const capacity = computed(() => dayCapacity(props.date))
const load = computed(() => dayLoad(props.date))
watch(() => [props.date, planner.value.dayCapacities], () => { minutes.value = planner.value.dayCapacities?.find(day => day.date === props.date)?.minutes ?? '' }, { immediate: true, deep: true })
function save() {
  try { setDayCapacity(props.date, minutes.value === '' ? undefined : Number(minutes.value)); toast('可用时间已更新') }
  catch (error) { toast(error instanceof Error ? error.message : '保存失败', 'error') }
}
</script>

<template>
  <section class="mt-4 space-y-3 rounded-xl border border-line bg-surface p-4">
    <div class="flex flex-wrap items-center justify-between gap-2"><p class="text-sm font-medium text-t1">{{ date }} · 时间留白</p><p class="text-xs tabular-nums" :class="load > capacity ? 'text-warn' : 'text-t3'">待办预计 {{ load }} / 可用 {{ capacity }} 分钟</p></div>
    <p v-if="load > capacity" class="text-xs text-warn">比可用时间多 {{ load - capacity }} 分钟，可以减少安排或调整可用时间。</p>
    <form class="flex flex-wrap items-end gap-2" @submit.prevent="save"><label class="min-w-0 flex-1 text-xs text-t3">当天可用分钟数<input v-model.number="minutes" type="number" min="0" max="1440" step="1" class="control-input mt-1 w-full px-3" placeholder="留空：跟随每日精力" /></label><button class="ui-secondary-button min-h-11">保存时间</button></form>
    <p class="text-xs leading-relaxed text-t4">温和 60、平稳 180、有余力 300 分钟。留白日为 0；未填时长的任务按 30 分钟估算。调整不会移动已有任务。</p>
  </section>
</template>
