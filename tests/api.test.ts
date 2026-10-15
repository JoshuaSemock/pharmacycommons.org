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
 * 2026-09-22: getDrugBySlug also reads `entity_brand_names` (phase 7 brand
 * names), so the fixture carries that table too (empty). The fake client
 * returns no rows for any table the fixture doesn't define, so a new query in
 * api.ts can't crash the whole suite again.
 *
 * No network access, no credentials, runs anywhere — same guarantee the old
 * suite made, kept for the new architecture.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, expect, it, vi } from 'vitest'

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
  const entity_brand_names: Row[] = [] // empty: brand chips aren't exercised here

  // 2026-09-30: References and Resources read public.references_resources
  // (src/references.ts). Three rows: one source dataset (kept off /resources),
  // one guideline with a journal reference, one link with no structured cite.
  const references_resources: Row[] = [
    {
      id: 'openfda', sort_order: 56, name: 'openFDA', subtitle: null, href: 'https://open.fda.gov/',
      organization: 'U.S. Food and Drug Administration (FDA)', pub_year: 2026,
      description: 'Adverse event reports, NDC directory, and structured product labeling.',
      type_badge: null, license_badge: 'US public domain', badges: null,
      headers: 'Source datasets', reference_section: 'Regulatory and product information',
      commons_use: 'The primary feed for US product-level data.', version: null, current_as_of: null,
      download_url: null, citation_text: null,
      cite: { kind: 'web', title: 'openFDA', publisher: 'US Food and Drug Administration', place: 'Silver Spring (MD)', nlmPublisher: 'Food and Drug Administration (US)' },
    },
    {
      id: 'ada-soc-2026-s9', sort_order: 1, name: 'ADA Standards of Care 2026, Section 9', subtitle: null,
      href: 'https://diabetesjournals.org/care/article/49/Supplement_1/S183',
      organization: 'American Diabetes Association', pub_year: 2026, description: null,
      type_badge: null, license_badge: 'Copyrighted', badges: null,
      headers: 'Guideline recommendations', reference_section: 'Clinical guidelines',
      commons_use: null, version: null, current_as_of: null, download_url: null,
      citation_text: 'Diabetes Care 2026;49(Suppl 1):S183',
      cite: { kind: 'web', title: 'Pharmacologic Approaches to Glycemic Treatment', publisher: 'American Diabetes Association', nlmPublisher: 'American Diabetes Association' },
    },
    {
      id: 'poison', sort_order: 53, name: 'Poison Control', subtitle: null, href: 'https://www.poison.org/',
      organization: 'National Capital Poison Center', pub_year: 2026, description: null,
      type_badge: null, license_badge: null, badges: ['24/7'],
      headers: 'Report and dispose', reference_section: 'Safety, toxicology, and public health',
      commons_use: null, version: null, current_as_of: null, download_url: null,
      citation_text: 'National Capital Poison Center. (2026). Poison Control. https://www.poison.org/',
      cite: { kind: 'web' }, // malformed on purpose: must be dropped, not rendered
    },
  ]

  function addMoiety(pcid: number, slug: string, name: string, primary_brand: string | null = null) {
    entities.push({ pcid, slug, name, entity_type: 'moiety' })
    moieties.push({ pcid, primary_brand, description_text: null })
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
  combinations.push({ pcid: 2000100, primary_brand: null })
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
      clinical_statements, catalog_entries, moiety_hierarchy, entity_brand_names,
      references_resources,
    } as Record<string, Row[]>,
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
    from(table: string) {
      // Unknown tables answer with no rows rather than throwing.
      return new FakeQuery([...(db[table] ?? [])])
    },
  },
}))

const { toDescription, getDrugBySlug } = await import('@/api')


// ─────────────────────────────────────────────────────────────────────────────

