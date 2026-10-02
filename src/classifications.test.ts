import { describe, expect, it } from 'vitest'
import type { ClassMember, ClassRow } from './classifications'
import { computeOverlap, groupFromParams, matchScore, parseSelection, searchClasses } from './classifications'

function row(p: Partial<ClassRow> & { name: string }): ClassRow {
  return {
    slug: p.name.toLowerCase().replace(/\W+/g, '-'),
    class_type: 'epc',
    class_type_label: 'Pharmacologic class (FDA EPC)',
    source_code: null,
    level: null,
    member_count: 1,
    ...p,
  }
}

function member(pcid: number, name: string, is_direct = true): ClassMember {
  return { pcid, slug: name.toLowerCase(), name, entity_type: 'moiety', is_direct }
}

describe('matchScore', () => {
  it('ranks an exact code with an exact name, and a code prefix next', () => {
    const atc = row({ name: 'Selective serotonin reuptake inhibitors', source_code: 'N06AB', class_type: 'atc' })
    expect(matchScore(atc, 'n06ab')).toBe(0)
    expect(matchScore(atc, 'N06')).toBe(1)
  })

  it('prefers a name prefix over a word inside the name', () => {
    expect(matchScore(row({ name: 'Kinase Inhibitor' }), 'kinase')).toBe(2)
    expect(matchScore(row({ name: 'Protein Kinase Inhibitors' }), 'kinase')).toBe(3)
  })

  it('matches every query word in any order', () => {
    expect(matchScore(row({ name: 'Blood glucose lowering drugs, excl. insulins' }), 'insulins glucose')).toBe(4)
  })

  it('returns null for no match or an empty query', () => {
    expect(matchScore(row({ name: 'Antibacterials for systemic use' }), 'kinase')).toBeNull()
    expect(matchScore(row({ name: 'Anything' }), '  ')).toBeNull()
  })

  it('treats regex characters in the query literally', () => {
    expect(matchScore(row({ name: 'Calcium (Ca2+) channel blocker' }), '(ca2+)')).toBe(3)
  })
})

describe('searchClasses', () => {
  it('orders by score, then by member count', () => {
    const rows = [
      row({ name: 'Protein Kinase Inhibitors', member_count: 90 }),
      row({ name: 'Kinase Inhibitor', member_count: 5 }),
      row({ name: 'Tyrosine kinase inhibitors', member_count: 40, class_type: 'curated' }),
      row({ name: 'Opioid Agonist' }),
    ]
    expect(searchClasses(rows, 'kinase').map(r => r.name)).toEqual([
      'Kinase Inhibitor',
      'Protein Kinase Inhibitors',
      'Tyrosine kinase inhibitors',
    ])
  })
})

describe('groupFromParams', () => {
  it('reads ?group= and maps the old ?type= links', () => {
    expect(groupFromParams(new URLSearchParams('group=chemont'))).toBe('chemont')
    expect(groupFromParams(new URLSearchParams('type=moa'))).toBe('fda')
    expect(groupFromParams(new URLSearchParams('type=atc'))).toBe('atc')
    expect(groupFromParams(new URLSearchParams('group=nope'))).toBe('all')
    expect(groupFromParams(new URLSearchParams(''))).toBe('all')
  })
})

describe('parseSelection', () => {
  it('keeps at most three distinct slugs', () => {
    expect(parseSelection('a, b,a,,c,d')).toEqual(['a', 'b', 'c'])
    expect(parseSelection(null)).toEqual([])
  })
})

describe('computeOverlap', () => {
  const a = { members: [member(1, 'Metformin'), member(2, 'Glipizide'), member(3, 'Insulin glargine')] }
  const b = { members: [member(2, 'Glipizide'), member(3, 'Insulin glargine', false), member(4, 'Acarbose')] }
  const c = { members: [member(3, 'Insulin glargine'), member(5, 'Pramlintide')] }

  it('counts shared, unique and pairwise members', () => {
    const o = computeOverlap([a, b, c])
    expect(o.rows.map(r => r.name)).toEqual(['Acarbose', 'Glipizide', 'Insulin glargine', 'Metformin', 'Pramlintide'])
    expect(o.shared).toBe(1)
    expect(o.unique).toEqual([1, 1, 1])
    expect(o.pairs).toEqual([
      { a: 0, b: 1, shared: 2 },
      { a: 0, b: 2, shared: 1 },
      { a: 1, b: 2, shared: 1 },
    ])
  })

  it('keeps how each class holds the drug (direct or through a sub-class)', () => {
    const insulin = computeOverlap([a, b]).rows.find(r => r.pcid === 3)
    expect(insulin?.cells.map(m => m?.is_direct)).toEqual([true, false])
    expect(insulin?.inCount).toBe(2)
  })

  it('does not double count a drug listed twice in one class', () => {
    const o = computeOverlap([{ members: [member(1, 'X'), member(1, 'X')] }, { members: [member(1, 'X')] }])
    expect(o.rows[0].inCount).toBe(2)
    expect(o.shared).toBe(1)
  })
})
