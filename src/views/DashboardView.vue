<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Cake,
  Globe,
  KeyRound,
  Layers,
  Link2,
  ListTodo,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldAlert,
} from '@lucide/vue'
import { profile } from '@/stores/profile'
import { entries } from '@/stores/vault'
import { tasks } from '@/stores/tasks'
import ProfileModal from '@/components/ProfileModal.vue'
import PageHeader from '@/components/PageHeader.vue'
import { formatDate, passwordStrength, todayYMD } from '@/lib/utils'
import { remindTsOf } from '@/lib/reminders'

const showProfileModal = ref(false)

const hour = new Date().getHours()
const greeting =
  hour < 6 ? '凌晨好' : hour < 11 ? '早上好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : '晚上好'

const today = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
})

const displayName = computed(() => profile.nickname || profile.name || '朋友')
const avatarChar = computed(() => displayName.value.trim().charAt(0) || 'P')

const hasInfo = computed(() =>
  Boolean(profile.nickname || profile.name || profile.bio || profile.email),
)

const total = computed(() => entries.value.length)
const categoryCount = computed(() => new Set(entries.value.map((e) => e.category)).size)
const weakCount = computed(
  () => entries.value.filter((e) => passwordStrength(e.password).score <= 1).length,
)

const todayKey = todayYMD()
const todayTasks = computed(() => tasks.value.filter((t) => t.date === todayKey))
const todayDone = computed(() => todayTasks.value.filter((t) => t.done).length)
const overdueToday = computed(
  () => tasks.value.filter((t) => !t.done && t.date && t.date < todayKey).length,
)

const nextReminderLabel = computed(() => {
  const now = Date.now()
  let best: number | null = null
  for (const t of tasks.value) {
    const ts = remindTsOf(t)
    if (ts === null || ts <= now) continue
    if (best === null || ts < best) best = ts
  }
  if (best === null) return null
  const diff = best - now
  if (diff < 60_000) return `下一提醒 ${Math.max(1, Math.floor(diff / 1000))} 秒后`
  if (diff < 3_600_000) return `下一提醒 ${Math.floor(diff / 60_000)} 分钟后`
  if (diff < 86_400_000) return `下一提醒 ${Math.floor(diff / 3_600_000)} 小时后`
  return `下一提醒 ${Math.ceil(diff / 86_400_000)} 天后`
})

const recent = computed(() =>
  [...entries.value].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4),
)

const contactRows = computed(() =>
  [
    { icon: Mail, label: '邮箱', value: profile.email },
    { icon: Phone, label: '手机', value: profile.phone },
    { icon: MapPin, label: '所在地', value: profile.location },
    { icon: Cake, label: '生日', value: profile.birthday },
    { icon: Link2, label: 'GitHub', value: profile.github, link: true },
    { icon: Globe, label: '网站', value: profile.blog, link: true },
  ].filter((r) => r.value),
)
</script>

