/**
 * API layer tests — offline, against a mocked Supabase client.
 *
 * Phase 3 moved src/api.ts from a static-catalog-first design to querying
 * Supabase directly (see CLAUDE.md, "Phase 3 IN PROGRESS"). These tests no
 * longer read public/drug-catalog.json or stub `fetch` — that file described
 * an architecture this codebase no longer has. Instead `@/supabaseClient` is
 * mocked with an in-memory fake that mimics just enough of the supabase-js
 * query-builder chain (`select/eq/in/or/order/range/maybeSingle`, all
 * thenable) to answer the queries api.ts actually issues, against a small
 * fixture dataset built below.
 *
 * 2026-09-20: listDrugs/searchDrugs/catalog.ts were restricted to
 * entity_type='moiety' only — precise forms, formulations and combination
 * products no longer surface as their own catalog entries (they nest under
 * their parent moiety's `hierarchy` instead; see getMoietyHierarchy in
 * api.ts). TOTAL below is every entity in the fixture (moieties + the one
 * combination); MOIETIES is what listDrugs/searchDrugs actually return now.
 * The fixture db also carries an (empty, for these tests) `moiety_hierarchy`
 * table, since getDrugBySlug queries it for any moiety.
 *
 * No network access, no credentials, runs anywhere — same guarantee the old
 * suite made, kept for the new architecture.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, expect, it, vi } from 'vitest'
import type { DrugEntityType } from '@/api.generated'

// ─────────────────────────────────────────────────────────────────────────────
// Fixture data + fake supabase-js query builder
// ─────────────────────────────────────────────────────────────────────────────

const { db, TOTAL, MOIETIES, COMBINATIONS } = vi.hoisted(() => {
  type Row = Record<string, unknown>

  const entities: Row[] = []
  const moieties: Row[] = []
  const combinations: Row[] = []
  const catalog_entries: Row[] = []
  const clinical_statements: Row[] = [] // empty: components/interactions are [] in every test
  const moiety_hierarchy: Row[] = [] // empty: no test exercises a populated hierarchy

  function addMoiety(pcid: number, slug: string, name: string, primary_brand: string | null = null) {
    entities.push({ pcid, slug, name, entity_type: 'moiety' })
    moieties.push({ pcid, primary_brand, class_name: null })
    catalog_entries.push({
      pcid, slug, name, entity_type: 'moiety',
      primary_brand, controlled_schedule: null, is_controlled: null,
    })
  }

  addMoiety(1000233, 'ibuprofen', 'ibuprofen')
  addMoiety(1000500, 'oxycodone', 'oxycodone', 'OxyContin')
  addMoiety(1000600, 'metformin', 'metformin')
  addMoiety(1000700, 'sertraline', 'sertraline')

  // Combination — exercises the entity_type mapping and PCID-2 block.
  // Not returned by listDrugs/searchDrugs any more (moiety-only), but still
  // reachable directly via getDrugBySlug/getDrugByPcid.
  entities.push({ pcid: 2000100, slug: 'acetaminophen-pentazocine', name: 'acetaminophen-pentazocine', entity_type: 'combination' })
  combinations.push({ pcid: 2000100, primary_brand: null, class_name: null })
  catalog_entries.push({
    pcid: 2000100, slug: 'acetaminophen-pentazocine', name: 'acetaminophen-pentazocine',
    entity_type: 'combination', primary_brand: null, controlled_schedule: null, is_controlled: null,
  })

  // Filler: enough rows to exercise paging/capping (>100) and to give the 'a'
  // search real breadth. "alpha-filler-###" deliberately contains "a".
  const FILLER = 200
  for (let i = 0; i < FILLER; i++) {
    const n = String(i).padStart(3, '0')
    addMoiety(1001000 + i, `alpha-filler-${n}`, `alpha-filler-${n}`)
  }

  const TOTAL = entities.length
  const COMBINATIONS = entities.filter(e => e.entity_type === 'combination').length
  const MOIETIES = entities.filter(e => e.entity_type === 'moiety').length

  return {
    db: {
      entities, moieties, combinations, precise_forms: [], formulations: [],
      clinical_statements, catalog_entries, moiety_hierarchy,
    },
    TOTAL,
    MOIETIES,
    COMBINATIONS,
  }
})

/** Parses one `col.op.val` clause as used in the `.or(...)` calls in api.ts. */
function matchesClause(row: Record<string, unknown>, clause: string): boolean {
  const [col, op, ...rest] = clause.split('.')
  const val = rest.join('.')
  const cell = row[col]
  if (op === 'ilike') {
    const needle = val.replace(/^%|%$/g, '').toLowerCase()
    return typeof cell === 'string' && cell.toLowerCase().includes(needle)
  }
  if (op === 'eq') {
    return String(cell) === val
  }
  return false
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null; count?: number }> {
  private rows: Record<string, unknown>[]
  private countRequested = false
  private single = false
  private from: number | null = null
  private to: number | null = null

  constructor(rows: Record<string, unknown>[]) {
    this.rows = rows
  }

  select(_cols: string, opts?: { count?: string }) {
    if (opts?.count === 'exact') this.countRequested = true
    return this
  }
  eq(col: string, val: unknown) {
    this.rows = this.rows.filter(r => r[col] === val)
    return this
  }
  in(col: string, vals: unknown[]) {
    this.rows = this.rows.filter(r => vals.includes(r[col]))
    return this
  }
  or(expr: string) {
    const clauses = expr.split(',')
    this.rows = this.rows.filter(r => clauses.some(c => matchesClause(r, c)))
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    const dir = opts?.ascending === false ? -1 : 1
    this.rows = [...this.rows].sort((a, b) => {
      const av = a[col], bv = b[col]
      if (av === bv) return 0
      return (av! > bv! ? 1 : -1) * dir
    })
    return this
  }
  range(from: number, to: number) {
    this.from = from
    this.to = to
    return this
  }
  maybeSingle() {
    this.single = true
    return this
  }
  then<TResult1 = { data: unknown; error: null; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const count = this.countRequested ? this.rows.length : undefined
    let rows = this.rows
    if (this.from != null && this.to != null) rows = rows.slice(this.from, this.to + 1)
    const result = this.single
      ? { data: rows[0] ?? null, error: null }
      : { data: rows, error: null, count }
    return Promise.resolve(onfulfilled ? onfulfilled(result) : (result as unknown as TResult1))
  }
}

