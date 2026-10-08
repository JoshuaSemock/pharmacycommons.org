import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: {} }))
const { buildTopics, filterTopics, groupByLetter, kindCounts, sortTopics, subtypeCounts } = await import('./topics')
import type { TopicRow } from './topics'

const rows: TopicRow[] = [
  { pcid: 6000010, slug: 'lactic-acidosis', name: 'Lactic acidosis', entity_type: 'clinical', clinical_concepts: { concept_type: 'Adverse Reaction' } },
  { pcid: 6000011, slug: 'hypertension', name: 'Hypertension', entity_type: 'clinical', clinical_concepts: [{ concept_type: 'Indication' }] },
  { pcid: 6000012, slug: 'dizziness', name: 'Dizziness', entity_type: 'clinical', clinical_concepts: { concept_type: 'Symptom' } },
  { pcid: 6000013, slug: 'heart-failure', name: 'Heart failure', entity_type: 'clinical', clinical_concepts: { concept_type: 'Indication' } },
  { pcid: 6000014, slug: 'mystery', name: 'Mystery concept', entity_type: 'clinical', clinical_concepts: null },
  { pcid: 7000003, slug: 'serum-potassium', name: 'Serum potassium', entity_type: 'measurement', measurements: { measurement_type: 'Serum Lab Panel' } },
  { pcid: 8000004, slug: 'cyp3a4', name: 'CYP3A4', entity_type: 'target', biological_targets: { target_type: 'CYP450 Enzyme' } },
  { pcid: 9000020, slug: 'ashwagandha', name: 'Ashwagandha', entity_type: 'functional', functional_groups: { group_type: 'Botanical source' } },
  { pcid: 1001900, slug: 'metformin', name: 'Metformin', entity_type: 'moiety' },
]

const topics = buildTopics(
  rows,
  [
    { subject_pcid: 1001900, object_pcid: 6000010 },
    { subject_pcid: 1002000, object_pcid: 6000010 },
    { subject_pcid: 1001900, object_pcid: 6000010 }, // same drug twice counts once
    { subject_pcid: 1003000, object_pcid: 8000004 },
  ],
  [
    { source_pcid: 1001900, target_pcid: 6000010 }, // already counted via a statement
    { source_pcid: 6000011, target_pcid: 6000010 },
    { source_pcid: 6000010, target_pcid: 6000010 }, // self-link ignored
  ],
  [6000014],
)

describe('buildTopics', () => {
  it('keeps only blocks 6–9 and reads each subtype', () => {
    expect(topics).toHaveLength(8)
    expect(topics.find(t => t.slug === 'hypertension')?.subtype).toBe('Indication')
    expect(topics.find(t => t.slug === 'ashwagandha')?.subtype).toBeNull() // "Botanical source" says nothing new
  })

  it('counts distinct records pointing at a topic', () => {
    expect(topics.find(t => t.slug === 'lactic-acidosis')?.connections).toBe(3)
    expect(topics.find(t => t.slug === 'cyp3a4')?.connections).toBe(1)
    expect(topics.find(t => t.slug === 'dizziness')?.connections).toBe(0)
  })

  it('marks contributor-created pages', () => {
    expect(topics.filter(t => t.community).map(t => t.slug)).toEqual(['mystery'])
  })
})

describe('narrowing', () => {
  it('counts kinds and subtypes, most common first, "Other" last', () => {
    expect(kindCounts(topics)).toEqual({ clinical: 5, measurement: 1, target: 1, functional: 1 })
    expect(subtypeCounts(topics, 'clinical')).toEqual([
      { subtype: 'Indication', count: 2 },
      { subtype: 'Adverse Reaction', count: 1 },
      { subtype: 'Symptom', count: 1 },
      { subtype: null, count: 1 },
    ])
  })

  it('filters by kind, subtype and text over name or subtype', () => {
    const slugs = (f: Parameters<typeof filterTopics>[1]) => filterTopics(topics, f).map(t => t.slug).sort()
    expect(slugs({ kind: 'clinical', subtype: 'Indication', q: '' })).toEqual(['heart-failure', 'hypertension'])
    expect(slugs({ kind: null, subtype: null, q: 'symptom' })).toEqual(['dizziness'])
    expect(slugs({ kind: null, subtype: null, q: 'cyp' })).toEqual(['cyp3a4'])
  })

  it('sorts by connections, then name', () => {
    expect(sortTopics(topics, 'connected').slice(0, 2).map(t => t.slug)).toEqual(['lactic-acidosis', 'cyp3a4'])
  })

  it('groups A–Z in Browse bucket order', () => {
    const g = groupByLetter(topics)
    expect(g.map(x => x.bucket)).toEqual(['A', 'C', 'D', 'H', 'L', 'M', 'S'])
    expect(g.find(x => x.bucket === 'H')?.items.map(t => t.slug)).toEqual(['heart-failure', 'hypertension'])
  })
})
