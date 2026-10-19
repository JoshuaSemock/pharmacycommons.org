/**
 * A small force simulation for the Network canvas's optional physics mode.
 * Plain maths on plain objects (no Cytoscape, no DOM), so it is tested directly.
 *
 * Same shape as the layout in Obsidian's graph view: every pair of concepts
 * repels, every line is a spring toward a resting length, a weak pull keeps the
 * drawing from drifting away, and a cooling "alpha" lets it settle and stop.
 * Dragging pins a concept and reheats the rest, so neighbors follow.
 *
 * Closeness here is a side effect of the layout. It carries no meaning about
 * how related two concepts are; the page says so wherever physics is offered.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type SimNode = { id: string; x: number; y: number; fixed?: boolean }
export type SimLink = { source: string; target: string }
export type SimOptions = { repel: number; linkDistance: number }

type Body = { id: string; x: number; y: number; vx: number; vy: number; fixed: boolean }

/** Beyond this many concepts the page keeps the layout still (the pair loop is O(n²)). */
export const MAX_BODIES = 300

const REPEL_K = 2400
const REPEL_RANGE = 650
const LINK_K = 0.3
const CENTER_K = 0.015
const DAMPING = 0.6
const ALPHA_DECAY = 0.0228
const ALPHA_MIN = 0.001

export type Sim = {
  /** Replaces the bodies and lines. Positions come from the caller; velocities of known ids are kept. */
  sync(nodes: SimNode[], links: SimLink[]): void
  setOptions(o: Partial<SimOptions>): void
  /** Wakes the simulation. Defaults to a gentle nudge. */
  reheat(alpha?: number): void
  /** Holds one concept in place (a drag or a pin) at its current spot, or at x, y. */
  pin(id: string, x?: number, y?: number): void
  release(id: string): void
  /** Advances one tick. */
  step(): void
  settled(): boolean
  alpha(): number
  size(): number
  position(id: string): { x: number; y: number } | undefined
  positions(): { id: string; x: number; y: number }[]
}

export function createSim(initial: Partial<SimOptions> = {}): Sim {
  const opts: SimOptions = { repel: 1, linkDistance: 110, ...initial }
  let bodies: Body[] = []
  let index = new Map<string, Body>()
  let links: { s: Body; t: Body; strength: number }[] = []
  let alpha = 0

  function sync(nodes: SimNode[], ls: SimLink[]) {
    const prev = index
    bodies = nodes.map(n => {
      const old = prev.get(n.id)
      return { id: n.id, x: n.x, y: n.y, vx: old?.vx ?? 0, vy: old?.vy ?? 0, fixed: n.fixed === true }
    })
    index = new Map(bodies.map(b => [b.id, b]))
    const degree = new Map<string, number>()
    const valid = ls.filter(l => index.has(l.source) && index.has(l.target) && l.source !== l.target)
    for (const l of valid) {
      degree.set(l.source, (degree.get(l.source) ?? 0) + 1)
      degree.set(l.target, (degree.get(l.target) ?? 0) + 1)
    }
    // A spring on a hub is weaker, as in d3-force, so a class with many members does not collapse.
    links = valid.map(l => ({
      s: index.get(l.source) as Body,
      t: index.get(l.target) as Body,
      strength: 1 / Math.max(1, Math.min(degree.get(l.source) ?? 1, degree.get(l.target) ?? 1)),
    }))
  }

  function step() {
    if (alpha < ALPHA_MIN) return
    const n = bodies.length

    // Repulsion between every pair within range.
    for (let i = 0; i < n; i++) {
      const a = bodies[i]
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d2 = dx * dx + dy * dy
        if (d2 === 0) {
          // Concepts on the same spot are pushed apart in a fixed, repeatable direction.
          dx = (j - i) * 0.01
          dy = 0.01
          d2 = dx * dx + dy * dy
        }
        if (d2 > REPEL_RANGE * REPEL_RANGE) continue
        const d = Math.max(Math.sqrt(d2), 5)
        const f = (REPEL_K * opts.repel * alpha) / d
        const fx = (dx / d) * f
        const fy = (dy / d) * f
        a.vx -= fx
        a.vy -= fy
        b.vx += fx
        b.vy += fy
      }
    }

    // Springs.
    for (const l of links) {
      let dx = l.t.x - l.s.x
      let dy = l.t.y - l.s.y
      let d = Math.sqrt(dx * dx + dy * dy)
      if (d === 0) {
        dx = 0.01
        dy = 0.01
        d = Math.sqrt(dx * dx + dy * dy)
      }
      const pull = ((d - opts.linkDistance) / d) * LINK_K * l.strength * alpha
      const fx = dx * pull
      const fy = dy * pull
      l.s.vx += fx
      l.s.vy += fy
      l.t.vx -= fx
      l.t.vy -= fy
    }

    // Gravity toward the middle, integration, damping.
    for (const b of bodies) {
      if (b.fixed) {
        b.vx = 0
        b.vy = 0
        continue
      }
      b.vx -= b.x * CENTER_K * alpha
      b.vy -= b.y * CENTER_K * alpha
      b.vx *= DAMPING
      b.vy *= DAMPING
      b.x += b.vx
      b.y += b.vy
    }

    alpha += (0 - alpha) * ALPHA_DECAY
    if (alpha < ALPHA_MIN) alpha = 0
  }

  return {
    sync,
    setOptions(o) {
      Object.assign(opts, o)
    },
    reheat(a = 0.5) {
      alpha = Math.max(alpha, Math.min(1, Math.max(0, a)))
    },
    pin(id, x, y) {
      const b = index.get(id)
      if (!b) return
      b.fixed = true
      if (x !== undefined) b.x = x
      if (y !== undefined) b.y = y
      b.vx = 0
      b.vy = 0
    },
    release(id) {
      const b = index.get(id)
      if (b) b.fixed = false
    },
    step,
    settled: () => alpha < ALPHA_MIN,
    alpha: () => alpha,
    size: () => bodies.length,
    position(id) {
      const b = index.get(id)
      return b ? { x: b.x, y: b.y } : undefined
    },
    positions: () => bodies.map(b => ({ id: b.id, x: b.x, y: b.y })),
  }
}
