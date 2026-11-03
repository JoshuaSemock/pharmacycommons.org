import { describe, expect, it } from 'vitest'
import { addRelations, branchOf, classTypesPresent, collapse, defaultFilters, emptyGraph, hasMore, isNonCore, kindsPresent, mergePayload, nonCoreCount, parsePayload, parseRelations, relationsOf, visibleGraph } from './model'
import type { NetworkEdge, NetworkNode, NetworkPayload } from './model'

const node = (pcid: number, name: string, entity_type = 'moiety', class_type: string | null = null): NetworkNode => ({
  pcid,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  entity_type,
  class_type,
})
const edge = (id: string, subject: number, predicate: string, object: number, group: NetworkEdge['group'], extra: Partial<NetworkEdge> = {}): NetworkEdge => ({
  id,
  subject,
  predicate,
  object,
  group,
  evidence_level: null,
  source_agency: null,
  source_doc_id: null,
  direct: true,
  community: false,
  basis: null,
  ...extra,
})
const payload = (center: NetworkNode, nodes: NetworkNode[], edges: NetworkEdge[], extra: Partial<NetworkPayload> = {}): NetworkPayload => ({
  center,
  nodes: [center, ...nodes],
  edges,
  group_counts: {},
  total: edges.length,
  offset: 0,
  limit: 40,
  ...extra,
})

const metformin = node(1001923, 'metformin')
const biguanides = node(5000100, 'Biguanides', 'class', 'epc')
const antidiabetic = node(5000200, 'Antidiabetic agents', 'class', 'atc')
const janumet = node(2000010, 'sitagliptin; metformin', 'combination')

const rootPayload = payload(
  metformin,
  [biguanides, janumet],
  [
    edge('cm:5000100:1001923', 1001923, 'member_of', 5000100, 'classification', { basis: 'rxcui' }),
    edge('cs:9', 2000010, 'has_component', 1001923, 'composition', { source_agency: 'FDA' }),
  ],
  { group_counts: { classification: 1, composition: 1 } },
)

describe('parsePayload', () => {
  it('keeps well-formed rows and drops malformed ones', () => {
    const p = parsePayload({
      center: { pcid: 1, slug: 'a', name: 'A', entity_type: 'moiety' },
      nodes: [{ pcid: 1, slug: 'a', name: 'A', entity_type: 'moiety' }, { pcid: 'x' }, null, 5],
      edges: [
        { id: 'cs:1', subject: 1, predicate: 'treats', object: 2, group: 'use' },
        { id: 'cs:2', subject: 1, predicate: 'treats', object: 2, group: 'made-up-group' },
        { subject: 1 },
      ],
      group_counts: { use: 1, bogus: 3, safety: 'many' },
      total: 1,
    })
    expect(p.nodes).toHaveLength(1)
    expect(p.edges.map(e => e.id)).toEqual(['cs:1'])
    expect(p.group_counts).toEqual({ use: 1 })
  })

  it('survives garbage without throwing', () => {
    for (const bad of [null, undefined, 'x', 42, [], {}]) {
      const p = parsePayload(bad)
      expect(p.center).toBeNull()
      expect(p.edges).toEqual([])
    }
  })

  it('treats missing evidence fields as null, not as an error', () => {
    const p = parsePayload({ edges: [{ id: 'cm:1:2', subject: 2, predicate: 'member_of', object: 1, group: 'classification' }] })
    expect(p.edges[0]).toMatchObject({ evidence_level: null, source_agency: null, community: false, direct: true })
  })
})

