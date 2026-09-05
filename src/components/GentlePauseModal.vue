<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { Coffee, Play, X } from '@lucide/vue'
import ModalShell from '@/components/ModalShell.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  settle: []
}>()

const mode = ref<'intro' | 'breathing' | 'done'>('intro')
const seconds = ref(60)
const selectedMinutes = ref(1)
let timer: ReturnType<typeof setInterval> | null = null

const phase = computed(() => {
  const step = (selectedMinutes.value * 60 - seconds.value) % 10
  return step < 4 ? '轻轻吸气' : '慢慢呼气'
})

function stop(): void {
  if (timer) clearInterval(timer)
  timer = null
}

function start(): void {
  stop()
  seconds.value = selectedMinutes.value * 60
  mode.value = 'breathing'
  timer = setInterval(() => {
    seconds.value -= 1
    if (seconds.value <= 0) {
      stop()
      mode.value = 'done'
    }
  }, 1000)
}

function close(): void {
  stop()
  emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      stop()
      mode.value = 'intro'
      seconds.value = 60
      selectedMinutes.value = 1
    }
  },
)

onUnmounted(stop)
</script>

<template>
  <ModalShell :open="open" max-width="max-w-md" @close="close">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <Coffee class="h-4 w-4" />
        </span>
        <div>
          <p class="text-xs font-medium text-primary">缓一缓</p>
          <h3 class="mt-1 text-lg font-semibold text-t1">给自己留一点空间</h3>
        </div>
      </div>
      <button aria-label="关闭" class="ui-icon-button" @click="close">
        <X class="h-5 w-5" />
      </button>
    </div>

    <div v-if="mode === 'intro'" class="mt-6 rounded-lg border border-line bg-inset p-4 text-sm leading-relaxed text-t2">
      <p>如果今天不想再计划，也没关系。</p>
      <p class="mt-2 text-xs text-t3">这里没有要完成的任务。喝口水、看看远处、松一松肩颈，或者什么都不做都可以；不舒服时随时停止。</p>
      <div class="mt-4">
        <p class="text-xs font-medium text-t3">想留多久？</p>
        <div class="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="选择暂停时长">
          <button
            v-for="minutes in [1, 3, 5]"
            :key="minutes"
            type="button"
            class="gentle-energy-option"
            :class="{ 'is-active': selectedMinutes === minutes }"
            :aria-pressed="selectedMinutes === minutes"
            @click="selectedMinutes = minutes"
          >
            {{ minutes }} 分钟
          </button>
        </div>
      </div>
    </div>
    <div v-else-if="mode === 'breathing'" class="mt-6 rounded-lg border border-line bg-inset px-4 py-8 text-center">
      <p class="text-3xl font-semibold tabular-nums text-t1">{{ seconds }}</p>
      <p class="mt-2 text-sm font-medium text-primary">{{ phase }}</p>
      <p class="mt-1 text-xs text-t3">不需要做得标准，舒服就好。</p>
    </div>
    <div v-else class="mt-6 rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm leading-relaxed text-t2">
      <p class="font-medium text-t1">这 {{ selectedMinutes }} 分钟已经足够了。</p>
      <p class="mt-1 text-xs text-t3">接下来做一点、暂时不做，都是可以的。</p>
    </div>

    <div class="mt-6 flex justify-end gap-3">
      <button v-if="mode === 'breathing'" class="ui-secondary-button" @click="close">现在结束</button>
      <button v-else-if="mode === 'done'" class="ui-primary-button" @click="close">回到计划</button>
      <template v-else>
        <button class="ui-secondary-button" @click="emit('settle')">今天先到这里</button>
        <button class="ui-primary-button gap-2" @click="start">
          <Play class="h-4 w-4" />
          跟着自己的节奏呼吸
        </button>
      </template>
    </div>
  </ModalShell>
</template>