vi.mock('@/supabaseClient', () => ({
  supabase: {
    from(table: keyof typeof db) {
      return new FakeQuery([...(db[table] as Record<string, unknown>[])])
    },
  },
}))

const {
  getDrugByPcid,
  getDrugBySlug,
  getDrugInteractions,
  isApiError,
  listDrugs,
  searchDrugs,
} = await import('@/api')

// Current toDrugEntityType() only ever produces these two — 'substance' and
// 'device' exist in the DB enum but aren't emitted by the mapping today.
const ENTITY_TYPES: DrugEntityType[] = ['drug', 'combination']
const PCID_RE = /^PCID-[12]\d{6}$/

// ─────────────────────────────────────────────────────────────────────────────

describe('getDrugBySlug', () => {
  it('returns a Supabase-backed record for a known slug', async () => {
    const drug = await getDrugBySlug('ibuprofen')
    expect(drug).toMatchObject({
      pcid_code: 'PCID-1000233',
      slug: 'ibuprofen',
      name: 'ibuprofen',
      entity_type: 'drug',
      status: 'full',
      attributes: {},
      components: [],
      interactions: [],
      eco: null,
      fda_ndc_codes: [],
    })
  })

  it('carries an empty hierarchy for a moiety with no related entities', async () => {
    // Every moiety gets a `hierarchy` object (see api.ts:getMoietyHierarchy);
    // the fixture's moiety_hierarchy table is empty, so it's all-empty, not null.
    const drug = await getDrugBySlug('ibuprofen')
    expect(drug?.hierarchy).toEqual({ precise_forms: [], combinations: [], brand_names: [] })
  })

  it('leaves hierarchy null for a non-moiety entity', async () => {
    const drug = await getDrugBySlug('acetaminophen-pentazocine')
    expect(drug?.hierarchy).toBeNull()
  })

  it('returns null, not an error, for an unknown slug', async () => {
    await expect(getDrugBySlug('not-a-real-drug-xyz')).resolves.toBeNull()
  })

  it('leaves description null when the satellite row has no class_name', async () => {
    // Detail description comes from `class_name`, not `primary_brand` — the
    // brand-based description ("Also marketed as …") is a list/search-only
    // presentation built by listDrugs/searchDrugs, not getDrugBySlug.
    const drug = await getDrugBySlug('oxycodone')
    expect(drug?.description).toBeNull()
  })

  it('maps entity_type "combination" through correctly', async () => {
    const drug = await getDrugBySlug('acetaminophen-pentazocine')
    expect(drug?.entity_type).toBe('combination')
    expect(drug?.pcid_code).toMatch(/^PCID-2\d{6}$/)
  })
})

describe('getDrugByPcid', () => {
  it('resolves a PCID to the same record as its slug', async () => {
    const [byPcid, bySlug] = await Promise.all([
      getDrugByPcid('PCID-1000233'),
      getDrugBySlug('ibuprofen'),
    ])
    expect(byPcid).toEqual(bySlug)
  })

  it.each(['PCID-9999999', 'PCID-123', 'pcid-1000233', 'DAM-1000233', ''])(
    'returns null for %j',
    async pcid => {
      await expect(getDrugByPcid(pcid)).resolves.toBeNull()
    },
  )
})

describe('getDrugInteractions', () => {
  it('returns an empty list when there are no live interaction records', async () => {
    await expect(getDrugInteractions('metformin')).resolves.toEqual([])
  })

  it('returns null for an unknown slug', async () => {
    await expect(getDrugInteractions('not-a-real-drug-xyz')).resolves.toBeNull()
  })
})

