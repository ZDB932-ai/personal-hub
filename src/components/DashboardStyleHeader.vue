<script setup lang="ts">
import { computed } from 'vue'
import { ArrowUpRight, CalendarDays, Plus, Target } from '@lucide/vue'
import type { InterfaceStyle } from '@/lib/interfaceStyles'

const props = defineProps<{ style: InterfaceStyle; day: string; dateLabel: string; pending: number; completed: number; total: number; load: number; capacity: number }>()
defineEmits<{ create: [] }>()
const percent = computed(() => props.total ? Math.round(props.completed / props.total * 100) : 0)
const dayNumber = computed(() => props.day.slice(-2))
const monthNumber = computed(() => props.day.slice(5, 7))
const freeMinutes = computed(() => Math.max(0, props.capacity - props.load))
</script>

<template>
  <header class="style-dashboard-header" :class="`dashboard-${style}`" :data-dashboard-style="style">
    <template v-if="style === 'swiss'">
      <div class="swiss-masthead"><span>个人日刊 / 今日计划</span><time :datetime="day">{{ dateLabel }}</time><span>{{ day.slice(0, 4) }}</span></div>
      <div class="swiss-headline"><h1>今天<span>的事。</span></h1><div class="swiss-date"><span>本月</span><strong>{{ dayNumber }}</strong><span>日</span></div></div>
      <div class="swiss-caption"><span>今日待办 <b>{{ pending }}</b> 项</span><span>已完成 {{ completed }} / {{ total }}</span><span>预计 {{ load }} 分钟</span></div>
    </template>
    <template v-else-if="style === 'terminal'">
      <div class="terminal-caption"><span>个人工作台 / 今日会话</span><time :datetime="day">{{ day }}</time></div>
      <h1><span aria-hidden="true">›</span> 今日任务控制台<span class="terminal-cursor" aria-hidden="true">_</span></h1>
      <div class="terminal-output"><p><span>待处理</span><b>{{ pending }}</b><span>项任务</span></p><p><span>已完成</span><b>{{ completed }} / {{ total }}</b><span>今日记录</span></p><p><span>预计用时</span><b>{{ load }} / {{ capacity }}</b><span>分钟</span></p></div>
    </template>
    <template v-else-if="style === 'brutalist'">
      <div class="brutalist-heading"><div><p>{{ dateLabel }}</p><h1>今天。<br>开始！</h1></div><div class="brutalist-stamp"><strong>{{ pending }}</strong><span>项待办</span></div></div>
      <div class="brutalist-strip"><span>完成 {{ completed }} / {{ total }}</span><span>预计 {{ load }} 分钟</span><ArrowUpRight aria-hidden="true" /></div>
    </template>
    <template v-else-if="style === 'retro'">
      <div class="retro-window-bar"><span><CalendarDays class="h-4 w-4" /> 今日工作台</span><span>{{ day }}</span></div>
      <div class="retro-desktop-content"><div class="retro-calendar-icon"><span>{{ monthNumber }} 月</span><strong>{{ dayNumber }}</strong></div><div><p>{{ dateLabel }}</p><h1>今天的桌面</h1><p>待办 {{ pending }} 项 · 已完成 {{ completed }} 项</p></div></div>
      <div class="retro-statusbar"><span>预计用时：{{ load }} 分钟</span><span>今日容量：{{ capacity }} 分钟</span></div>
    </template>
    <template v-else-if="style === 'botanical'">
      <div class="botanical-copy"><p class="dashboard-eyebrow">{{ dateLabel }} · 日常手札</p><h1>把今天，<br>慢慢展开。</h1><p>{{ pending }} 件待办 · {{ freeMinutes }} 分钟留白</p></div>
      <svg class="botanical-plant" viewBox="0 0 220 190" fill="none" aria-hidden="true"><path d="M105 178C108 135 114 105 143 28M112 141C88 121 63 113 39 87M126 91C145 86 166 74 182 53" /><path d="M119 119C70 116 68 83 69 75C100 75 121 93 119 119ZM137 63C113 40 123 15 143 7C158 30 155 46 137 63ZM132 100C160 99 184 83 190 60C163 55 141 75 132 100ZM104 153C77 152 56 141 48 119C73 113 99 126 104 153Z" /><path d="M68 175H151M77 183H142" /></svg>
      <div class="botanical-bookmark"><b>{{ completed }}</b><span>今日完成</span></div>
    </template>
    <template v-else-if="style === 'orbital'">
      <div class="orbital-copy"><p class="dashboard-eyebrow">{{ dateLabel }}</p><h1>今日航程</h1><p>{{ pending }} 项待办 · 预计 {{ load }} 分钟</p><div class="orbital-coordinates"><span>已完成 {{ completed }} / {{ total }}</span><span>可用 {{ capacity }} 分钟</span></div></div>
      <div class="orbital-instrument" role="img" :aria-label="`今日完成进度 ${percent}%`"><svg viewBox="0 0 220 220" aria-hidden="true"><circle class="orbit-guide" cx="110" cy="110" r="101" /><circle class="orbit-track" cx="110" cy="110" r="82" /><circle class="orbit-progress" cx="110" cy="110" r="82" pathLength="100" :stroke-dasharray="`${percent} 100`" /><path class="orbit-crosshair" d="M110 0V24M110 196V220M0 110H24M196 110H220" /></svg><div><strong>{{ percent }}<small>%</small></strong><span>今日完成</span></div></div>
    </template>
    <template v-else-if="style === 'atelier'">
      <div class="atelier-binding" aria-hidden="true"><i v-for="i in 6" :key="i" /></div><div class="atelier-heading"><p>{{ dateLabel }}</p><h1>今日手记</h1><span class="atelier-underlined">先从一件小事写起</span></div><div class="atelier-date-stamp"><span>{{ monthNumber }} 月</span><strong>{{ dayNumber }}</strong></div><div class="atelier-note"><span>待办 <b>{{ pending }}</b> 项</span><span>完成 <b>{{ completed }}</b> 项</span><span>留白 <b>{{ freeMinutes }}</b> 分钟</span></div>
    </template>
    <template v-else-if="style === 'blueprint'">
      <div class="blueprint-drawing"><span class="blueprint-cross blueprint-cross-one" aria-hidden="true">+</span><span class="blueprint-dimension">{{ dateLabel }}</span><h1>今日执行图</h1><div class="blueprint-scale" aria-hidden="true"><i v-for="i in 12" :key="i" /></div><span class="blueprint-cross blueprint-cross-two" aria-hidden="true">+</span></div><dl class="blueprint-titleblock"><div><dt>图号 / 日期</dt><dd>{{ day }}</dd></div><div><dt>任务 / 已完成</dt><dd>{{ total }} / {{ completed }}</dd></div><div><dt>待办预计</dt><dd>{{ load }} 分钟</dd></div><div><dt>可用容量</dt><dd>{{ capacity }} 分钟</dd></div></dl>
    </template>
    <template v-else-if="style === 'gallery'">
      <div class="gallery-meta"><time :datetime="day">{{ dateLabel }}</time><span>日常 / 个人收藏</span></div><div class="gallery-composition"><h1>今天<span>。</span></h1><div class="gallery-exhibit"><span>今日计划</span><strong>{{ pending }}</strong><span>件待完成的小事</span><p>已完成 {{ completed }} / {{ total }}<br>预计 {{ load }} 分钟</p></div></div>
    </template>
    <template v-else-if="style === 'arcade'">
      <div class="arcade-scoreboard"><span>今日任务 <b>{{ total }}</b></span><time :datetime="day">{{ day }}</time><span>已完成 <b>{{ completed }}</b></span></div><div class="arcade-title"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M16 4H32V12H40V28H32V36H16V28H8V12H16ZM16 36H32V44H16Z" /><path class="arcade-pixel-cut" d="M16 12H20V24H16ZM28 12H32V24H28Z" /></svg><h1>今日关卡</h1><span>{{ pending }} 项待办</span></div><div class="arcade-progress"><div class="arcade-segments" role="img" :aria-label="`今日任务已完成 ${percent}%`"><i v-for="i in 20" :key="i" :class="{ 'is-filled': i <= Math.floor(percent / 5) }" /></div><span>{{ percent }}% 完成</span></div>
    </template>
    <template v-else-if="style === 'sunrise'">
      <div class="sunrise-date"><time :datetime="day">{{ dateLabel }}</time><svg viewBox="0 0 160 90" aria-hidden="true"><path d="M24 77a56 56 0 0 1 112 0Z" /><path d="M8 78H152M80 4V14M18 28L28 38M142 28L132 38" /></svg></div><h1>今天，<br><span>留给重要的事。</span></h1><div class="sunrise-note"><span><b>{{ pending }}</b> 件待办</span><span><b>{{ freeMinutes }}</b> 分钟留白</span><span>已完成 {{ completed }} / {{ total }}</span></div>
    </template>
    <template v-else-if="style === 'aurora'">
      <div class="aurora-title-island"><p>{{ dateLabel }}</p><h1>今天的<br>小小宇宙。</h1></div><div class="aurora-count-island"><strong>{{ pending }}</strong><span>项待办</span><Target aria-hidden="true" /></div><div class="aurora-progress-island"><span>今日完成</span><strong>{{ completed }}<small> / {{ total }}</small></strong><progress :value="completed" :max="total || 1" aria-label="今日任务完成进度" /></div><div class="aurora-time-island"><span>预计用时</span><strong>{{ load }}<small> 分钟</small></strong><span>可用 {{ capacity }} 分钟</span></div>
    </template>
    <template v-else-if="style === 'precision'">
      <div class="precision-title"><div><p>{{ dateLabel }}</p><h1>今日工作台</h1></div><span class="precision-date">{{ day }}</span></div><dl class="precision-stats"><div><dt>待处理</dt><dd>{{ pending }}<small> 项</small></dd></div><div><dt>已完成</dt><dd>{{ completed }}<small> / {{ total }}</small></dd></div><div><dt>预计用时</dt><dd>{{ load }}<small> 分钟</small></dd></div><div><dt>可用容量</dt><dd>{{ capacity }}<small> 分钟</small></dd></div></dl>
    </template>
    <div class="dashboard-hero-actions"><button class="ui-primary-button dashboard-create" aria-label="新建任务" @click="$emit('create')"><Plus class="h-4 w-4" />新建任务</button><RouterLink :to="{ path: '/calendar', query: { date: day } }" class="ui-secondary-button dashboard-calendar"><CalendarDays class="h-4 w-4" />打开日历</RouterLink><RouterLink to="/focus" class="dashboard-focus">进入专注<ArrowUpRight class="h-4 w-4" /></RouterLink></div>
  </header>
</template>
