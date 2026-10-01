<script setup lang="ts">
import { ref, useAttrs } from 'vue'
import { Eye, EyeOff } from '@lucide/vue'

defineOptions({ inheritAttrs: false })

defineProps<{
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const attrs = useAttrs()
const show = ref(false)
</script>

<template>
  <div class="relative">
    <input
      v-bind="attrs"
      :type="show ? 'text' : 'password'"
      :value="modelValue"
      :placeholder="placeholder"
      :autocomplete="String(attrs.autocomplete ?? 'off')"
      class="min-h-11 w-full rounded-lg border border-line bg-surface py-2.5 pl-3 pr-11 text-sm text-t1 placeholder:text-t4 outline-none transition-colors duration-150 focus:border-primary/60"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      type="button"
      class="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-t4 transition-colors duration-150 hover:text-t2"
      :title="show ? '隐藏' : '显示'"
      :aria-label="show ? '隐藏密码' : '显示密码'"
      :aria-pressed="show"
      @click="show = !show"
    >
      <EyeOff v-if="show" class="h-4 w-4" />
      <Eye v-else class="h-4 w-4" />
    </button>
  </div>
</template>

<style scoped>
input::-ms-reveal, input::-ms-clear { display: none; }
</style>