describe('listDrugs', () => {
  it('returns the documented response shape', async () => {
    const res = await listDrugs({ limit: 5 })
    expect(res).toMatchObject({
      drugs: expect.any(Array),
      total: MOIETIES,
      offset: 0,
      limit: 5,
      has_more: true,
    })
    expect(res?.drugs).toHaveLength(5)
  })

  it('defaults to 25 and caps the page size at 100', async () => {
    expect((await listDrugs())?.limit).toBe(25)
    expect((await listDrugs({ limit: 500 }))?.drugs).toHaveLength(100)
  })

  it('clamps a negative offset to zero', async () => {
    expect((await listDrugs({ offset: -10 }))?.offset).toBe(0)
  })

  it('pages without overlap', async () => {
    const [a, b] = await Promise.all([
      listDrugs({ limit: 5, offset: 0 }),
      listDrugs({ limit: 5, offset: 5 }),
    ])
    const slugsA = new Set(a?.drugs.map(d => d.slug))
    expect(b?.drugs.some(d => slugsA.has(d.slug))).toBe(false)
  })

  it('reports has_more false on the last page', async () => {
    const res = await listDrugs({ limit: 10, offset: MOIETIES - 3 })
    expect(res?.drugs).toHaveLength(3)
    expect(res?.has_more).toBe(false)
  })

  it('only ever returns moieties, regardless of entity_type', async () => {
    // Precise forms, formulations and combination products aren't
    // catalog-level entries any more (see the 2026-09-20 file-header note) —
    // they live under their parent moiety's hierarchy instead. entity_type is
    // accepted for API compatibility but no longer widens or narrows the
    // result past moiety rows.
    const res = await listDrugs({ entity_type: 'combination', limit: 100 })
    expect(res?.total).toBe(MOIETIES)
    expect(res?.drugs.every(d => d.entity_type === 'drug')).toBe(true)
    expect(COMBINATIONS).toBeGreaterThan(0) // sanity: the fixture does have one, just unreachable here
  })

  it('describes a brand name when the catalog has one', async () => {
    const res = await listDrugs({ limit: TOTAL })
    const oxy = res?.drugs.find(d => d.slug === 'oxycodone')
    expect(oxy?.description).toBe('Also marketed as OxyContin.')
  })

  it('produces well-formed list items across the whole catalog', async () => {
    let offset = 0
    let seen = 0
    let page = await listDrugs({ limit: 100, offset })
    while (page && page.drugs.length > 0) {
      for (const d of page.drugs) {
        expect(d.pcid_code).toMatch(PCID_RE)
        expect(ENTITY_TYPES).toContain(d.entity_type)
        expect(d.name.length).toBeGreaterThan(0)
      }
      seen += page.drugs.length
      offset += page.drugs.length
      page = page.has_more ? await listDrugs({ limit: 100, offset }) : null
    }
    expect(seen).toBe(MOIETIES)
  })
})

describe('searchDrugs', () => {
  it('returns null for an empty or blank query', async () => {
    await expect(searchDrugs({ q: '' })).resolves.toBeNull()
    await expect(searchDrugs({ q: '   ' })).resolves.toBeNull()
  })

  it('ranks an exact slug first', async () => {
    const res = await searchDrugs({ q: 'sertraline' })
    expect(res?.drugs[0]?.slug).toBe('sertraline')
  })

  it('finds by prefix', async () => {
    const res = await searchDrugs({ q: 'sert' })
    expect(res?.drugs.map(d => d.slug)).toContain('sertraline')
  })

  it('finds by brand name', async () => {
    const res = await searchDrugs({ q: 'oxycontin' })
    expect(res?.drugs.map(d => d.slug)).toContain('oxycodone')
  })

  it('is case-insensitive', async () => {
    const [lower, upper] = await Promise.all([searchDrugs({ q: 'metf' }), searchDrugs({ q: 'METF' })])
    expect(upper?.drugs).toEqual(lower?.drugs)
  })

  it('echoes the trimmed query', async () => {
    expect((await searchDrugs({ q: '  metformin ' }))?.query).toBe('metformin')
  })

  it('returns an empty page for nonsense', async () => {
    const res = await searchDrugs({ q: 'xyzabc123nonexistent' })
    expect(res?.drugs).toEqual([])
    expect(res?.has_more).toBe(false)
  })

  it('does not surface the fixture combination', async () => {
    const res = await searchDrugs({ q: 'acetaminophen-pentazocine' })
    expect(res?.drugs).toEqual([])
  })

  it('pages without overlap', async () => {
    const [a, b] = await Promise.all([
      searchDrugs({ q: 'a', limit: 5, offset: 0 }),
      searchDrugs({ q: 'a', limit: 5, offset: 5 }),
    ])
    expect(a?.has_more).toBe(true)
    const slugsA = new Set(a?.drugs.map(d => d.slug))
    expect(b?.drugs.some(d => slugsA.has(d.slug))).toBe(false)
  })
})

describe('isApiError', () => {
  it('recognizes an error envelope', () => {
    expect(isApiError({ error: true, code: 'NOT_FOUND', message: 'Drug not found' })).toBe(true)
  })

  it.each([{ error: false, data: {} }, null, undefined, 'error', { code: 'NOT_FOUND' }])(
    'rejects %j',
    value => {
      expect(isApiError(value)).toBe(false)
    },
  )
})
