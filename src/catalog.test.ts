import { beforeAll, describe, expect, it, vi } from 'vitest'

// ─── In-memory stand-in for the two catalog sources ───────────────────────────

type Row = Record<string, unknown>

const moieties: Row[] = [
  { pcid: 1001923, slug: 'metformin', name: 'metformin', entity_type: 'moiety', primary_brand: null, controlled_schedule: null, brand_names: ['Glucophage'] },
  { pcid: 1002576, slug: 'sitagliptin', name: 'sitagliptin', entity_type: 'moiety', primary_brand: null, controlled_schedule: null, brand_names: ['Januvia'] },
  { pcid: 1000800, slug: 'pioglitazone', name: 'pioglitazone', entity_type: 'moiety', primary_brand: null, controlled_schedule: null, brand_names: ['Actos'] },
  { pcid: 1001826, slug: 'lisinopril', name: 'lisinopril', entity_type: 'moiety', primary_brand: null, controlled_schedule: null, brand_names: ['Zestril'] },
  { pcid: 1000900, slug: 'glipizide', name: 'glipizide', entity_type: 'moiety', primary_brand: null, controlled_schedule: null, brand_names: [] },
]

const combinations: Row[] = [
  { pcid: 2000101, slug: 'sitagliptin-and-metformin-hydrochloride', name: 'SITAGLIPTIN AND METFORMIN HYDROCHLORIDE', entity_type: 'combination', primary_brand: null, controlled_schedule: null, brand_names: ['Janumet'] },
  { pcid: 2000102, slug: 'metformin-hydrochloride-and-sitagliptin-phosphate', name: 'METFORMIN HYDROCHLORIDE AND SITAGLIPTIN PHOSPHATE', entity_type: 'combination', primary_brand: null, controlled_schedule: null, brand_names: [] },
  { pcid: 2001607, slug: 'pioglitazone-and-metformin-hydrochloride', name: 'pioglitazone and metformin hydrochloride', entity_type: 'combination', primary_brand: null, controlled_schedule: null, brand_names: ['Actoplus Met'] },
  { pcid: 2000300, slug: 'lisinopril-and-hydrochlorothiazide', name: 'Lisinopril and Hydrochlorothiazide', entity_type: 'combination', primary_brand: null, controlled_schedule: null, brand_names: ['Zestoretic'] },
  { pcid: 2000200, slug: 'glipizide-and-metformin-hcl', name: 'GLIPIZIDE AND METFORMIN HCL', entity_type: 'combination', primary_brand: null, controlled_schedule: null, brand_names: [] },
]

const comboBrands: Row[] = [
  { brand: 'Janumet', pcid: 2000101, slug: 'sitagliptin-and-metformin-hydrochloride', name: 'SITAGLIPTIN AND METFORMIN HYDROCHLORIDE' },
]

vi.mock('./supabaseClient', () => {
  const builder = (rows: Row[]) => {
    let current = rows
    const b = {
      select: () => b,
      order: () => b,
      eq: (col: string, v: unknown) => {
        current = current.filter(r => r[col] === v)
        return b
      },
      range: (from: number, to: number) => Promise.resolve({ data: current.slice(from, to + 1), error: null }),
    }
    return b
  }
  return {
    supabase: {
      from: (table: string) =>
        builder(table === 'combination_brand_index' ? comboBrands : [...moieties, ...combinations]),
    },
  }
})

const { loadCatalog, searchCatalog } = await import('./catalog')

beforeAll(async () => {
  await loadCatalog()
})

const slugs = (q: string) => searchCatalog(q, 50).map(e => e.slug)

// ─── Generic combination search ──────────────────────────────────────────────

describe('searchCatalog — combinations by ingredient', () => {
  const janumetLike = ['sitagliptin-and-metformin-hydrochloride', 'metformin-hydrochloride-and-sitagliptin-phosphate']

  it.each([
    'metformin sitagliptin',
    'metformin/sitagliptin',
    'metformin/ sitagliptin',
    'metformin-sitagliptin',
    'metformin and sitagliptin',
    'metformin, sitagliptin',
    'metformin + sitagliptin',
    'metforminsitagliptin',
    'sitagliptin metformin',
    'sitagliptin/metformin',
    'sitagliptinmetformin',
  ])('"%s" finds both sitagliptin/metformin products first', q => {
    const hits = slugs(q)
    expect(hits.slice(0, 2).sort()).toEqual([...janumetLike].sort())
    // …and not metformin's other partners
    expect(hits).not.toContain('pioglitazone-and-metformin-hydrochloride')
    expect(hits).not.toContain('glipizide-and-metformin-hcl')
  })

  it('also offers each named ingredient, after the combinations', () => {
    const hits = slugs('metformin sitagliptin')
    expect(hits).toContain('metformin')
    expect(hits).toContain('sitagliptin')
    expect(hits.indexOf('metformin')).toBeGreaterThan(1)
  })

  it('matches while the second ingredient is still being typed', () => {
    expect(slugs('metformin sita').slice(0, 2).sort()).toEqual([...janumetLike].sort())
    expect(slugs('metforminsitag').slice(0, 2).sort()).toEqual([...janumetLike].sort())
  })

  it('expands pharmacy shorthand ("lisinopril/HCTZ")', () => {
    expect(slugs('lisinopril/HCTZ')[0]).toBe('lisinopril-and-hydrochlorothiazide')
    expect(slugs('hctz lisinopril')[0]).toBe('lisinopril-and-hydrochlorothiazide')
  })

  it('a single ingredient still returns only the moiety', () => {
    expect(slugs('metformin')).toEqual(['metformin'])
  })

  it('a salt name is one ingredient, not a combination', () => {
    expect(slugs('metformin hydrochloride')).toEqual(['metformin'])
  })

  it('combination brand search is unchanged', () => {
    expect(slugs('janumet')[0]).toBe('sitagliptin-and-metformin-hydrochloride')
  })

  it('never puts combinations in browse', async () => {
    const { browse } = await import('./catalog')
    expect(browse({ limit: 100 }).entries.every(e => e.type === 0)).toBe(true)
  })
})