<template>
    <div>
      <PageHeader :title="`${greeting}，${displayName}`" :description="today" eyebrow="个人概览">
        <template #actions>
          <button class="ui-secondary-button gap-2" @click="showProfileModal = true">
          <Pencil class="h-4 w-4" />
          编辑资料
          </button>
        </template>
      </PageHeader>

      <div class="dashboard-overview mt-7">
        <div
          class="dashboard-profile"
      >
        <template v-if="hasInfo">
          <div class="flex items-center gap-4">
            <div
              class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-ink"
            >
              {{ avatarChar }}
            </div>
            <div class="min-w-0">
              <p class="truncate text-lg font-semibold">
                {{ profile.nickname }}
                <span v-if="profile.nickname && profile.name" class="ml-2 text-sm font-normal text-t4">
                  {{ profile.name }}
                </span>
              </p>
              <p v-if="profile.bio" class="mt-1 line-clamp-2 text-sm text-t3">
                {{ profile.bio }}
              </p>
            </div>
          </div>

          <div class="mt-6 grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
            <div
              v-for="row in contactRows"
              :key="row.label"
              class="flex min-w-0 items-center gap-3 text-sm"
            >
              <component
                :is="row.icon"
                class="h-4 w-4 shrink-0 text-primary"
              />
              <span class="shrink-0 text-xs text-t4">{{ row.label }}</span>
              <a
                v-if="'link' in row && row.link && row.value.startsWith('http')"
                :href="row.value"
                target="_blank"
                rel="noopener noreferrer"
                class="truncate text-t2 underline-offset-4 hover:text-primary hover:underline"
              >
                {{ row.value }}
              </a>
              <span v-else class="truncate text-t2">{{ row.value }}</span>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="flex items-center gap-4">
            <div
              class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-2 text-t3"
            >
              <Pencil class="h-6 w-6" />
            </div>
            <div>
              <p class="font-medium text-t2">完善你的个人资料</p>
              <p class="mt-1 text-sm text-t4">填写昵称、联系方式等信息，只保存在你的浏览器里</p>
            </div>
          </div>
          <button
            class="ui-primary-button mt-5"
            @click="showProfileModal = true"
          >
            立即填写
          </button>
        </template>
      </div>

        <div class="dashboard-summary sm:grid-cols-2 lg:grid-cols-1">
          <RouterLink
            to="/vault"
            class="dashboard-summary-item"
          >
            <span class="dashboard-summary-icon text-primary"><KeyRound class="h-4 w-4" /></span>
            <div>
              <p class="text-xl font-bold tabular-nums text-t1">{{ total }}</p>
              <p class="mt-0.5 text-xs text-t4">账号总数</p>
            </div>
          </RouterLink>
          <RouterLink
            to="/vault"
            class="dashboard-summary-item"
          >
            <span class="dashboard-summary-icon text-info"><Layers class="h-4 w-4" /></span>
            <div>
              <p class="text-xl font-bold tabular-nums text-t1">{{ categoryCount }}</p>
              <p class="mt-0.5 text-xs text-t4">分类数</p>
            </div>
          </RouterLink>
          <RouterLink
            to="/today"
            class="dashboard-summary-item"
          >
            <span class="dashboard-summary-icon text-info"><ListTodo class="h-4 w-4" /></span>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-t1">今日 {{ todayDone }}/{{ todayTasks.length }} 完成</p>
              <p class="mt-0.5 truncate text-xs" :class="overdueToday > 0 ? 'text-warn' : 'text-t4'">
                {{ overdueToday > 0 ? `${overdueToday} 个逾期` : nextReminderLabel ?? '暂无定时提醒' }}
              </p>
            </div>
          </RouterLink>
          <RouterLink
            to="/vault"
            class="dashboard-summary-item"
          >
            <span class="dashboard-summary-icon" :class="weakCount > 0 ? 'text-danger' : 'text-ok'">
              <ShieldAlert class="h-4 w-4" />
            </span>
            <div class="min-w-0">
              <p class="text-sm font-semibold" :class="weakCount > 0 ? 'text-danger' : 'text-ok'">
                {{ weakCount > 0 ? `${weakCount} 个弱密码` : '密码强度良好' }}
              </p>
              <p class="mt-0.5 text-xs text-t4">
                {{ weakCount > 0 ? '建议更换' : '继续保持' }}
              </p>
            </div>
          </RouterLink>
        </div>
      </div>

      <div class="mt-7 border-t border-line pt-5">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold">最近更新</h2>
        <RouterLink class="text-xs font-medium text-primary transition-colors duration-150 hover:text-primary-strong" to="/vault">
          查看全部
        </RouterLink>
      </div>

      <div v-if="recent.length === 0" class="empty-state mt-4">
        <KeyRound class="mx-auto h-8 w-8 text-t4" />
        <p class="mt-3 text-sm font-medium text-t2">还没有保存任何账号</p>
        <RouterLink class="ui-primary-button mt-4" to="/vault">新增账号</RouterLink>
      </div>

      <ul v-else class="mt-4 divide-y divide-line">
        <li
          v-for="item in recent"
          :key="item.id"
          class="first:pt-0 last:pb-0"
        >
          <RouterLink
            to="/vault"
            class="group flex min-h-14 items-center gap-3.5 py-3 transition-colors duration-150"
          >
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm font-bold text-primary">
              {{ (item.title || '未命名').charAt(0).toUpperCase() }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-t1 group-hover:text-primary">{{ item.title }}</p>
              <p class="truncate text-xs text-t4">{{ item.username }}</p>
            </div>
            <span class="hidden shrink-0 text-xs text-t4 sm:block">
              {{ formatDate(item.updatedAt) }}
            </span>
          </RouterLink>
        </li>
      </ul>
    </div>

    <ProfileModal :open="showProfileModal" @close="showProfileModal = false" />
  </div>
</template>