describe('mergePayload', () => {
  it('builds the root graph', () => {
    const g = mergePayload(emptyGraph(), rootPayload, 1001923, true)
    expect(g.root).toBe(1001923)
    expect(g.nodes.size).toBe(3)
    expect(g.edges.size).toBe(2)
    expect(g.introducedBy.get(1001923)).toBeNull()
    expect(g.introducedBy.get(5000100)).toBe(1001923)
  })

  it('does not duplicate nodes or edges when neighborhoods overlap', () => {
    let g = mergePayload(emptyGraph(), rootPayload, 1001923, true)
    // Expanding the class returns metformin again and the class's other member.
    const sitagliptin = node(1002000, 'sitagliptin')
    g = mergePayload(
      g,
      payload(biguanides, [metformin, sitagliptin], [
        edge('cm:5000100:1001923', 1001923, 'member_of', 5000100, 'classification'),
        edge('cm:5000100:1002000', 1002000, 'member_of', 5000100, 'classification'),
      ]),
      5000100,
    )
    expect(g.nodes.size).toBe(4)
    expect(g.edges.size).toBe(3)
    expect([...g.edges.keys()].sort()).toEqual(['cm:5000100:1001923', 'cm:5000100:1002000', 'cs:9'])
  })

  it('keeps the first copy of an edge (state is not rewritten by a later payload)', () => {
    let g = mergePayload(emptyGraph(), rootPayload, 1001923, true)
    g = mergePayload(g, payload(biguanides, [metformin], [edge('cs:9', 2000010, 'has_component', 1001923, 'composition', { source_agency: 'CHANGED' })]), 5000100)
    expect(g.edges.get('cs:9')?.source_agency).toBe('FDA')
  })

  it('drops an edge whose end was never delivered', () => {
    const g = mergePayload(emptyGraph(), payload(metformin, [], [edge('cs:1', 1001923, 'treats', 999, 'use')]), 1001923, true)
    expect(g.edges.size).toBe(0)
  })

  it('records paging so "show more" resumes where it stopped', () => {
    let g = mergePayload(emptyGraph(), payload(biguanides, [], [], { total: 130, offset: 0, limit: 40, edges: [] }), 5000100, true)
    expect(hasMore(g, 5000100)).toBe(130)
    const members = Array.from({ length: 40 }, (_, i) => node(1100000 + i, `drug ${i}`))
    g = mergePayload(
      g,
      payload(biguanides, members, members.map(m => edge(`cm:5000100:${m.pcid}`, m.pcid, 'member_of', 5000100, 'classification')), { total: 130, offset: 0 }),
      5000100,
    )
    expect(g.expanded.get(5000100)?.shown).toBe(40)
    expect(hasMore(g, 5000100)).toBe(90)
  })
})

describe('collapse', () => {
  it('removes the branch a node brought in, keeps the root and its own edges to the root', () => {
    let g = mergePayload(emptyGraph(), rootPayload, 1001923, true)
    const sitagliptin = node(1002000, 'sitagliptin')
    const glipizide = node(1003000, 'glipizide')
    g = mergePayload(g, payload(biguanides, [sitagliptin], [edge('cm:5000100:1002000', 1002000, 'member_of', 5000100, 'classification')]), 5000100)
    g = mergePayload(g, payload(sitagliptin, [glipizide], [edge('cs:50', 1003000, 'interacts_with', 1002000, 'interaction')]), 1002000)

    expect([...branchOf(g, 5000100)].sort()).toEqual([1002000, 1003000])
    const c = collapse(g, 5000100)
    expect(c.nodes.has(1002000)).toBe(false)
    expect(c.nodes.has(1003000)).toBe(false)
    expect(c.nodes.has(1001923)).toBe(true)
    expect(c.nodes.has(5000100)).toBe(true)
    expect(c.edges.has('cs:9')).toBe(true)
    expect(c.edges.has('cs:50')).toBe(false)
    expect(c.expanded.has(5000100)).toBe(false)
    expect(g.nodes.has(1002000)).toBe(true) // the old state is untouched
  })

  it('never removes the root', () => {
    const g = mergePayload(emptyGraph(), rootPayload, 1001923, true)
    const c = collapse(g, 1001923)
    expect(c.nodes.has(1001923)).toBe(true)
    expect(c.nodes.size).toBe(1)
  })
})

