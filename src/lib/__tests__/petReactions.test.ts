import { describe,expect,it } from 'vitest'
import { afterInteraction,PetReactions } from '../pet/reactions'
describe('contextual pet reactions',()=>{
  it('responds to rapid pats with a cooldown instead of repeating every click',()=>{
    const pet=new PetReactions()
    expect(pet.touch(0)).toBe('happy')
    expect(pet.touch(200)).toBe('happy')
    expect(pet.touch(400)).toBe('shy')
    for(let t=500;t<2000;t+=100)expect(pet.touch(t)).toBe('happy')
    expect(pet.touch(7000)).toBe('happy')
  })
  it('has finite followups and does not wake sleeping pets',()=>{
    expect(afterInteraction('eat')?.mood).toBe('happy')
    expect(afterInteraction('peek')?.mood).toBe('wave')
    expect(afterInteraction('happy')).toBeUndefined()
    expect(afterInteraction('sleep')).toBeUndefined()
  })
})
