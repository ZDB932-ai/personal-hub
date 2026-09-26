import { describe, expect, it } from 'vitest'
import { gesture, nextCuriousAction, shyExpression, peekExpression } from '../pet/personality'
describe('personality gestures',()=>{
  it('times the surprise blink before the bashful smile and restores attention',()=>{
    expect(peekExpression(1).attention).toBeLessThan(.1)
    expect(peekExpression(1.5).lids).toBeGreaterThan(.8)
    expect(peekExpression(2.3).smile).toBeGreaterThan(.5)
    for(const t of [-1,0,3.6,10]) expect(peekExpression(t)).toEqual({lids:0,smile:0,attention:1})
  })
  it('keeps shy eyes open and restores attention after the gesture',()=>{
    for (let t=0;t<4;t+=.01) {
      const face=shyExpression(t)
      expect(face.lids).toBeGreaterThanOrEqual(0)
      expect(face.lids).toBeLessThanOrEqual(.12)
    }
    expect(shyExpression(2).lids).toBeLessThan(shyExpression(1).lids)
    expect(shyExpression(4)).toEqual({lids:0,smile:0,attention:1})
  })
  it('settles the body and completes exactly one turn',()=>{
    expect(gesture(0).turn).toBe(0)
    expect(gesture(4).turn).toBe(1)
    expect(gesture(4).prepare).toBe(0)
    expect(gesture(4).reveal).toBe(0)
    expect(gesture(4).glance).toBe(0)
    expect(gesture(4).hop).toBeCloseTo(0)
    let previous=0
    for(let t=0;t<4;t+=.01){const next=gesture(t);expect(next.turn).toBeGreaterThanOrEqual(previous);previous=next.turn}
  })
  it('does not immediately repeat an autonomous gesture',()=>{
    for(const last of ['peek','spin','shy','wave']) for(const random of [0,.2,.5,.99,1]) expect(nextCuriousAction(last,random)).not.toBe(last)
  })
})