describe('visibleGraph', () => {
  const full = (() => {
    let g = mergePayload(emptyGraph(), rootPayload, 1001923, true)
    const lactic = node(6000010, 'Lactic acidosis', 'clinical')
    const dolutegravir = node(1002000, 'dolutegravir')
    g = mergePayload(
      g,
      payload(metformin, [lactic, dolutegravir], [
        edge('cs:30', 1001923, 'has_warning', 6000010, 'safety', { evidence_level: 'curator_assertion' }),
        edge('co:1', 1001923, 'interacts_with', 1002000, 'interaction', { community: true, evidence_level: 'contributor' }),
      ]),
      1001923,
    )
    return g
  })()

  it('hides contributor edges by default and shows them on request', () => {
    expect(visibleGraph(full, defaultFilters()).edges.some(e => e.community)).toBe(false)
    expect(visibleGraph(full, { ...defaultFilters(), includeCommunity: true }).edges.some(e => e.community)).toBe(true)
  })

  it('hides a group without deleting it, and orphaned nodes go with it', () => {
    const f = { ...defaultFilters(), groups: new Set(['classification', 'composition'] as const) }
    const v = visibleGraph(full, f)
    expect(v.edges.every(e => e.group !== 'safety')).toBe(true)
    expect(v.nodes.some(n => n.name === 'Lactic acidosis')).toBe(false)
    expect(full.edges.has('cs:30')).toBe(true)
    expect(visibleGraph(full, defaultFilters()).nodes.some(n => n.name === 'Lactic acidosis')).toBe(true)
  })

  it('hides a kind of node, but never the root', () => {
    const v = visibleGraph(full, { ...defaultFilters(), hiddenKinds: new Set(['class', 'moiety']) })
    expect(v.nodes.some(n => n.pcid === 1001923)).toBe(true)
    expect(v.nodes.some(n => n.entity_type === 'class')).toBe(false)
  })

  it('hides a classification system without deleting it', () => {
    const g = mergePayload(
      emptyGraph(),
      payload(metformin, [biguanides, antidiabetic], [
        edge('cm:5000100:1001923', 1001923, 'member_of', 5000100, 'classification'),
        edge('cm:5000200:1001923', 1001923, 'member_of', 5000200, 'classification'),
      ]),
      1001923,
      true,
    )
    expect(classTypesPresent(g)).toEqual(['atc', 'epc'])
    const v = visibleGraph(g, { ...defaultFilters(), hiddenClassTypes: new Set(['atc']) })
    expect(v.nodes.map(n => n.name).sort()).toEqual(['Biguanides', 'metformin'])
    expect(v.edges.map(e => e.id)).toEqual(['cm:5000100:1001923'])
    expect(g.nodes.has(5000200)).toBe(true)
  })

  it('keeps the root when every edge is filtered out', () => {
    const v = visibleGraph(full, { ...defaultFilters(), groups: new Set() })
    expect(v.edges).toEqual([])
    expect(v.nodes.map(n => n.pcid)).toEqual([1001923])
  })

  it('lists the kinds present, by readable name', () => {
    expect(new Set(kindsPresent(full))).toEqual(new Set(['moiety', 'class', 'combination', 'clinical']))
  })
})

describe('relationsOf', () => {
  const g = mergePayload(emptyGraph(), rootPayload, 1001923, true)

  it('reads outgoing and incoming edges in the right direction', () => {
    const rows = relationsOf(g, 1001923, defaultFilters())
    const out = rows.find(r => r.edge.id === 'cm:5000100:1001923')
    const incoming = rows.find(r => r.edge.id === 'cs:9')
    expect(out).toMatchObject({ direction: 'out', phrase: 'is a member of' })
    expect(out?.other.name).toBe('Biguanides')
    expect(incoming).toMatchObject({ direction: 'in', phrase: 'is a component of' })
    expect(incoming?.other.name).toBe('sitagliptin; metformin')
  })

  it('reads the same edge from the other end', () => {
    const rows = relationsOf(g, 5000100, defaultFilters())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ direction: 'in', phrase: 'has member' })
  })

  it('orders by group, then name', () => {
    const rows = relationsOf(g, 1001923, defaultFilters())
    expect(rows.map(r => r.edge.group)).toEqual(['classification', 'composition'])
  })

  it('follows the same filters as the canvas', () => {
    const rows = relationsOf(g, 1001923, { ...defaultFilters(), groups: new Set(['composition'] as const) })
    expect(rows.map(r => r.edge.id)).toEqual(['cs:9'])
  })
})

describe('list-membership edges', () => {
  it('parses the lists group and keeps a list as a node of its own kind', () => {
    const p = parsePayload({
      center: { pcid: 1000240, slug: 'oxybutynin', name: 'Oxybutynin', entity_type: 'moiety' },
      nodes: [
        { pcid: 1000240, slug: 'oxybutynin', name: 'Oxybutynin', entity_type: 'moiety' },
        { pcid: 10000034, slug: 'anticholinergic-burden', name: 'Anticholinergic Burden', entity_type: 'list' },
      ],
      edges: [{ id: 'li:10000034:1000240', subject: 1000240, predicate: 'on_list', object: 10000034, group: 'lists', basis: 'curated list' }],
      group_counts: { lists: 9 },
      total: 9,
    })
    expect(p.edges).toHaveLength(1)
    expect(p.edges[0].group).toBe('lists')
    expect(p.group_counts.lists).toBe(9)
    expect(kindsPresent(mergePayload(emptyGraph(), p, 1000240, true))).toContain('list')
  })
})

