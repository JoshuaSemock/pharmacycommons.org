import { describe, expect, it } from 'vitest'
import { ringPositions } from './layout'

describe('ringPositions', () => {
  it('returns one point per node and none for zero', () => {
    expect(ringPositions({ x: 0, y: 0 }, 0)).toEqual([])
    expect(ringPositions({ x: 0, y: 0 }, 7)).toHaveLength(7)
    expect(ringPositions({ x: 0, y: 0 }, 60)).toHaveLength(60)
  })

  it('surrounds the root on a full circle', () => {
    const pts = ringPositions({ x: 0, y: 0 }, 8)
    const dists = pts.map(p => Math.hypot(p.x, p.y))
    expect(Math.min(...dists)).toBeGreaterThan(100)
    expect(Math.max(...dists) - Math.min(...dists)).toBeLessThan(40) // only the stagger differs
    expect(pts.some(p => p.x < 0)).toBe(true)
    expect(pts.some(p => p.x > 0)).toBe(true)
  })

  it('fans a branch away from the middle of the drawing', () => {
    const anchor = { x: 400, y: 0 }
    const pts = ringPositions(anchor, 6)
    // Every new node is farther from the origin than the anchor is, or at worst level with it.
    for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeGreaterThan(300)
    expect(pts.filter(p => p.x > anchor.x).length).toBeGreaterThanOrEqual(3)
  })

  it('does not stack two nodes on the same spot', () => {
    const pts = ringPositions({ x: 0, y: 0 }, 40)
    const keys = new Set(pts.map(p => `${Math.round(p.x)},${Math.round(p.y)}`))
    expect(keys.size).toBe(40)
  })

  it('is deterministic', () => {
    expect(ringPositions({ x: 10, y: 20 }, 12)).toEqual(ringPositions({ x: 10, y: 20 }, 12))
  })
})
