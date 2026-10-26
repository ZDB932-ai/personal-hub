import type { PresetPetAsset } from './preset3d'
import { officialClapSample } from './sampleAssets'
import { robotPreview, astronautPreview, boyPreview } from './previewAssets'
import availablePetIds from './available.json'
import { motionForMood } from './mood'
import { calibratedMotion } from './locomotion'

interface CatalogBase {
  id: string
  name: string
  category: string
  description: string
}

export type PetCatalogEntry = CatalogBase & (
  | { status: 'available'; renderer: 'legacy'; actions: readonly string[] }
  | { status: 'sample' | 'available'; renderer: 'preset'; asset: PresetPetAsset; actions: readonly { label: string; mood: string }[] }
)

export const petCatalog: readonly PetCatalogEntry[] = [
  {
    id: 'nailong', name: '奶龙', category: '萌系 / 奇幻', status: 'available', renderer: 'legacy',
    description: '支持拖动、屏幕巡游、打招呼、喂食、舞蹈与小憩。',
    actions: ['待机', '巡游', '招呼', '喂食', '舞蹈', '小憩'],
  },
  {
    id: 'repairer-clap-sample', name: '星际维修员', category: '人形 / 科幻', status: 'available', renderer: 'preset',
    description: '支持鼓掌互动；没有待机、行走或喂食动画，不支持屏幕巡游。',
    asset: officialClapSample, actions: [{ label: '播放鼓掌', mood: 'happy' }],
  },
  {
    id: 'rounded-robot', name: '圆润机器人', category: '机械 / 科幻', status: 'available', renderer: 'preset',
    description: '灰色模型外观，支持待机、原地行走、跑步与跳跃动画；没有完整贴图与面部细节，不支持屏幕巡游。',
    asset: robotPreview, actions: [{ label: '待机', mood: 'idle' }, { label: '行走', mood: 'walk' }, { label: '跑步', mood: 'run' }, { label: '跳跃', mood: 'jump' }],
  },
  {
    id: 'little-astronaut', name: '小宇航员', category: '人形 / 太空', status: 'available', renderer: 'preset',
    description: '支持行走动画；没有其他互动动画，不支持屏幕巡游。',
    asset: astronautPreview, actions: [{ label: '行走', mood: 'walk' }],
  },
  {
    id: 'curly-haired-boy', name: '卷发男孩', category: '人形 / 日常', status: 'available', renderer: 'preset',
    description: '静态角色，可拖动和旋转；没有动画，不支持屏幕巡游。',
    asset: boyPreview, actions: [],
  },
]

export function getPetCatalogEntry(id: string): PetCatalogEntry | undefined {
  return petCatalog.find(entry => entry.id === id)
}

export function isAvailablePet(id: string): boolean {
  return availablePetIds.includes(id) && getPetCatalogEntry(id)?.status === 'available'
}

export function selectedPet(id: string): PetCatalogEntry {
  return getPetCatalogEntry(isAvailablePet(id) ? id : 'nailong')!
}

export function supportsPetMood(entry: PetCatalogEntry, mood: string): boolean {
  if (entry.renderer === 'legacy') return true
  const motion = motionForMood(mood)
  return !!motion && !!entry.asset.bindings[motion]
}

export function roamingMotion(entry: PetCatalogEntry): 'walk' | 'run' | undefined {
  return entry.renderer === 'legacy' ? 'run' : calibratedMotion(entry.asset.bindings)
}
