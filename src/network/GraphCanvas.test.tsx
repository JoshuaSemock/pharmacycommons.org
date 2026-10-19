// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Visible } from './model'
import { defaultDisplay } from './display'
import type { Display } from './display'

// A tiny stand-in for Cytoscape that records what the canvas asks of it.
type Def = { data: Record<string, unknown>; position?: { x: number; y: number }; classes?: string }
class FakeEl {
  classes = new Set<string>()
  constructor(public def: Def, public cy: FakeCy) {}
  id() { return String(this.def.data.id) }
  position(): { x: number; y: number }
  position(p: { x: number; y: number }): this
  position(p?: { x: number; y: number }): { x: number; y: number } | this {
    if (p) { this.def.position = p; return this }
    return this.def.position ?? { x: 0, y: 0 }
  }
  data(k: string, v?: unknown) {
    if (v !== undefined) this.def.data[k] = v
    return this.def.data[k]
  }
  hasClass(c: string) { return this.classes.has(c) }
  grabbed() { return false }
  isNode() { return !('source' in this.def.data) }
  addClass(c: string) { c.split(' ').forEach(x => this.classes.add(x)); return this }
  removeClass(c: string) { c.split(' ').forEach(x => this.classes.delete(x)); return this }
  toggleClass(c: string, on?: boolean) { return (on ?? !this.classes.has(c)) ? this.addClass(c) : this.removeClass(c) }
  select() { return this }
  unselect() { return this }
  empty() { return false }
  nonempty() { return true }
  closedNeighborhood() { return new FakeColl([this]) }
  connectedEdges() { return new FakeColl([]) }
  connectedNodes() { return new FakeColl([]) }
}
class FakeColl {
  constructor(public items: FakeEl[]) {}
  get length() { return this.items.length }
  forEach(fn: (e: FakeEl) => void) { this.items.forEach(fn) }
  map<T>(fn: (e: FakeEl) => T) { return this.items.map(fn) }
  removeClass(c: string) { this.items.forEach(i => i.removeClass(c)); return this }
  unselect() { return this }
  not(other: FakeColl) { return new FakeColl(this.items.filter(i => !other.items.includes(i))) }
  union() { return this }
  addClass(c: string) { this.items.forEach(i => i.addClass(c)); return this }
  empty() { return this.items.length === 0 }
  nonempty() { return this.items.length > 0 }
}
class FakeCy {
  els = new Map<string, FakeEl>()
  handlers: { evt: string; sel?: string; fn: (e: unknown) => void }[] = []
  destroyed = false
  added: Def[] = []
  removed: string[] = []
  on(evt: string, a: unknown, b?: unknown) {
    const fn = (typeof a === 'function' ? a : b) as (e: unknown) => void
    this.handlers.push({ evt, sel: typeof a === 'string' ? a : undefined, fn })
  }
  style = vi.fn((_sheet?: unknown) => this)
  batch(fn: () => void) { fn() }
  elements() { return new FakeColl([...this.els.values()]) }
  nodes() { return new FakeColl([...this.els.values()].filter(e => e.isNode())) }
  edges() { return new FakeColl([...this.els.values()].filter(e => !e.isNode())) }
  add(def: Def) { const el = new FakeEl(def, this); this.els.set(el.id(), el); this.added.push(def); return el }
  remove(el: FakeEl) { this.els.delete(el.id()); this.removed.push(el.id()) }
  getElementById(id: string) { return this.els.get(id) ?? new MissingEl() }
  fit = vi.fn()
  center = vi.fn()
  layout = vi.fn(() => ({ run: vi.fn() }))
  destroy() { this.destroyed = true }
}
class MissingEl extends FakeEl {
  constructor() { super({ data: { id: '' } }, null as unknown as FakeCy) }
  empty() { return true }
  nonempty() { return false }
}

let created: FakeCy[] = []
vi.mock('cytoscape', () => ({
  default: () => {
    const cy = new FakeCy()
    created.push(cy)
    return cy
  },
}))

const { default: GraphCanvas } = await import('./GraphCanvas')

