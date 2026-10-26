import type { PresetPetAsset } from './preset3d'

export const officialClapSample: PresetPetAsset = {
  name: '星际维修员 · 官方鼓掌精修样片',
  url: '/pets/samples/official-clap.glb',
  bindings: {
    celebrate: {
      clip: 'OfficialClap', loop: false, source: 'tripo-preset', preset: '鼓掌 / clap',
      taskId: 'df0564aa-595b-4daa-9e9e-ce153e77750f', inPlace: false,
    },
  },
}
