import type { PresetPetAsset } from './preset3d'

export const robotPreview: PresetPetAsset = {
  name: '圆润机器人 · 灰色模型',
  url: '/pets/rounded-robot-preview.glb',
  bindings: {
    idle: { clip: 'pet_idle', loop: true, source: 'tripo-preset', preset: '待机', taskId: 'rounded-robot/native139', inPlace: true },
    walk: { clip: 'pet_walk', loop: true, source: 'tripo-preset', preset: '行走', taskId: 'rounded-robot/native139', inPlace: true },
    run: { clip: 'pet_run', loop: true, source: 'tripo-preset', preset: '跑步', taskId: 'rounded-robot/native139', inPlace: true },
    jump: { clip: 'pet_jump', loop: false, source: 'tripo-preset', preset: '跳跃', taskId: 'rounded-robot/native139', inPlace: true },
  },
}

export const astronautPreview: PresetPetAsset = {
  name: '小宇航员',
  url: '/pets/little-astronaut-preview.glb',
  bindings: {
    walk: { clip: 'walk', loop: true, source: 'tripo-preset', preset: '行走', taskId: 'little-astronaut/run005', inPlace: false },
  },
}

export const boyPreview: PresetPetAsset = {
  name: '卷发男孩 · 静态角色',
  url: '/pets/curly-haired-boy-preview.glb',
  bindings: {},
}
