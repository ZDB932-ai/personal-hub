import { describe,expect,it } from 'vitest'
import { moveToward,turnToward } from '../pet/navigation'

describe('pet navigation',()=>{
  it('crosses the angle wrap using the short path at a bounded speed',()=>{
    const start=179*Math.PI/180
    const result=turnToward(start,-179*Math.PI/180,.016)
    expect(result-start).toBeGreaterThan(0)
    expect(result-start).toBeLessThan(.073)
    expect(Math.abs(turnToward(0,40*Math.PI+.8,.016))).toBeLessThan(.073)
  })
  it('reaches a target from fractional pixels without stalling or overshooting',()=>{
    let position={x:2.4,y:5},speed=0,arrived=false
    for(let i=0;i<300 && !arrived;i++) {
      const next=moveToward(position,{x:0,y:5},speed,.016)
      expect(next.x).toBeGreaterThanOrEqual(0)
      position=next; speed=next.speed; arrived=next.arrived
    }
    expect(arrived).toBe(true)
    expect(position.x).toBe(0)
  })
  it('arrives diagonally and stops with finite values even at zero distance',()=>{
    let position={x:0,y:0},speed=0
    for(let i=0;i<800;i++) {
      const next=moveToward(position,{x:350,y:120},speed,.016)
      position=next; speed=next.speed
    }
    expect(position.x).toBe(350)
    expect(position.y).toBe(120)
    expect(speed).toBe(0)
  })
})
