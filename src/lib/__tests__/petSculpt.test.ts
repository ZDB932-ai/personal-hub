import { afterEach, expect, it, vi } from 'vitest'
import meshJson from '../../../public/pets/nailong-sculpt.json?raw'
import * as T from 'three'
import { loadSculpt } from '../pet/sculpt'

afterEach(() => vi.unstubAllGlobals())

it('loads the shipped skin with normalized weights and confines closing deformation to the mouth', async () => {
  const data=JSON.parse(meshJson)
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>data}))
  const bones=Array.from({length:11},()=>new T.Bone())
  bones.slice(1).forEach(bone=>bones[0]!.add(bone))
  const material=new T.MeshBasicMaterial()
  const mesh=await loadSculpt(material,bones)
  const position=mesh.geometry.getAttribute('position')
  const weights=mesh.geometry.getAttribute('skinWeight')
  const closed=mesh.geometry.morphAttributes.position![0]!
  let changed=0
  let maxWeightError=0
  for(let i=0;i<position.count;i++) {
    const sum=weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)
    maxWeightError=Math.max(maxWeightError,Math.abs(sum-1))
    const delta=closed.getZ(i)-position.getZ(i)
    if(delta>1e-6) {
      changed++
      expect(Math.abs(position.getX(i))).toBeLessThan(.346)
      expect(position.getY(i)).toBeGreaterThan(2.19)
      expect(position.getY(i)).toBeLessThan(2.46)
      expect(delta).toBeLessThanOrEqual(.151)
    }
  }
  expect(maxWeightError).toBeLessThan(1e-6)
  expect(changed).toBeGreaterThan(20)
  mesh.geometry.dispose(); mesh.skeleton.dispose(); material.dispose()
})