describe('toDescription', () => {
  it('drops missing, blank and placeholder descriptions', () => {
    expect(toDescription(null)).toBeNull()
    expect(toDescription('   ')).toBeNull()
    expect(toDescription('Unassigned')).toBeNull()
    expect(toDescription(' unassigned ')).toBeNull()
  })

  it('keeps written text, trimmed', () => {
    expect(toDescription('  Biguanide for type 2 diabetes. ')).toBe('Biguanide for type 2 diabetes.')
  })
})

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
      brands: [],
    })
  })

  it('carries an empty hierarchy for a moiety with no related entities', async () => {
    // Every moiety gets a `hierarchy` object (see api.ts:getMoietyHierarchy);
    // the fixture's moiety_hierarchy table is empty, so it's all-empty, not null.
    const drug = await getDrugBySlug('ibuprofen')
    expect(drug?.hierarchy).toEqual({ precise_forms: [], formulations: [], combinations: [], brand_names: [] })
  })

  it('leaves hierarchy null for a non-moiety entity', async () => {
    const drug = await getDrugBySlug('acetaminophen-pentazocine')
    expect(drug?.hierarchy).toBeNull()
  })

  it('returns null, not an error, for an unknown slug', async () => {
    await expect(getDrugBySlug('not-a-real-drug-xyz')).resolves.toBeNull()
  })

  it('leaves description null when the satellite row has no description_text', async () => {
    // Detail description comes from `description_text`, not `primary_brand` — the
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

// ─────────────────────────────────────────────────────────────────────────────
// References & Resources (src/references.ts)
// ─────────────────────────────────────────────────────────────────────────────

const { fetchAllReferences, resourcesOnly, groupBy, isSourceDataset, journalReference, SOURCE_DATASETS } =
  await import('@/references')

describe('fetchAllReferences', () => {
  it('reads references_resources in sort_order and maps to camelCase', async () => {
    const rows = await fetchAllReferences()
    expect(rows.map(r => r.id)).toEqual(['ada-soc-2026-s9', 'poison', 'openfda'])
    const openfda = rows.find(r => r.id === 'openfda')!
    expect(openfda).toMatchObject({
      referenceSection: 'Regulatory and product information',
      licenseBadge: 'US public domain',
      commonsUse: 'The primary feed for US product-level data.',
      badges: [],
      subtitle: undefined,
    })
    expect(openfda.cite).toMatchObject({ kind: 'web', place: 'Silver Spring (MD)' })
  })

  it('drops a malformed cite instead of passing it to the formatter', async () => {
    const poison = (await fetchAllReferences()).find(r => r.id === 'poison')!
    expect(poison.cite).toBeUndefined()
    expect(poison.citationText).toContain('Poison Control')
  })
})

describe('/resources filtering', () => {
  it(`excludes rows whose headers = '${SOURCE_DATASETS}'`, async () => {
    const rows = await fetchAllReferences()
    const shown = resourcesOnly(rows)
    expect(shown.map(r => r.id)).toEqual(['ada-soc-2026-s9', 'poison'])
    expect(shown.some(r => r.headers === 'Source datasets')).toBe(false)
  })

  it('/references keeps every row and puts source datasets first in a section', async () => {
    const rows = await fetchAllReferences()
    const groups = groupBy(rows, r => r.referenceSection, isSourceDataset)
    expect(groups.flatMap(g => g.items)).toHaveLength(rows.length)
    expect(groups.map(g => g.id)).toEqual([
      'clinical-guidelines',
      'safety-toxicology-and-public-health',
      'regulatory-and-product-information',
    ])
  })

  it('shows a journal reference only when it adds something', async () => {
    const rows = await fetchAllReferences()
    const byId = (id: string) => rows.find(r => r.id === id)!
    expect(journalReference(byId('ada-soc-2026-s9'))).toBe('Diabetes Care 2026;49(Suppl 1):S183')
    expect(journalReference(byId('poison'))).toBeNull() // restates the URL
    expect(journalReference(byId('openfda'))).toBeNull() // none supplied
  })
})
