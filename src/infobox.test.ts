import { describe, expect, it } from 'vitest'
import { citationHref, dedupeContained, toInfoboxState } from './infobox'
import type { InfoboxEdit } from './infobox'

const edit = (p: Partial<InfoboxEdit> & { id: number }): InfoboxEdit => ({
  property_key: 'acb_score',
  value: '1',
  citation: 'x',
  summary: 's',
  is_current: false,
  created_at: '2026-10-05T00:00:00Z',
  patrol_status: 'patrolled',
  review_note: null,
  handle: 'h',
  credential: null,
  ...p,
})

describe('toInfoboxState', () => {
  const s = toInfoboxState([
    edit({ id: 3, value: '3', patrol_status: 'pending' }),
    edit({ id: 2, value: '0', is_current: true }),
    edit({ id: 1, value: '1' }),
    edit({ id: 4, property_key: 'qtc_risk', value: null, is_current: true }),
  ])
  it('returns the live value, not pending or old ones', () => expect(s.current('acb_score')?.id).toBe(2))
  it('treats a cleared value as no community value', () => expect(s.current('qtc_risk')).toBeNull())
  it('lists pending edits and full history per key', () => {
    expect(s.pending('acb_score').map(e => e.id)).toEqual([3])
    expect(s.history('acb_score').map(e => e.id)).toEqual([3, 2, 1])
  })
})

describe('citationHref', () => {
  it('links URLs, DOIs and PMIDs only', () => {
    expect(citationHref('https://dailymed.nlm.nih.gov/x')).toBe('https://dailymed.nlm.nih.gov/x')
    expect(citationHref('doi:10.1111/j.1532-5415.2008.01806.x')).toBe('https://doi.org/10.1111/j.1532-5415.2008.01806.x')
    expect(citationHref('PMID: 18540946')).toBe('https://pubmed.ncbi.nlm.nih.gov/18540946/')
    expect(citationHref('Boustani 2008')).toBeNull()
    expect(citationHref('javascript:alert(1)')).toBeNull()
  })
})

describe('dedupeContained', () => {
  it('drops values another value already contains', () => {
    expect(dedupeContained(['Rx only (Legend)', 'Legend'])).toEqual(['Rx only (Legend)'])
    expect(dedupeContained(['Rx', 'CS-II', 'rx'])).toEqual(['Rx', 'CS-II'])
  })
})
