import { reactive } from 'vue'
import type { ProfileInfo } from '@/types'
import { emptyProfile } from '@/lib/utils'

export const profile = reactive<ProfileInfo>(emptyProfile())
