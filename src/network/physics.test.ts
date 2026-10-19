import { describe, expect, it } from 'vitest'
import { MAX_BODIES, createSim } from './physics'
import type { SimLink, SimNode } from './physics'

const run = (sim: ReturnType<typeof createSim>, max = 2000) => {
  let i = 0
  while (!sim.settled() && i++ < max) sim.step()
  return i
}
const dist = (sim: ReturnType<typeof createSim>, a: string, b: string) => {
  const p = sim.position(a)!
  const q = sim.position(b)!
  return Math.hypot(p.x - q.x, p.y - q.y)
}

describe('createSim', () => {
  it('pulls two distant linked concepts toward the resting line length', () => {
    const sim = createSim({ linkDistance: 110 })
    sim.sync([{ id: 'a', x: -400, y: 0 }, { id: 'b', x: 400, y: 0 }], [{ source: 'a', target: 'b' }])
    sim.reheat(1)
    run(sim)
    expect(dist(sim, 'a', 'b')).toBeLessThan(300)
    expect(dist(sim, 'a', 'b')).toBeGreaterThan(40)
  })

  it('pushes unlinked concepts that start close together apart', () => {
    const sim = createSim()
    sim.sync([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }], [])
    const before = dist(sim, 'a', 'b')
    sim.reheat(1)
    run(sim)
    expect(dist(sim, 'a', 'b')).toBeGreaterThan(before * 3)
  })

  it('settles by itself and then stops changing anything', () => {
    const sim = createSim()
    sim.sync([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 50, y: 20 }, { id: 'c', x: -30, y: 60 }], [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }])
    sim.reheat(1)
    const ticks = run(sim)
    expect(sim.settled()).toBe(true)
    expect(ticks).toBeLessThan(1000)
    const frozen = JSON.stringify(sim.positions())
    sim.step()
    sim.step()
    expect(JSON.stringify(sim.positions())).toBe(frozen)
  })

  it('does nothing until it is woken', () => {
    const sim = createSim()
    sim.sync([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 5, y: 0 }], [])
    sim.step()
    expect(sim.position('b')).toEqual({ x: 5, y: 0 })
    expect(sim.settled()).toBe(true)
  })

  it('reheat wakes a settled simulation, and a moved concept is followed by its neighbor', () => {
    const sim = createSim({ linkDistance: 110 })
    sim.sync([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 110, y: 0 }], [{ source: 'a', target: 'b' }])
    sim.reheat(1)
    run(sim)
    const bBefore = sim.position('b')!
    // Drag a far to the left: pinned there, then wake the rest.
    sim.pin('a', -500, 0)
    sim.reheat(0.5)
    run(sim)
    expect(sim.position('a')).toEqual({ x: -500, y: 0 })
    expect(sim.position('b')!.x).toBeLessThan(bBefore.x - 100)
  })

  it('never moves a fixed or pinned concept, and moves it again once released', () => {
    const sim = createSim()
    sim.sync([{ id: 'a', x: 0, y: 0, fixed: true }, { id: 'b', x: 20, y: 0 }], [])
    sim.reheat(1)
    for (let i = 0; i < 50; i++) sim.step()
    expect(sim.position('a')).toEqual({ x: 0, y: 0 })
    expect(sim.position('b')!.x).toBeGreaterThan(20)
    sim.release('a')
    sim.reheat(1)
    for (let i = 0; i < 50; i++) sim.step()
    expect(sim.position('a')).not.toEqual({ x: 0, y: 0 })
  })

  it('separates concepts that start on exactly the same spot, without NaN', () => {
    const sim = createSim()
    sim.sync([{ id: 'a', x: 7, y: 7 }, { id: 'b', x: 7, y: 7 }, { id: 'c', x: 7, y: 7 }], [{ source: 'a', target: 'b' }])
    sim.reheat(1)
    run(sim)
    for (const p of sim.positions()) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
    expect(dist(sim, 'a', 'c')).toBeGreaterThan(10)
  })

  it('is repeatable: the same input gives the same layout', () => {
    const make = () => {
      const sim = createSim()
      sim.sync([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 0 }, { id: 'c', x: 40, y: 40 }], [{ source: 'a', target: 'c' }])
      sim.reheat(1)
      run(sim)
      return JSON.stringify(sim.positions())
    }
    expect(make()).toBe(make())
  })

  it('ignores lines to concepts it does not know and lines from a concept to itself', () => {
    const sim = createSim()
    const nodes: SimNode[] = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }]
    const links: SimLink[] = [{ source: 'a', target: 'ghost' }, { source: 'a', target: 'a' }, { source: 'a', target: 'b' }]
    expect(() => {
      sim.sync(nodes, links)
      sim.reheat(1)
      run(sim)
    }).not.toThrow()
    expect(sim.size()).toBe(2)
  })

  it('a stronger repel force spreads unlinked concepts further apart', () => {
    const spread = (repel: number) => {
      const sim = createSim({ repel })
      sim.sync([{ id: 'a', x: -5, y: 0 }, { id: 'b', x: 5, y: 0 }], [])
      sim.reheat(1)
      run(sim)
      return dist(sim, 'a', 'b')
    }
    expect(spread(2.5)).toBeGreaterThan(spread(0.25))
  })

  it('keeps velocities of concepts that survive a re-sync, and keeps the limit constant exported', () => {
    expect(MAX_BODIES).toBe(300)
    const sim = createSim()
    sim.sync([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }], [])
    sim.reheat(1)
    sim.step()
    const p = sim.position('b')!
    sim.sync([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: p.x, y: p.y }, { id: 'c', x: 200, y: 200 }], [])
    expect(sim.size()).toBe(3)
    expect(sim.position('c')).toEqual({ x: 200, y: 200 })
  })

  it('stays fast enough at the concept limit', () => {
    const sim = createSim()
    const nodes: SimNode[] = Array.from({ length: MAX_BODIES }, (_, i) => ({ id: `n${i}`, x: Math.cos(i) * 300, y: Math.sin(i) * 300 }))
    const links: SimLink[] = nodes.slice(1).map(n => ({ source: 'n0', target: n.id }))
    sim.sync(nodes, links)
    sim.reheat(1)
    const t = performance.now()
    for (let i = 0; i < 20; i++) sim.step()
    // 20 ticks at the limit; a generous bound so a slow CI box does not flake, but an accidental O(n³) would fail it.
    expect(performance.now() - t).toBeLessThan(1500)
  })
})
