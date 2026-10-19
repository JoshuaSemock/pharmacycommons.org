import { describe, expect, it } from 'vitest'
import { DEEP_PAGE, MAX_DEPTH, NODE_CAP, currentDepth, frontierAt, nodeDepths, pruneToDepth } from './depth'
import { emptyGraph, mergePayload } from './model'
import type { NetworkEdge, NetworkNode, NetworkPayload } from './model'

const n = (pcid: number, name: string, entity_type = 'moiety'): NetworkNode => ({ pcid, slug: name, name, entity_type, class_type: null })
const e = (id: string, subject: number, object: number, group: NetworkEdge['group'], predicate = 'has_warning'): NetworkEdge => ({
  id, subject, object, predicate, group, evidence_level: null, source_agency: null, source_doc_id: null, direct: true, community: false, basis: null,
})
const payload = (center: NetworkNode, nodes: NetworkNode[], edges: NetworkEdge[], total = edges.length): NetworkPayload => ({
  center, nodes, edges, group_counts: {}, total, offset: 0, limit: 40,
})

// root 1 → class 10 (classification), warning 20 (safety), product 30 (composition); 20 → 21; 10 → 11
const A = n(1, 'root')
const CLS = n(10, 'Zeta class', 'class')
const WARN = n(20, 'Warning', 'clinical')
const PROD = n(30, 'Alpha product', 'combination')
const level2a = n(21, 'Deeper clinical', 'clinical')
const level2b = n(11, 'Class sibling', 'moiety')

function build() {
  let g = mergePayload(emptyGraph(), payload(A, [A, CLS, WARN, PROD], [
    e('cm:10:1', 1, 10, 'classification', 'member_of'),
    e('cs:1', 1, 20, 'safety'),
    e('cs:2', 30, 1, 'composition', 'has_component'),
  ]), 1, true)
  g = mergePayload(g, payload(WARN, [WARN, level2a], [e('cs:3', 20, 21, 'safety', 'has_risk_factor')]), 20)
  g = mergePayload(g, payload(CLS, [CLS, level2b], [e('cm:10:11', 11, 10, 'classification', 'member_of')]), 10)
  return g
}

describe('depth limits', () => {
  it('keeps deep expansion bounded', () => {
    expect(MAX_DEPTH).toBe(3)
    expect(NODE_CAP).toBe(150)
    expect(DEEP_PAGE).toBeLessThanOrEqual(10)
  })
})

describe('nodeDepths and currentDepth', () => {
  it('counts steps from the starting concept by who introduced whom', () => {
    const d = nodeDepths(build())
    expect(d.get(1)).toBe(0)
    expect([10, 20, 30].map(x => d.get(x))).toEqual([1, 1, 1])
    expect([21, 11].map(x => d.get(x))).toEqual([2, 2])
  })

  it('reports the deepest level drawn, and 0 for an empty graph', () => {
    expect(currentDepth(build())).toBe(2)
    expect(currentDepth(emptyGraph())).toBe(0)
    expect(nodeDepths(emptyGraph()).size).toBe(0)
  })
})

describe('pruneToDepth', () => {
  it('removes everything deeper, with its lines, and keeps the rest', () => {
    const g = pruneToDepth(build(), 1)
    expect([...g.nodes.keys()].sort((a, b) => a - b)).toEqual([1, 10, 20, 30])
    expect([...g.edges.keys()].sort()).toEqual(['cm:10:1', 'cs:1', 'cs:2'])
    expect(currentDepth(g)).toBe(1)
  })

  it('forgets that the concepts at the new depth were expanded, so they can be expanded again', () => {
    const before = build()
    expect(before.expanded.has(20)).toBe(true)
    const g = pruneToDepth(before, 1)
    expect(g.expanded.has(20)).toBe(false)
    expect(g.expanded.has(10)).toBe(false)
    expect(g.expanded.has(1)).toBe(true) // the starting concept stays expanded
  })

  it('does nothing when the graph is already no deeper', () => {
    const g = build()
    const same = pruneToDepth(g, 2)
    expect([...same.nodes.keys()].sort()).toEqual([...g.nodes.keys()].sort())
  })
})

describe('frontierAt', () => {
  it('lists unexpanded concepts at a level, specific lines before class memberships', () => {
    const g = mergePayload(emptyGraph(), payload(A, [A, CLS, WARN, PROD], [
      e('cm:10:1', 1, 10, 'classification', 'member_of'),
      e('cs:1', 1, 20, 'safety'),
      e('cs:2', 30, 1, 'composition', 'has_component'),
    ]), 1, true)
    // Alphabetical among the specific ones (Alpha product, Warning), the class last despite "Zeta".
    expect(frontierAt(g, 1)).toEqual([30, 20, 10])
  })

  it('leaves out concepts that were already expanded, and other levels', () => {
    const g = build()
    expect(frontierAt(g, 1)).toEqual([30]) // 20 and 10 were expanded
    expect(frontierAt(g, 2).sort()).toEqual([11, 21])
    expect(frontierAt(g, 3)).toEqual([])
  })
})
