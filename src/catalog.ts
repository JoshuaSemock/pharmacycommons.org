/**
 * Pharmacy Commons — static drug catalog
 *
 * Ships the full PCID spine (slug, name, brand, schedule) with the build so the
 * site can search, route, and render skeleton pages with no backend at all.
 *
 * Slug is the join key. When Supabase is live, `getDrug()` hydrates a catalog
 * entry into a full record; when it isn't, the catalog entry is served as-is
 * and the page renders in `partial` mode. No code path changes between the two
 * states — only the completeness of what comes back.
 */

export type CatalogEntry = {
  /** Numeric payload of the PCID, e.g. 1000233 */
  n: number
  slug: string
  name: string
  brand: string | null
  /** 0 = ingredient (PCID-1…), 1 = combination (PCID-2…) */
  type: 0 | 1
  /** Index into the manifest's `schedules` array; 0 = not scheduled */
  sched: number
  stub: 0 | 1
}

export type Manifest = {
  v: number
  generated: string
  source: string
  cols: string[]
  schedules: string[]
  rows: [number, string, string, string | null, 0 | 1, number, 0 | 1][]
}

export type Drug = CatalogEntry & {
  pcid: string
  entryType: 'ingredient' | 'combination'
  schedule: string | null
  /** 'full' once hydrated from Supabase; 'partial' when catalog-only */
  completeness: 'full' | 'partial'
  [k: string]: unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

let _catalog: CatalogEntry[] | null = null
let _bySlug: Map<string, CatalogEntry> | null = null
let _byNum: Map<number, CatalogEntry> | null = null
let _loading: Promise<CatalogEntry[]> | null = null

/**
 * Fetched rather than imported so the 200 KB manifest stays out of the main
 * bundle and lands in the HTTP cache on its own.
 */
export async function loadCatalog(): Promise<CatalogEntry[]> {
  if (_catalog) return _catalog
  if (_loading) return _loading

  _loading = (async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}drug-catalog.json`)
    if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`)
    const man: Manifest = await res.json()

    const entries: CatalogEntry[] = man.rows.map(r => ({
      n: r[0], slug: r[1], name: r[2], brand: r[3],
      type: r[4], sched: r[5], stub: r[6],
    }))

    _schedules = man.schedules
    _catalog = entries
    _bySlug = new Map(entries.map(e => [e.slug, e]))
    _byNum = new Map(entries.map(e => [e.n, e]))
    return entries
  })()

  return _loading
}

let _schedules: string[] = []

// ─────────────────────────────────────────────────────────────────────────────
// Identifier helpers
// ─────────────────────────────────────────────────────────────────────────────

export const pcidOf = (e: CatalogEntry): string => `PCID-${e.n}`
export const damOf = (e: CatalogEntry): string | null =>
  e.type === 0 ? `DAM-${e.n}` : null   // only solos mirror

export function toDrug(e: CatalogEntry): Drug {
  return {
    ...e,
    pcid: pcidOf(e),
    entryType: e.type === 0 ? 'ingredient' : 'combination',
    schedule: e.sched ? _schedules[e.sched] ?? null : null,
    completeness: 'partial',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Search — local, synchronous, no network
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Ranked substring search over name, brand, and slug.
 * Ranking: exact slug > name prefix > brand prefix > word-boundary > substring.
 * 3,433 entries scans in well under a frame; no index needed.
 */
export function searchCatalog(query: string, limit = 25): CatalogEntry[] {
  if (!_catalog) return []
  const q = norm(query)
  if (!q) return []

  const scored: { e: CatalogEntry; s: number }[] = []

  for (const e of _catalog) {
    const name = norm(e.name)
    const brand = e.brand ? norm(e.brand) : ''
    let s = 0

    if (e.slug === query.toLowerCase()) s = 100
    else if (name === q) s = 95
    else if (name.startsWith(q)) s = 80
    else if (brand && brand.startsWith(q)) s = 75
    else if (name.includes(` ${q}`)) s = 60
    else if (brand && brand.includes(` ${q}`)) s = 55
    else if (name.includes(q)) s = 40
    else if (brand && brand.includes(q)) s = 35
    else if (e.slug.includes(q.replace(/ /g, '-'))) s = 30
    else continue

    if (e.stub) s -= 5          // curated entries first
    scored.push({ e, s })
  }

  scored.sort((a, b) => b.s - a.s || a.e.name.length - b.e.name.length)
  return scored.slice(0, limit).map(x => x.e)
}

export function getBySlug(slug: string): CatalogEntry | null {
  return _bySlug?.get(slug) ?? null
}

export function getByPcid(pcid: string): CatalogEntry | null {
  const m = /^PCID-(\d{7})$/.exec(pcid)
  return m ? _byNum?.get(Number(m[1])) ?? null : null
}

export function browse(opts: { type?: 0 | 1; offset?: number; limit?: number } = {}) {
  if (!_catalog) return { entries: [] as CatalogEntry[], total: 0 }
  const { type, offset = 0, limit = 50 } = opts
  const pool = type === undefined ? _catalog : _catalog.filter(e => e.type === type)
  return { entries: pool.slice(offset, offset + limit), total: pool.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hydration — catalog entry + Supabase record
// ─────────────────────────────────────────────────────────────────────────────

type Hydrator = (slug: string) => Promise<Record<string, unknown> | null>

let _hydrator: Hydrator | null = null

/**
 * Register the Supabase fetcher. Until this is called — or if it throws — the
 * app runs catalog-only. Wire it up in main.tsx once the schema is deployed:
 *
 *   import { setHydrator } from './catalog'
 *   import { getDrugBySlug } from './api'
 *   setHydrator(getDrugBySlug)
 */
export function setHydrator(fn: Hydrator | null) { _hydrator = fn }

export function isBackendConfigured() { return _hydrator !== null }

/**
 * Resolve a slug to the best available record.
 *
 * Returns `null` only when the slug is absent from the catalog — a genuine 404.
 * A backend failure degrades to the catalog entry rather than erroring, so a
 * Supabase outage costs detail, not availability.
 */
export async function getDrug(slug: string): Promise<Drug | null> {
  await loadCatalog()
  const entry = getBySlug(slug)
  if (!entry) return null

  const base = toDrug(entry)
  if (!_hydrator) return base

  try {
    const remote = await _hydrator(slug)
    if (!remote) return base            // not loaded upstream yet
    return { ...base, ...remote, completeness: 'full' }
  } catch (err) {
    console.warn(`[catalog] hydration failed for '${slug}', serving catalog entry`, err)
    return base
  }
}