describe('non-core moiety filter', () => {
  const salt = { ...node(1000900, 'metformin hydrochloride'), term_type: 'Salt form' }
  const core = { ...node(1000901, 'glipizide'), term_type: 'Core moiety' }
  const g = mergePayload(
    emptyGraph(),
    payload(metformin, [salt, core, biguanides], [
      edge('cs:1', 1001923, 'has_component', 1000900, 'composition'),
      edge('cs:2', 1001923, 'interacts_with', 1000901, 'interaction'),
      edge('cm:5000100:1001923', 1001923, 'member_of', 5000100, 'classification'),
    ]),
    1001923,
    true,
  )

  it('recognises only moiety records whose term_type is not Core moiety', () => {
    expect(isNonCore(salt)).toBe(true)
    expect(isNonCore(core)).toBe(false)
    expect(isNonCore(biguanides)).toBe(false)
    expect(isNonCore({ ...salt, term_type: null })).toBe(false)
    expect(isNonCore({ ...salt, entity_type: 'combination' })).toBe(false)
    expect(nonCoreCount(g)).toBe(1)
  })

  it('hides them only when asked, without deleting them, and never hides the root', () => {
    expect(visibleGraph(g, defaultFilters()).nodes.map(n => n.pcid)).toContain(1000900)
    const v = visibleGraph(g, { ...defaultFilters(), hideNonCore: true })
    expect(v.nodes.map(n => n.pcid)).not.toContain(1000900)
    expect(v.edges.map(e => e.id)).not.toContain('cs:1')
    expect(g.nodes.has(1000900)).toBe(true)
    const rootSalt = { ...salt }
    const solo = mergePayload(emptyGraph(), payload(rootSalt, [], []), 1000900, true)
    expect(visibleGraph(solo, { ...defaultFilters(), hideNonCore: true }).nodes.map(n => n.pcid)).toEqual([1000900])
  })

  it('reads term_type from the payload', () => {
    const p = parsePayload({ nodes: [{ pcid: 1, slug: 'a', name: 'A', entity_type: 'moiety', term_type: 'Brand / proprietary formulation' }] })
    expect(p.nodes[0].term_type).toBe('Brand / proprietary formulation')
  })
})

describe('paged relations', () => {
  const row = {
    edge: { id: 'cm:5000100:1001923', subject: 1001923, predicate: 'member_of', object: 5000100, group: 'classification', direct: true, community: false },
    node: { pcid: 5000100, slug: 'biguanides', name: 'Biguanides', entity_type: 'class', class_type: 'epc' },
    outgoing: true,
  }

  it('parses rows and counts, dropping malformed rows', () => {
    const page = parseRelations({ rows: [row, { edge: { id: 'x' }, node: {} }, 'nope'], group_counts: { classification: 38, bogus: 3 }, total: 38, offset: 25, limit: 25 })
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0].outgoing).toBe(true)
    expect(page.group_counts).toEqual({ classification: 38 })
    expect([page.total, page.offset, page.limit]).toEqual([38, 25, 25])
    expect(parseRelations(null)).toEqual({ rows: [], group_counts: {}, total: 0, offset: 0, limit: 0 })
  })

  it('adds chosen rows under the browsed concept and leaves its counters alone', () => {
    const start = mergePayload(emptyGraph(), payload(metformin, [], [], { total: 80 }), 1001923, true)
    const page = parseRelations({ rows: [row] })
    const next = addRelations(start, 1001923, page.rows)
    expect(next.nodes.has(5000100)).toBe(true)
    expect(next.edges.has('cm:5000100:1001923')).toBe(true)
    expect(next.introducedBy.get(5000100)).toBe(1001923)
    expect(next.expanded.get(1001923)).toEqual(start.expanded.get(1001923))
    expect(addRelations(next, 1001923, page.rows).edges.size).toBe(1)
    // collapsing the browsed concept takes the added branch away like any other
    expect(collapse(next, 1001923).nodes.has(5000100)).toBe(false)
  })

  it('ignores rows for a concept that is not on the graph', () => {
    const start = mergePayload(emptyGraph(), payload(metformin, [], []), 1001923, true)
    expect(addRelations(start, 42, parseRelations({ rows: [row] }).rows)).toBe(start)
  })
})
