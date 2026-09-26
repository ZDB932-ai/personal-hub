import { describe, expect, it } from 'vitest'
import { advanceRoam } from '../pet/roaming'

describe('desktop pet roaming bounds', () => {
  it('turns at both edges including monitors with negative coordinates', () => {
    expect(advanceRoam(-101,1,.05,100,-1000,-100)).toEqual({x:-100,direction:-1,moving:true})
    expect(advanceRoam(-999,-1,.05,100,-1000,-100)).toEqual({x:-1000,direction:1,moving:true})
  })
  it('clamps a displaced window and avoids jumps after suspension', () => {
    expect(advanceRoam(8000,-1,600,100,0,1000).x).toBe(995)
    expect(advanceRoam(500,1,0,100,0,1000).x).toBe(500)
  })
  it('stops when the work area is smaller than the pet window', () => {
    expect(advanceRoam(50,1,.05,100,100,80)).toEqual({x:100,direction:1,moving:false})
  })
})
