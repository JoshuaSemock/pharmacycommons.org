/**
 * API layer tests — offline.
 *
 * src/api.ts is catalog-first: every read goes through public/drug-catalog.json,
 * and Supabase only hydrates detail records once BACKEND_ENABLED is true. These
 * tests exercise that path against the real catalog file, served from disk in
 * place of the network, so they run anywhere (CI, Codespaces) with no
 * credentials and no live backend.
 *
 * When the backend is switched on, add live hydration checks in a separate,
 * gated file rather than here.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  getDrugByPcid,
  getDrugBySlug,
  getDrugInteractions,
  isApiError,
  listDrugs,
  searchDrugs,
} from '@/api'
import type { DrugEntityType } from '@/api.generated'

const CATALOG = readFileSync(resolve(__dirname, '../public/drug-catalog.json'), 'utf-8')
const MANIFEST = JSON.parse(CATALOG) as { rows: [number, string, string, string | null, 0 | 1, number, 0 | 1][] }
const TOTAL = MANIFEST.rows.length
const COMBINATIONS = MANIFEST.rows.filter(r => r[4] === 1).length

const ENTITY_TYPES: DrugEntityType[] = ['drug', 'substance', 'combination', 'device']
const PCID_RE = /^PCID-[12]\d{6}$/
const SLUG_RE = /^[a-z0-9-]+$/

beforeAll(() => {
  // The app fetches `${BASE_URL}drug-catalog.json`; answer that from disk and
  // fail loudly on anything else, so a stray network call can't hide.
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('drug-catalog.json')) {
      return new Response(CATALOG, { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`Unexpected network request in tests: ${url}`)
  })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

// ─────────────────────────────────────────────────────────────────────────────

describe('getDrugBySlug', () => {
  it('returns a catalog-backed record for a known slug', async () => {
    const drug = await getDrugBySlug('ibuprofen')
    expect(drug).toMatchObject({
      pcid_code: 'PCID-1000233',
      slug: 'ibuprofen',
      name: 'ibuprofen',
      entity_type: 'drug',
      status: 'partial',
      attributes: {},
      components: [],
      interactions: [],
      eco: null,
      fda_ndc_codes: [],
    })
  })

  it('returns null, not an error, for an unknown slug', async () => {
    await expect(getDrugBySlug('not-a-real-drug-xyz')).resolves.toBeNull()
  })

  it('describes a brand name when the catalog has one', async () => {
    const drug = await getDrugBySlug('oxycodone')
    expect(drug?.description).toBe('Also marketed as OxyContin.')
  })

  it('leaves description null when there is no brand', async () => {
    const drug = await getDrugBySlug('metformin')
    expect(drug?.description).toBeNull()
  })

  it('maps catalog combinations to entity_type "combination"', async () => {
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
  it('returns an empty list while records are catalog-only', async () => {
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
      total: TOTAL,
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
    const res = await listDrugs({ limit: 10, offset: TOTAL - 3 })
    expect(res?.drugs).toHaveLength(3)
    expect(res?.has_more).toBe(false)
  })

  it('filters to combinations', async () => {
    const res = await listDrugs({ entity_type: 'combination', limit: 100 })
    expect(res?.total).toBe(COMBINATIONS)
    expect(res?.drugs.every(d => d.entity_type === 'combination')).toBe(true)
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

describe('catalog integrity', () => {
  it('has unique slugs and PCIDs', () => {
    expect(new Set(MANIFEST.rows.map(r => r[1])).size).toBe(TOTAL)
    expect(new Set(MANIFEST.rows.map(r => r[0])).size).toBe(TOTAL)
  })

  it('uses PCID-1… for ingredients and PCID-2… for combinations', () => {
    for (const [n, , , , type] of MANIFEST.rows) {
      expect(String(n).charAt(0)).toBe(type === 1 ? '2' : '1')
    }
  })

  it('produces well-formed list items for the whole catalog', async () => {
    const res = await listDrugs({ limit: 100, offset: 0 })
    let offset = 0
    let seen = 0
    let page = res
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
    expect(seen).toBe(TOTAL)
  })

  it('has URL-safe slugs apart from known sign-led names', () => {
    const unsafe = MANIFEST.rows.map(r => r[1]).filter(s => !SLUG_RE.test(s))
    // Stereo-sign prefixes like "(+)-" and "(±)-" survive in a few slugs today.
    // Tighten this to toEqual([]) once the slug generator strips them.
    for (const s of unsafe) expect(s).toMatch(/^\([+\-±]+\)-[a-z0-9-]+$/)
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