const n = (pcid: number, name = `n${pcid}`) => ({ pcid, slug: name, name, entity_type: 'moiety', class_type: null })
const e = (id: string, s: number, o: number) => ({
  id, subject: s, object: o, predicate: 'member_of', group: 'classification' as const,
  evidence_level: null, source_agency: null, source_doc_id: null, direct: true, community: false, basis: null,
})
const props = (visible: Visible) => ({
  visible, rootId: 1, selection: null, command: null,
  onSelectNode: vi.fn(), onSelectEdge: vi.fn(), onClear: vi.fn(), onStatus: vi.fn(), label: 'test graph', display: defaultDisplay(),
})

afterEach(() => { cleanup(); created = [] })

describe('GraphCanvas', () => {
  it('creates one Cytoscape instance, reports ready, and destroys it on unmount', async () => {
    const p = props({ nodes: [n(1)], edges: [] })
    const { unmount, getByTestId } = render(<GraphCanvas {...p} />)
    expect(getByTestId('network-canvas').getAttribute('aria-label')).toBe('test graph')
    await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
    expect(created).toHaveLength(1)
    unmount()
    expect(created[0].destroyed).toBe(true)
  })

  it('adds new elements without moving or re-adding the ones already drawn', async () => {
    const p = props({ nodes: [n(1)], edges: [] })
    const { rerender } = render(<GraphCanvas {...p} />)
    await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
    const cy = created[0]
    const rootPos = cy.els.get('1')?.position()

    rerender(<GraphCanvas {...p} visible={{ nodes: [n(1), n(2), n(3)], edges: [e('cm:1:2', 2, 1), e('cm:1:3', 3, 1)] }} />)
    await waitFor(() => expect(cy.els.size).toBe(5))
    expect(cy.added.filter(d => d.data.id === '1')).toHaveLength(1) // not re-added
    expect(cy.els.get('1')?.position()).toEqual(rootPos) // not moved
    const placed = ['2', '3'].map(id => cy.els.get(id)?.position())
    for (const pos of placed) expect(Math.hypot(pos!.x, pos!.y)).toBeGreaterThan(100) // ringed around the root
  })

  it('removes elements that leave the visible set (a filter), by id', async () => {
    const p = props({ nodes: [n(1), n(2)], edges: [e('cm:1:2', 2, 1)] })
    const { rerender } = render(<GraphCanvas {...p} />)
    await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
    const cy = created[0]
    expect(cy.els.size).toBe(3)
    rerender(<GraphCanvas {...p} visible={{ nodes: [n(1)], edges: [] }} />)
    await waitFor(() => expect(cy.els.size).toBe(1))
    expect(cy.removed.sort()).toEqual(['2', 'cm:1:2'])
  })

  it('does not draw an element twice when the same data is passed again', async () => {
    const v = { nodes: [n(1), n(2)], edges: [e('cm:1:2', 2, 1)] }
    const p = props(v)
    const { rerender } = render(<GraphCanvas {...p} />)
    await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
    const cy = created[0]
    const before = cy.added.length
    rerender(<GraphCanvas {...p} visible={{ nodes: [...v.nodes], edges: [...v.edges] }} />)
    expect(cy.added.length).toBe(before)
  })

  it('reports taps on nodes, lines and empty canvas', async () => {
    const p = props({ nodes: [n(1)], edges: [] })
    render(<GraphCanvas {...p} />)
    await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
    const cy = created[0]
    const tapNode = cy.handlers.find(h => h.evt === 'tap' && h.sel === 'node')
    const tapEdge = cy.handlers.find(h => h.evt === 'tap' && h.sel === 'edge')
    const tapBg = cy.handlers.find(h => h.evt === 'tap' && !h.sel)
    tapNode?.fn({ target: { id: () => '1' } })
    tapEdge?.fn({ target: { id: () => 'cm:1:2' } })
    tapBg?.fn({ target: cy })
    tapBg?.fn({ target: { id: () => 'x' } }) // a tap on an element is not a background tap
    expect(p.onSelectNode).toHaveBeenCalledWith(1)
    expect(p.onSelectEdge).toHaveBeenCalledWith('cm:1:2')
    expect(p.onClear).toHaveBeenCalledTimes(1)
  })

  it('runs fit and the tree layout on request', async () => {
    const p = props({ nodes: [n(1)], edges: [] })
    const { rerender } = render(<GraphCanvas {...p} />)
    await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
    const cy = created[0]
    cy.fit.mockClear()
    rerender(<GraphCanvas {...p} command={{ kind: 'fit', n: 1 }} />)
    await waitFor(() => expect(cy.fit).toHaveBeenCalled())
    rerender(<GraphCanvas {...p} command={{ kind: 'tree', n: 2 }} />)
    await waitFor(() => expect(cy.layout).toHaveBeenCalledWith(expect.objectContaining({ name: 'breadthfirst', animate: false })))
  })

  describe('display and physics', () => {
    const settle = async () => {
      // Run the queued animation frames to completion (bounded, so a bug cannot hang the test).
      for (let i = 0; i < 400 && frames.length > 0; i++) {
        const batch = frames.splice(0)
        batch.forEach(cb => cb(0))
      }
    }
    let frames: ((t: number) => void)[] = []
    beforeEach(() => {
      frames = []
      vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => frames.push(cb))
      vi.stubGlobal('cancelAnimationFrame', () => { frames = [] })
    })
    afterEach(() => vi.unstubAllGlobals())

    const hub = (count: number) => ({
      nodes: [n(1), ...Array.from({ length: count }, (_, i) => n(100 + i))],
      edges: Array.from({ length: count }, (_, i) => e(`cm:1:${100 + i}`, 100 + i, 1)),
    })
    const withDisplay = (patch: Partial<Display>) => ({ ...defaultDisplay(), ...patch })

    it('sizes concepts by their drawn connections, and keeps the starting concept at least its normal size', async () => {
      const p = props({ nodes: [n(1), n(2), n(3), n(4)], edges: [e('cm:1:2', 2, 1), e('cm:1:3', 3, 1), e('cm:1:4', 4, 1)] })
      render(<GraphCanvas {...p} />)
      await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
      const cy = created[0]
      const size = (id: string) => cy.els.get(id)?.def.data.size as number
      expect(size('1')).toBeGreaterThan(size('2'))
      expect(size('1')).toBeGreaterThanOrEqual(54)
      expect(size('2')).toBe(size('3'))
    })

    it('uses fixed sizes when size by connections is off, and updates drawn concepts when it changes', async () => {
      const p = props({ nodes: [n(1), n(2)], edges: [e('cm:1:2', 2, 1)] })
      const { rerender } = render(<GraphCanvas {...p} />)
      await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
      const cy = created[0]
      const before = cy.els.get('2')?.def.data.size
      rerender(<GraphCanvas {...p} display={withDisplay({ sizeByDegree: false })} />)
      await waitFor(() => expect(cy.els.get('2')?.def.data.size).toBe(38))
      expect(before).not.toBe(38)
      expect(cy.els.get('1')?.def.data.size).toBe(54)
    })

    it('fades everything but a hovered concept and its neighbors, and restores on mouse-out', async () => {
      const p = props({ nodes: [n(1), n(2)], edges: [e('cm:1:2', 2, 1)] })
      render(<GraphCanvas {...p} />)
      await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
      const cy = created[0]
      const over = cy.handlers.find(h => h.evt === 'mouseover' && h.sel === 'node')
      const out = cy.handlers.find(h => h.evt === 'mouseout' && h.sel === 'node')
      over?.fn({ target: cy.els.get('1') })
      expect(cy.els.get('1')?.classes.has('hfade')).toBe(false)
      expect(cy.els.get('2')?.classes.has('hfade')).toBe(true)
      expect(cy.els.get('cm:1:2')?.classes.has('hfade')).toBe(true)
      out?.fn({ target: cy.els.get('1') })
      expect([...cy.els.values()].some(el => el.classes.has('hfade'))).toBe(false)
    })

    it('does not fade on hover when focus on hover is off', async () => {
      const p = { ...props({ nodes: [n(1), n(2)], edges: [e('cm:1:2', 2, 1)] }), display: withDisplay({ hoverFocus: false }) }
      render(<GraphCanvas {...p} />)
      await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
      const cy = created[0]
      cy.handlers.find(h => h.evt === 'mouseover' && h.sel === 'node')?.fn({ target: cy.els.get('1') })
      expect(cy.els.get('2')?.classes.has('hfade')).toBe(false)
    })

    it('restyles when arrows, line width or text fade change', async () => {
      const p = props({ nodes: [n(1)], edges: [] })
      const { rerender } = render(<GraphCanvas {...p} />)
      await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
      const cy = created[0]
      cy.style.mockClear()
      rerender(<GraphCanvas {...p} display={withDisplay({ arrows: false, linkWidth: 3 })} />)
      await waitFor(() => expect(cy.style).toHaveBeenCalled())
      const sheet = cy.style.mock.calls.at(-1)?.[0] as unknown as { selector: string; style: Record<string, unknown> }[]
      const edge = sheet.find(r => r.selector === 'edge')?.style
      expect(edge?.['target-arrow-shape']).toBe('none')
      expect(edge?.width).toBe(3)
    })

    it('stays still when physics is off', async () => {
      const p = props(hub(5))
      render(<GraphCanvas {...p} />)
      await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
      expect(frames).toHaveLength(0)
    })

    it('with physics on, concepts move toward a settled layout and then it stops', async () => {
      const p = { ...props(hub(6)), display: withDisplay({ physics: true }) }
      render(<GraphCanvas {...p} />)
      await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
      const cy = created[0]
      const before = JSON.stringify([...cy.els.values()].filter(el => el.isNode()).map(el => el.position()))
      await waitFor(() => expect(frames.length).toBeGreaterThan(0))
      await settle()
      const after = JSON.stringify([...cy.els.values()].filter(el => el.isNode()).map(el => el.position()))
      expect(after).not.toBe(before)
      expect(frames).toHaveLength(0) // it settled and stopped asking for frames
      for (const el of cy.els.values()) if (el.isNode()) expect(Number.isFinite(el.position().x)).toBe(true)
    })

    it('never moves a pinned concept, and Release pinned lets it move again', async () => {
      const p = { ...props(hub(4)), display: withDisplay({ physics: true }) }
      const { rerender } = render(<GraphCanvas {...p} />)
      await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
      const cy = created[0]
      const leaf = cy.els.get('100')!
      const at = { ...leaf.position() }
      leaf.addClass('pinned')
      await settle()
      expect(leaf.position()).toEqual(at)
      rerender(<GraphCanvas {...p} command={{ kind: 'unpin', n: 1 }} />)
      await waitFor(() => expect(leaf.classes.has('pinned')).toBe(false))
    })

    it('double-tap pins and unpins a concept', async () => {
      const p = props(hub(2))
      render(<GraphCanvas {...p} />)
      await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
      const cy = created[0]
      const dbl = cy.handlers.find(h => h.evt === 'dbltap' && h.sel === 'node')
      const leaf = cy.els.get('100')!
      dbl?.fn({ target: leaf })
      expect(leaf.classes.has('pinned')).toBe(true)
      dbl?.fn({ target: leaf })
      expect(leaf.classes.has('pinned')).toBe(false)
    })

    it('holds still and says so when there are too many concepts for physics', async () => {
      const onPhysicsLimit = vi.fn()
      const p = { ...props(hub(310)), display: withDisplay({ physics: true }), onPhysicsLimit }
      render(<GraphCanvas {...p} />)
      await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
      await waitFor(() => expect(onPhysicsLimit).toHaveBeenCalledWith(true))
      expect(frames).toHaveLength(0)
    })

    it('settles in one go, with no animation frames, when the reader prefers reduced motion', async () => {
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {} }))
      const p = { ...props(hub(5)), display: withDisplay({ physics: true }) }
      render(<GraphCanvas {...p} />)
      await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
      const cy = created[0]
      await waitFor(() => {
        const moved = [...cy.els.values()].filter(el => el.isNode() && el.id() !== '1').some(el => Math.hypot(el.position().x, el.position().y) > 0)
        expect(moved).toBe(true)
      })
      expect(frames).toHaveLength(0)
    })

    it('Re-arrange shakes the layout instead of running one-shot cose while physics is on', async () => {
      const p = { ...props(hub(3)), display: withDisplay({ physics: true }) }
      const { rerender } = render(<GraphCanvas {...p} />)
      await waitFor(() => expect(p.onStatus).toHaveBeenCalledWith('ready'))
      const cy = created[0]
      await settle()
      rerender(<GraphCanvas {...p} command={{ kind: 'arrange', n: 1 }} />)
      await waitFor(() => expect(frames.length).toBeGreaterThan(0))
      expect(cy.layout).not.toHaveBeenCalled()
    })
  })
})
