<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import AppDatePicker from '@/components/AppDatePicker.vue'
import AppSelect from '@/components/AppSelect.vue'
import ModalShell from '@/components/ModalShell.vue'
import { addLongPlan, updateLongPlan } from '@/stores/planning'
import { toast } from '@/lib/toast'
import type { LongPlan, LongPlanHorizon, LongPlanStatus } from '@/types'

const props = defineProps<{
  open: boolean
  entry: LongPlan | null
}>()

const emit = defineEmits<{
  close: []
}>()

const form = reactive({
  title: '',
  description: '',
  area: '',
  horizon: 'quarter' as LongPlanHorizon,
  targetDate: '',
  nextStep: '',
  status: 'active' as LongPlanStatus,
})
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    if (props.entry) {
      Object.assign(form, {
        title: props.entry.title,
        description: props.entry.description,
        area: props.entry.area,
        horizon: props.entry.horizon,
        targetDate: props.entry.targetDate,
        nextStep: props.entry.nextStep,
        status: props.entry.status,
      })
      return
    }
    Object.assign(form, {
      title: '',
      description: '',
      area: '',
      horizon: 'quarter' as LongPlanHorizon,
      targetDate: '',
      nextStep: '',
      status: 'active' as LongPlanStatus,
    })
  },
  { immediate: true },
)

function save(): void {
  const title = form.title.trim()
  if (!title) {
    error.value = '请填写目标名称'
    return
  }
  const draft = {
    title,
    description: form.description.trim(),
    area: form.area.trim(),
    horizon: form.horizon,
    targetDate: form.targetDate,
    nextStep: form.nextStep.trim(),
    status: form.status,
  }
  if (props.entry) {
    updateLongPlan(props.entry.id, draft)
    toast('长期目标已更新')
  } else {
    addLongPlan(draft)
    toast('长期目标已保存，可继续关联周计划')
  }
  emit('close')
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-t1 placeholder:text-t4 outline-none transition focus:border-primary/60 focus:bg-surface-2 focus:ring-2 focus:ring-primary/25'
</script>

<template>
  <ModalShell :open="open" max-width="max-w-xl" @close="emit('close')">
    <div class="flex items-center justify-between gap-4">
      <div>
        <p class="text-xs font-medium text-primary">长期目标</p>
        <h3 class="mt-1 text-lg font-semibold text-t1">{{ entry ? '编辑长期目标' : '创建长期目标' }}</h3>
      </div>
      <button aria-label="关闭" class="ui-icon-button" @click="emit('close')">
        <X class="h-5 w-5" />
      </button>
    </div>

    <p class="mt-3 text-xs leading-relaxed text-t3">写下希望达成的目标和下一步。日期与完成节奏由你决定，之后可关联周计划。</p>

    <div class="mt-5 space-y-4">
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">目标名称 *</span>
        <input v-model="form.title" :class="inputCls" placeholder="例如：建立稳定的作品输出节奏" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">目标说明</span>
        <textarea v-model="form.description" rows="2" :class="inputCls" placeholder="一句话也可以（选填）"></textarea>
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-t3">领域</span>
          <input v-model="form.area" :class="inputCls" placeholder="成长、生活、关系…" />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-t3">时间范围</span>
          <AppSelect
            v-model="form.horizon"
            :options="[{ value: 'month', label: '这个月' }, { value: 'quarter', label: '这个季度' }, { value: 'year', label: '这一年' }, { value: 'custom', label: '不限定时间' }]"
          />
        </label>
      </div>
      <label class="block">
        <span class="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-t3">
          可选目标日期
          <button v-if="form.targetDate" type="button" class="font-normal text-primary hover:text-primary-strong" @click.prevent="form.targetDate = ''">不设日期</button>
        </span>
        <AppDatePicker v-model="form.targetDate" aria-label="选择长期目标日期" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">下一步</span>
        <input v-model="form.nextStep" :class="inputCls" placeholder="例如：本周挑选 3 个作品整理" />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-xs font-medium text-t3">目标状态</span>
        <AppSelect
          v-model="form.status"
          :options="[{ value: 'active', label: '进行中' }, { value: 'paused', label: '已暂停' }, { value: 'wish', label: '愿望清单' }, { value: 'completed', label: '已完成' }]"
        />
      </label>
      <p v-if="error" class="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">{{ error }}</p>
    </div>

    <div class="mt-6 flex justify-end gap-3">
      <button class="ui-ghost-button" @click="emit('close')">取消</button>
      <button class="ui-primary-button" @click="save">{{ entry ? '保存修改' : '创建目标' }}</button>
    </div>
  </ModalShell>
</template>
