import { describe, expect, it } from 'vitest'
import {
  buildIndex, osaDistance, searchAllLocal, searchNorm, similarity, trigramSet, wordSimilarity,
} from './staticSearch'
import type { SearchIndexFile } from './staticSearch'

// Values checked against Postgres (pg_trgm 1.6, public.osa_distance) on 2026-11-17.
describe('pg_trgm and osa_distance', () => {
  it('builds padded word trigrams', () => {
    expect(trigramSet('cat')).toEqual(['  c', ' ca', 'at ', 'cat'])
    expect(trigramSet('a-b')).toEqual(['  a', '  b', ' a ', ' b '])
  })
  it('matches similarity()', () => {
    expect(similarity('metformin', 'metfromin')).toBeCloseTo(0.42857143, 5)
    expect(similarity('word', 'two words')).toBeCloseTo(0.36363636, 5)
    expect(similarity('abc', 'xyz')).toBe(0)
  })
  it('matches word_similarity()', () => {
    expect(wordSimilarity('word', 'two words')).toBeCloseTo(0.8, 5)
    expect(wordSimilarity('lisin', 'lisinopril')).toBeCloseTo(0.8333333, 5)
  })
  it('counts an adjacent swap as one edit', () => {
    expect(osaDistance('metformin', 'metfromin')).toBe(1)
    expect(osaDistance('ab', 'ba')).toBe(1)
    expect(osaDistance('', 'abc')).toBe(3)
    expect(osaDistance('kitten', 'sitting')).toBe(3)
  })
  it('normalises like search_norm()', () => {
    expect(searchNorm('  Metformin HCl (ER)  ')).toBe('metformin hcl er')
    expect(searchNorm(null)).toBe('')
  })
})

const file: SearchIndexFile = {
  v: 1,
  types: ['moiety', 'class', 'combination'],
  srcs: ['name', 'brand', 'alias', 'code'],
  groups: [
    [1001923, 0, 'metformin', 'metformin', 1, [[0, 'metformin'], [1, 'Glucophage']]],
    [1010559, 0, 'merbromin', 'Merbromin', 1, [[0, 'Merbromin']]],
    [1001104, 0, 'lisinopril', 'lisinopril', 1, [[0, 'lisinopril'], [1, 'Zestril']]],
    [1001105, 0, 'lisinopril-dihydrate', 'lisinopril dihydrate', 0, [[0, 'lisinopril dihydrate']]],
    [5001326, 1, 'biguanides', 'Biguanides', 0, [[0, 'Biguanides'], [3, 'A10BA']]],
    [2000001, 2, 'lisinopril-hydrochlorothiazide', 'lisinopril / hydrochlorothiazide', 0,
      [[0, 'lisinopril / hydrochlorothiazide'], [1, 'Zestoretic']]],
  ],
}
const index = buildIndex(file)

describe('searchAllLocal (search_all)', () => {
  it('offers a typo guess when nothing matches by name', () => {
    const r = searchAllLocal(index, 'metfromin', 6)
    expect(r.fuzzy).toBe(true)
    expect(r.did_you_mean).toBe('metformin')
    expect(r.results[0]).toMatchObject({ pcid: 'PCID-1001923', slug: 'metformin', match: { on: 'fuzzy', score: 30 } })
  })

  it('ranks plain matches by score, then entity type (moieties before combinations)', () => {
    const r = searchAllLocal(index, 'lisinopril', 6)
    expect(r.fuzzy).toBe(false)
    expect(r.did_you_mean).toBeNull()
    expect(r.results.map(h => [h.pcid, h.match.score])).toEqual([
      ['PCID-1001104', 100],
      ['PCID-1001105', 80],
      ['PCID-2000001', 80],
    ])
  })

  it('matches brands and codes and reports the matched text', () => {
    expect(searchAllLocal(index, 'zestril').results[0]).toMatchObject({ pcid: 'PCID-1001104', match: { on: 'brand', text: 'Zestril', score: 90 } })
    expect(searchAllLocal(index, 'a10ba').results[0]).toMatchObject({ pcid: 'PCID-5001326', match: { on: 'code', text: 'A10BA', score: 92 } })
  })

  it('filters by entity type and clamps the limit', () => {
    expect(searchAllLocal(index, 'lisinopril', 6, ['combination']).results.map(h => h.pcid)).toEqual(['PCID-2000001'])
    expect(searchAllLocal(index, 'lisinopril', 1).results).toHaveLength(1)
  })

  it('returns nothing for a query too short or too far from any name', () => {
    expect(searchAllLocal(index, 'x').results).toEqual([])
    expect(searchAllLocal(index, 'qqqqqqqq')).toEqual({ query: 'qqqqqqqq', fuzzy: false, did_you_mean: null, results: [] })
  })
})
