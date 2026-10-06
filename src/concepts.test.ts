import { describe, expect, it } from 'vitest'
import { conceptKindLine, groupByPredicate, isConceptKind, predicateLabel } from './concepts'
import type { ConceptStatement } from './concepts'

describe('concept pages', () => {
  it('uses the concept layout only for non-drug blocks', () => {
    for (const k of ['clinical', 'measurement', 'target', 'functional']) expect(isConceptKind(k)).toBe(true)
    for (const k of ['moiety', 'combination', 'precise_form', 'formulation', undefined, null]) expect(isConceptKind(k)).toBe(false)
  })

  it('names the kind from the recorded subtype', () => {
    expect(conceptKindLine('clinical', { 'Concept type': 'Indication' })).toBe('Indication')
    expect(conceptKindLine('clinical', {})).toBe('Clinical concept')
    expect(conceptKindLine('measurement', { 'Measurement type': 'Serum Lab Panel' })).toBe('Serum Lab Panel')
    expect(conceptKindLine('functional', { 'Group type': 'Botanical source' })).toBe('Herbal or botanical source')
    expect(conceptKindLine('target', { 'Target type': 'enzyme' })).toBe('Enzyme')
  })

  it('reads predicates as plain words', () => {
    expect(predicateLabel('has_pgx_association')).toBe('PGx association')
    expect(predicateLabel('has_side_effect')).toBe('side effect')
    expect(predicateLabel('treats')).toBe('treats')
  })

  it('groups statements by predicate in first-seen order', () => {
    const row = (id: number, predicate: string): ConceptStatement => ({ id, predicate, qualifier: null, source: null, subject: null })
    const groups = groupByPredicate([row(1, 'treats'), row(2, 'has_symptom'), row(3, 'treats')])
    expect(groups.map(g => [g.predicate, g.rows.map(r => r.id)])).toEqual([
      ['treats', [1, 3]],
      ['has_symptom', [2]],
    ])
  })
})
