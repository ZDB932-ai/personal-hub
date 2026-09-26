import { describe, expect, it } from 'vitest'
import { approachSpeed, distancePhase, footCycle, stridePixels } from '../pet/gait'

describe('pet gait', () => {
  it('cancels screen displacement during the support part of the stride', () => {
    const start = footCycle(distancePhase(stridePixels*.1))
    const end = footCycle(distancePhase(stridePixels*.4))
    const screenFootDelta = (end.forward-start.forward)*(240/1.3)*Math.sin(1.25)
    expect(screenFootDelta+stridePixels*.3).toBeCloseTo(0,8)
    expect(distancePhase(0)).toBe(0)
  })
  it('keeps the foot on the ground during stance and lifts only during return', () => {
    for (let p=0;p<.6;p+=.05) expect(footCycle(p).lift).toBe(0)
    expect(footCycle(.8).lift).toBeCloseTo(.022)
    expect(footCycle(1)).toEqual(footCycle(0))
    expect(footCycle(.59999).forward).toBeCloseTo(footCycle(.60001).forward,4)
    expect(footCycle(.99999).forward).toBeCloseTo(footCycle(0).forward,4)
  })
  it('matches the longer running stride at different display sizes', () => {
    for (const height of [180,240,320]) {
      for (const sprint of [0,.5,1]) {
        const stride = stridePixels*(1+.4*sprint)*height/240
        const phase = distancePhase(stride*.3,sprint,height)
        const start = footCycle(.1)
        const end = footCycle(.1+phase)
        const displacement = (end.forward-start.forward)*(1+.4*sprint)*(height/1.3)*Math.sin(1.25)
        expect(displacement+stride*.3).toBeCloseTo(0,8)
      }
    }
  })
  it('accelerates gradually without overshooting after a pause', () => {
    expect(approachSpeed(0,1,1/60)).toBeLessThan(.05)
    expect(approachSpeed(.95,1,.05)).toBe(1)
    expect(approachSpeed(.05,0,.05)).toBe(0)
    expect(approachSpeed(0,1,600)).toBeCloseTo(.14)
  })
})
