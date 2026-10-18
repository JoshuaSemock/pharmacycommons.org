// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Visible } from './model'

// A tiny stand-in for Cytoscape that records what the canvas asks of it.
type Def = { data: Record<string, unknown>; position?: { x: number; y: number }; classes?: string }
class FakeEl {
  classes = new Set<string>()
  constructor(public def: Def, public cy: FakeCy) {}
  id() { return String(this.def.data.id) }
  position() { return this.def.position ?? { x: 0, y: 0 } }
  isNode() { return !('source' in this.def.data) }
  addClass(c: string) { c.split(' ').forEach(x => this.classes.add(x)); return this }
  removeClass(c: string) { c.split(' ').forEach(x => this.classes.delete(x)); return this }
  toggleClass(c: string, on: boolean) { return on ? this.addClass(c) : this.removeClass(c) }
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
  not() { return new FakeColl([]) }
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
  style() { return this }
  batch(fn: () => void) { fn() }
  elements() { return new FakeColl([...this.els.values()]) }
  nodes() { return new FakeColl([...this.els.values()].filter(e => e.isNode())) }
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
  position() { return { x: 0, y: 0 } }
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
  onSelectNode: vi.fn(), onSelectEdge: vi.fn(), onClear: vi.fn(), onStatus: vi.fn(), label: 'test graph',
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
})
