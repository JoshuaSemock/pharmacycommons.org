import { describe, expect, it } from 'vitest'
import { compareGraph, linkPhrase, mergeRows, orderSets, parseCompare, parseCompareParam, setKey, setKind, setTitle } from './compare'
import type { CompareRow, CompareSet } from './compare'
import type { NetworkEdge, NetworkNode } from './model'

const node = (pcid: number, name: string, entity_type = 'class'): NetworkNode => ({ pcid, slug: name.toLowerCase(), name, entity_type, class_type: null })
const edge = (id: string, subject: number, object: number, predicate = 'member_of', group = 'classification') => ({
  id, subject, predicate, object, group, direct: true, community: false,
})
const typed = (id: string, subject: number, object: number, predicate: string, group: NetworkEdge['group']): NetworkEdge => ({
  id, subject, predicate, object, group, evidence_level: null, source_agency: null, source_doc_id: null, direct: true, community: false, basis: null,
})
const metformin = node(1001923, 'metformin', 'moiety')
const empa = node(1001318, 'empagliflozin', 'moiety')
const entities = [metformin, empa]

const raw = {
  pcids: [1001318, 1001923],
  entities: [empa, metformin],
  between: [],
  sets: [
    { members: [1001318], count: 36, groups: { classification: 34, composition: 2 } },
    { members: [1001318, 1001923], count: 13, groups: { classification: 7, lists: 3, composition: 3 } },
    { members: [1001923], count: 43, groups: { lists: 6 } },
  ],
  rows: [
    {
      members: [1001318, 1001923],
      group: 'lists',
      node: node(10000001, 'Notable Drugs', 'list'),
      links: [
        { src: 1001318, outgoing: true, edge: edge('li:10000001:1001318', 1001318, 10000001, 'on_list', 'lists') },
        { src: 1001923, outgoing: true, edge: edge('li:10000001:1001923', 1001923, 10000001, 'on_list', 'lists') },
      ],
    },
    { members: [1001923], group: 'bogus', node: node(5, 'x'), links: [] },
    { members: [1001923], group: 'classification', node: node(5000100, 'Biguanides'), links: [{ src: 1001923, outgoing: true, edge: edge('cm:5000100:1001923', 1001923, 5000100) }] },
  ],
}

describe('parseCompare', () => {
  it('reads sets, rows and links, dropping malformed rows', () => {
    const p = parseCompare(raw)!
    expect(p.pcids).toEqual([1001318, 1001923])
    expect(p.sets).toHaveLength(3)
    expect(p.rows.map(r => r.node.name)).toEqual(['Notable Drugs', 'Biguanides'])
    expect(p.rows[0].links).toHaveLength(2)
  })

  it('returns null for anything that is not a comparison', () => {
    expect(parseCompare(null)).toBeNull()
    expect(parseCompare('x')).toBeNull()
    expect(parseCompare({ pcids: [1] })).toBeNull()
  })
})

describe('set helpers', () => {
  it('names sets for two concepts', () => {
    expect(setTitle([1001318, 1001923], entities)).toBe('In common: empagliflozin and metformin')
    expect(setTitle([1001923], entities)).toBe('Only metformin')
  })

  it('names sets for three or more', () => {
    const three = [...entities, node(1000577, 'acetazolamide', 'moiety')]
    expect(setTitle([1000577, 1001318, 1001923], three)).toBe('In common to all')
    expect(setTitle([1001318, 1001923], three)).toBe('Shared by empagliflozin and metformin')
    expect(setTitle([1000577, 1001318], three)).toBe('Shared by acetazolamide and empagliflozin')
    expect(setKind([1001923], 3)).toBe('only')
    expect(setKind([1, 2], 3)).toBe('some')
    expect(setKind([1, 2, 3], 3)).toBe('all')
  })

  it('orders shared sets first, then each concept in the order it was picked', () => {
    const sets: CompareSet[] = [
      { members: [1001923], count: 1, groups: {} },
      { members: [1001318], count: 1, groups: {} },
      { members: [1001318, 1001923], count: 1, groups: {} },
    ]
    expect(orderSets(sets, [1001923, 1001318]).map(s => setKey(s.members))).toEqual(['1001318,1001923', '1001923', '1001318'])
  })

  it('states a link from the compared concept’s side', () => {
    const p = parseCompare(raw)!
    expect(linkPhrase(p.rows[1].links[0], p.entities)).toMatch(/^metformin /)
  })
})

describe('parseCompareParam', () => {
  it('accepts PCID codes and digits, drops junk and repeats, and stops at four', () => {
    expect(parseCompareParam('PCID-1001923,1001318,1001923,abc,12')).toEqual([1001923, 1001318])
    expect(parseCompareParam('1000001,1000002,1000003,1000004,1000005')).toEqual([1000001, 1000002, 1000003, 1000004])
    expect(parseCompareParam(null)).toEqual([])
  })
})

describe('mergeRows and compareGraph', () => {
  const p = parseCompare(raw)!
  it('adds rows once per set', () => {
    expect(mergeRows(p.rows, p.rows)).toHaveLength(2)
    const other: CompareRow = { ...p.rows[1], members: [1001318] }
    expect(mergeRows(p.rows, [other])).toHaveLength(3)
  })

  it('draws the compared concepts, loaded concepts and their lines, never a dangling one', () => {
    const g = compareGraph(p.entities, p.rows, [typed('cs:1', 1001923, 1001318, 'interacts_with', 'interaction'), typed('cs:2', 1001923, 999, 'x', 'interaction')])
    expect(g.nodes.map(n => n.name).sort()).toEqual(['Biguanides', 'Notable Drugs', 'empagliflozin', 'metformin'])
    expect(g.edges.map(e => e.id).sort()).toEqual(['cm:5000100:1001923', 'cs:1', 'li:10000001:1001318', 'li:10000001:1001923'])
  })
})
