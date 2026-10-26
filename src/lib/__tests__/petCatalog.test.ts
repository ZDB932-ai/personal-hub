import { describe, expect, it } from 'vitest'
import { getPetCatalogEntry, isAvailablePet, petCatalog, roamingMotion, selectedPet, supportsPetMood } from '../pet/catalog'
import availablePetIds from '../pet/available.json'

describe('pet catalog', () => {
  it('resolves samples and unknown selections to the released companion', () => {
    expect(selectedPet('repairer-clap-sample').id).toBe('repairer-clap-sample')
    expect(selectedPet('unknown').id).toBe('nailong')
  })
  it('derives preset interactions from actual bindings instead of legacy behavior', () => {
    const sample = getPetCatalogEntry('repairer-clap-sample')!
    expect(supportsPetMood(sample, 'happy')).toBe(true)
    for (const mood of ['run', 'wave', 'jump', 'peek', 'belly', 'eat']) expect(supportsPetMood(sample, mood)).toBe(false)
    expect(supportsPetMood(selectedPet('nailong'), 'belly')).toBe(true)
  })
  it('keeps the native release allowlist aligned with available catalog entries', () => {
    expect([...availablePetIds].sort()).toEqual(petCatalog.filter(entry => entry.status === 'available').map(entry => entry.id).sort())
    expect(new Set(availablePetIds).size).toBe(availablePetIds.length)
  })
  it('describes the concrete limitations of each available preset companion', () => {
    expect(isAvailablePet('nailong')).toBe(true)
    expect(isAvailablePet('repairer-clap-sample')).toBe(true)
    expect(availablePetIds).toHaveLength(5)
    const limitations: Record<string, RegExp[]> = {
      'repairer-clap-sample': [/鼓掌/, /没有待机、行走或喂食动画/],
      'rounded-robot': [/灰色模型|灰模/, /没有完整贴图与面部细节/],
      'little-astronaut': [/支持行走动画/, /没有其他互动动画/],
      'curly-haired-boy': [/静态角色/, /没有动画/],
    }
    const presets = petCatalog.filter(entry => entry.renderer === 'preset')
    expect(presets.map(entry => entry.id).sort()).toEqual(Object.keys(limitations).sort())
    for (const entry of presets) {
      expect(isAvailablePet(entry.id)).toBe(true)
      for (const limitation of limitations[entry.id]!) expect(entry.description).toMatch(limitation)
      expect(entry.description).toContain('不支持屏幕巡游')
      expect(roamingMotion(entry)).toBeUndefined()
      expect(supportsPetMood(entry, 'wave')).toBe(false)
    }
    for (const mood of ['idle', 'walk', 'eat']) expect(supportsPetMood(selectedPet('repairer-clap-sample'), mood)).toBe(false)
    for (const mood of ['idle', 'run', 'jump']) expect(supportsPetMood(selectedPet('little-astronaut'), mood)).toBe(false)
    const staticPet = selectedPet('curly-haired-boy')
    expect(staticPet.actions).toEqual([])
    if (staticPet.renderer === 'preset') expect(staticPet.asset.bindings).toEqual({})
    expect(isAvailablePet('unknown')).toBe(false)
    expect(getPetCatalogEntry('unknown')).toBeUndefined()
  })
  it('has unique stable identities and does not advertise missing sample actions', () => {
    expect(new Set(petCatalog.map(entry => entry.id)).size).toBe(petCatalog.length)
    const sample = getPetCatalogEntry('repairer-clap-sample')!
    expect(sample.renderer).toBe('preset')
    if (sample.renderer === 'preset') {
      expect(sample.actions).toEqual([{ label: '播放鼓掌', mood: 'happy' }])
      expect(sample.asset.bindings.celebrate?.source).toBe('tripo-preset')
      expect(sample.asset.bindings.walk).toBeUndefined()
    }
  })
})
