import { describe, expect, it } from 'vitest'
import { Spring, actionEnvelope, PetActionBlend } from '../pet/motion'

describe('pet motion interpolation', () => {
  it('fades the old action instead of dropping it when interrupted', () => {
    const blend = new PetActionBlend()
    blend.trigger('dance')
    for (let i=0;i<90;i++) blend.step(1/60)
    const before = blend.weights.dance.value
    blend.trigger('wave')
    const first = blend.step(1/60)
    expect(first.dance).toBeGreaterThan(before-.03)
    for (let i=0;i<90;i++) blend.step(1/60)
    expect(blend.weights.dance.value).toBeLessThan(.01)
    expect(blend.weights.wave.value).toBeGreaterThan(.95)
  })
  it('keeps sleep active and smoothly wakes on another action', () => {
    const blend = new PetActionBlend()
    blend.trigger('sleep')
    for (let i=0;i<600;i++) blend.step(1/60)
    expect(blend.weights.sleep.value).toBeCloseTo(1,3)
    blend.trigger('happy')
    expect(blend.step(1/60).sleep).toBeGreaterThan(.95)
    for (let i=0;i<120;i++) blend.step(1/60)
    expect(blend.weights.sleep.value).toBeLessThan(.01)
  })
  it('converges consistently across 30, 60 and 144 fps', () => {
    const positions = [30, 60, 144].map(fps => {
      const spring = new Spring(0)
      for(let i=0;i<fps*2;i++) spring.step(1,1/fps)
      return spring.value
    })
    positions.forEach(value => expect(value).toBeCloseTo(1,3))
  })
  it('keeps position continuous when targets reverse and after a background pause', () => {
    const spring = new Spring(0)
    for(let i=0;i<20;i++) spring.step(1,1/60)
    const previous = spring.value
    const next = spring.step(-1,1/144)
    expect(Math.abs(next-previous)).toBeLessThan(.1)
    expect(Number.isFinite(spring.step(0,600))).toBe(true)
    expect(Math.abs(spring.value)).toBeLessThan(2)
  })
  it('eases actions in and out without restarting a permanent loop', () => {
    expect(actionEnvelope(0,3)).toBe(0)
    expect(actionEnvelope(1,3)).toBe(1)
    expect(actionEnvelope(3,3)).toBe(0)
    expect(actionEnvelope(5,3)).toBe(0)
    expect(actionEnvelope(.01,3)).toBeLessThan(.01)
    expect(actionEnvelope(2.99,3)).toBeLessThan(.01)
  })
})
