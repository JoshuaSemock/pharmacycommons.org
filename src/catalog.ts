/**
 * Pharmacy Commons — browsable drug catalog
 *
 * Phase 3: this now reads from the live `catalog_entries` Supabase view
 * (blocks 1-4 only: moieties, combinations, precise_forms, formulations —
 * 24,525 rows as of the 2026-09-19 load) instead of the static
 * `public/drug-catalog.json` manifest. The static catalog and its
 * `'partial'`/`'full'` completeness split are retired; every record here is a
 * live Supabase row.
 *
 * 2026-09-20: search/browse is filtered down to moiety rows only
 * (entity_type='moiety'). Precise forms, formulations and combination
 * products no longer surface as their own catalog entries — metformin
 * hydrochloride and every metformin combination product used to show up
 * alongside plain "metformin" as separate search hits. They're still fully
 * in the database; they now live under their parent moiety's detail page
 * (see the `moiety_hierarchy` materialized view and DrugDetail's Hierarchy
 * section) instead of cluttering the catalog. A combination's own page is
 * still reachable by slug/PCID directly, and from the moiety pages that
 * link to it — it's just not a top-level search result any more.
 *
 * 2026-09-22: brand names. `catalog_entries.brand_names` carries every brand
 * known for a moiety (Drugs@FDA NDA/BLA products + RxNorm brand names, see the
 * `entity_brand_names` materialized view), and search matches all of them:
 * searching "Glucophage" returns metformin, marked with the brand it matched.
 * Combination brands ("Janumet") come from the small `combination_brand_index`
 * view and return the combination product — the one case where a combination
 * appears in search results, since nobody searching a combination brand wants
 * to land on just one of its ingredients.
 *
 * The public surface (loadCatalog, searchCatalog, browse, the A–Z bucket
 * machinery, toDrug, pcidOf, …) is unchanged on purpose, so SearchView.tsx,
 * Home.tsx and Nav.tsx did not need to change: only where the data comes
 * from changed, not its shape or how it's consumed. `type` is always 0
 * (moiety) now, but the field and the 0/1/2/3 union are kept as-is rather
 * than collapsed, since getBySlug/getByPcid/toDrug and any caller matching
 * on `type` or `entryType` still work unchanged, and it costs nothing to
 * leave the door open for a future "show combinations too" toggle.
 */

import { supabase } from './supabaseClient'

export type CatalogEntry = {
  /** Numeric payload of the PCID, e.g. 1000233 */
  n: number
  slug: string
  name: string
  /** First (current, if any) brand — kept for callers that show a single brand. */
  brand: string | null
  /** Every known brand name, current ones first. */
  brands: string[]
  /** 0 = moiety, 1 = combination, 2 = precise form, 3 = formulation */
  type: 0 | 1 | 2 | 3
  /** Controlled-substance schedule label, e.g. "CII" — null if not controlled */
  schedule: string | null
  /**
   * "Needs an editor" flag. Not yet derivable from the live schema (no
   * curation-status column exists) — always 0 until Joshua defines the
   * criteria. See CLAUDE.md: confirm data-architecture calls like this one
   * rather than guessing at semantics.
   */
  stub: 0 | 1
  /** Set on search results that matched a brand rather than the drug name. */
  matchedBrand?: string
}

const ENTITY_TYPE_TO_CODE: Record<string, 0 | 1 | 2 | 3> = {
  moiety: 0,
  combination: 1,
  precise_form: 2,
  formulation: 3,
}

export type Drug = CatalogEntry & {
  pcid: string
  entryType: 'moiety' | 'combination' | 'precise_form' | 'formulation'
  schedule: string | null
  /** Kept for API compatibility with earlier callers; always 'full' now. */
  completeness: 'full'
  [k: string]: unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

type CatalogRow = {
  pcid: number
  slug: string
  name: string
  entity_type: string
  primary_brand: string | null
  controlled_schedule: string | null
  brand_names: string[] | null
}

type ComboBrandRow = { brand: string; pcid: number; slug: string; name: string }

const PAGE_SIZE = 1000

let _catalog: CatalogEntry[] | null = null
let _bySlug: Map<string, CatalogEntry> | null = null
let _byNum: Map<number, CatalogEntry> | null = null
/** Combination products, reachable only through their brand names in search. */
let _comboBrands: { brand: string; entry: CatalogEntry }[] = []
let _loading: Promise<CatalogEntry[]> | null = null

function rowToEntry(r: CatalogRow): CatalogEntry {
  const brands = r.brand_names ?? (r.primary_brand ? [r.primary_brand] : [])
  return {
    n: r.pcid,
    slug: r.slug,
    name: r.name,
    brand: brands[0] ?? r.primary_brand,
    brands,
    type: ENTITY_TYPE_TO_CODE[r.entity_type] ?? 0,
    schedule: r.controlled_schedule,
    stub: 0,
  }
}

/** Pages through a PostgREST query 1,000 rows at a time. */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    rows.push(...(data as T[]))
    if (data.length < PAGE_SIZE) break
  }
  return rows
}

/**
 * Fetches every moiety row of `catalog_entries` (entity_type='moiety' only —
 * see the file header), 1,000 at a time (PostgREST's page cap), plus the
 * combination-brand index, and caches both for the session.
 */
export async function loadCatalog(): Promise<CatalogEntry[]> {
  if (_catalog) return _catalog
  if (_loading) return _loading

  _loading = (async () => {
    const [rows, comboRows] = await Promise.all([
      fetchAll<CatalogRow>((from, to) =>
        supabase
          .from('catalog_entries')
          .select('pcid,slug,name,entity_type,primary_brand,controlled_schedule,brand_names')
          .eq('entity_type', 'moiety')
          .order('pcid', { ascending: true })
          .range(from, to),
      ).catch(err => {
        throw new Error(`Catalog fetch failed: ${err.message}`)
      }),
      // Combination brands are a nice-to-have for search; a failure here must not break browsing.
      fetchAll<ComboBrandRow>((from, to) =>
        supabase.from('combination_brand_index').select('brand,pcid,slug,name').order('brand_key').range(from, to),
      ).catch(err => {
        console.warn('[catalog] combination brands unavailable:', err.message)
        return [] as ComboBrandRow[]
      }),
    ])

    const entries = rows.map(rowToEntry)
    _catalog = entries
    _bySlug = new Map(entries.map(e => [e.slug, e]))
    _byNum = new Map(entries.map(e => [e.n, e]))

    const combos = new Map<number, CatalogEntry>()
    _comboBrands = comboRows.map(r => {
      let entry = combos.get(r.pcid)
      if (!entry) {
        entry = { n: r.pcid, slug: r.slug, name: r.name, brand: r.brand, brands: [], type: 1, schedule: null, stub: 0 }
        combos.set(r.pcid, entry)
      }
      entry.brands.push(r.brand)
      return { brand: r.brand, entry }
    })

    _ordered = null // invalidate derived caches
    _counts = null
    _offsets = null
    return entries
  })()

  return _loading
}

// ─────────────────────────────────────────────────────────────────────────────
// Identifier helpers
// ─────────────────────────────────────────────────────────────────────────────

export const pcidOf = (e: CatalogEntry): string => `PCID-${e.n}`

const ENTRY_TYPE_LABEL: Record<0 | 1 | 2 | 3, Drug['entryType']> = {
  0: 'moiety',
  1: 'combination',
  2: 'precise_form',
  3: 'formulation',
}

export function toDrug(e: CatalogEntry): Drug {
  return {
    ...e,
    pcid: pcidOf(e),
    entryType: ENTRY_TYPE_LABEL[e.type],
    schedule: e.schedule,
    completeness: 'full',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Browse buckets — A…Z, then 0…9, then α…ω, then ±
// ─────────────────────────────────────────────────────────────────────────────

/** One 0–9 bucket, or ten separate digit buckets. */
export const NUMERIC_MODE = 'single' as 'single' | 'split'

/**
 * Greek stereodescriptors are spelled out in the current data (`17beta-`), but
 * an imported source may use the glyph. Both route to the same bucket.
 */
export const GREEK_LETTERS = [
  { name: 'alpha',   symbol: 'α' }, { name: 'beta',    symbol: 'β' },
  { name: 'gamma',   symbol: 'γ' }, { name: 'delta',   symbol: 'δ' },
  { name: 'epsilon', symbol: 'ε' }, { name: 'zeta',    symbol: 'ζ' },
  { name: 'eta',     symbol: 'η' }, { name: 'theta',   symbol: 'θ' },
  { name: 'iota',    symbol: 'ι' }, { name: 'kappa',   symbol: 'κ' },
  { name: 'lambda',  symbol: 'λ' }, { name: 'mu',      symbol: 'μ' },
  { name: 'nu',      symbol: 'ν' }, { name: 'xi',      symbol: 'ξ' },
  { name: 'omicron', symbol: 'ο' }, { name: 'pi',      symbol: 'π' },
  { name: 'rho',     symbol: 'ρ' }, { name: 'sigma',   symbol: 'σ' },
  { name: 'tau',     symbol: 'τ' }, { name: 'upsilon', symbol: 'υ' },
  { name: 'phi',     symbol: 'φ' }, { name: 'chi',     symbol: 'χ' },
  { name: 'psi',     symbol: 'ψ' }, { name: 'omega',   symbol: 'ω' },
] as const

/** Terminal bucket for optical-rotation and other symbol-led names. */
export const SYMBOL_KEY = 'sym'

/**
 * Bucket keys are strings rather than a literal union because the set is built
 * at runtime from NUMERIC_MODE. Validate anything arriving from a URL with
 * `paramToBucket`, which is the only untrusted entry point.
 */
export type Bucket = string

export type BucketDef = {
  key: Bucket
  /** What the nav button shows — a letter, `0–9`, a Greek glyph, or `±`. */
  label: string
  /** Spoken form for aria-label and section headings. */
  name: string
  kind: 'latin' | 'numeric' | 'greek' | 'symbol'
}

const LATIN_DEFS: BucketDef[] = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(c => ({
  key: c, label: c, name: c, kind: 'latin' as const,
}))

const NUMERIC_DEFS: BucketDef[] =
  NUMERIC_MODE === 'split'
    ? [...'0123456789'].map(d => ({ key: d, label: d, name: d, kind: 'numeric' as const }))
    : [{ key: '#', label: '0–9', name: 'numbers', kind: 'numeric' as const }]

const GREEK_DEFS: BucketDef[] = GREEK_LETTERS.map(g => ({
  key: `g:${g.name}`, label: g.symbol, name: g.name, kind: 'greek' as const,
}))

const SYMBOL_DEF: BucketDef = {
  key: SYMBOL_KEY, label: '±', name: 'symbols', kind: 'symbol',
}

/** Every bucket, in display order: A…Z, 0–9, α…ω, ±. */
export const BUCKETS: BucketDef[] = [
  ...LATIN_DEFS, ...NUMERIC_DEFS, ...GREEK_DEFS, SYMBOL_DEF,
]

const BUCKET_BY_KEY = new Map(BUCKETS.map(b => [b.key, b]))
const BUCKET_RANK = new Map(BUCKETS.map((b, i) => [b.key, i]))

export const bucketDef = (key: Bucket): BucketDef | null => BUCKET_BY_KEY.get(key) ?? null
export const bucketLabel = (key: Bucket): string => BUCKET_BY_KEY.get(key)?.label ?? key
export const bucketName = (key: Bucket): string => BUCKET_BY_KEY.get(key)?.name ?? key

/** `#` and `g:` prefixes don't belong in a query string. */
export function bucketToParam(key: Bucket): string {
  if (key === '#') return '0-9'
  if (key === SYMBOL_KEY) return 'symbols'
  return key.startsWith('g:') ? key.slice(2) : key
}

export function paramToBucket(v: string | null): Bucket | null {
  if (!v) return null
  const raw = v.toLowerCase()
  if (raw === 'symbols') return SYMBOL_KEY
  const candidates = [raw === '0-9' ? '#' : raw.toUpperCase(), `g:${raw}`, raw]
  return candidates.find(k => BUCKET_BY_KEY.has(k)) ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Bucket assignment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether a leading locant run is stepped over before looking for a Greek
 * descriptor — `17beta-hydroxy-androstano[2,3-d]isoxazole` files under β rather
 * than under 1. Set false to leave those nine steroid names in the digits.
 *
 * Note this departs from USP/CAS index style, which ignores stereodescriptors
 * outright and would file `beta-carotene` under C. Browsing wants the visible
 * first token; a printed index wants the parent name. Different jobs.
 */
export const SKIP_LOCANTS = true

/**
 * Whether a leading configuration prefix in parentheses is stepped over, so
 * `(S)-ketamine` files under K instead of S. Off by default — turning it on
 * moves every `(R)-`, `(S)-`, `(E)-`, `(Z)-`, `(D)-` and `(L)-` name to a
 * different letter, which is a decision about how you want the index read, not
 * a bug fix. Sign-led names like `(+)-` are unaffected either way: they're
 * caught as symbols before this runs.
 */
export const STRIP_CONFIG_PREFIXES = false

const CONFIG_RE = /^\(\s*(r|s|rs|sr|r\*|s\*|e|z|d|l|dl|d,l)\s*\)[\s\-–—]*/

const GREEK_BY_SYMBOL = new Map<string, string>(GREEK_LETTERS.map(g => [g.symbol, g.name]))

/** Greek glyphs survive this so `β-carotene` can reach the β bucket. */
const stripLead = (s: string) => s.replace(/^[^a-z0-9Ͱ-Ͽ]+/, '')

/** Locants, stereo numbering, and the commas between them: `4,17beta-…` */
const stripLocants = (s: string) => s.replace(/^[\d,'’\-\s]+/, '')

const GREEK_WORD_RE = new RegExp(
  `^(${GREEK_LETTERS.map(g => g.name).join('|')})(?![a-z])`,
)

/**
 * A bracketed group counts as a symbol only when nothing inside it is a letter
 * or digit: `(+)`, `(-)`, `(+/-)`, `(±)` qualify; `(S)`, `(2-aminopropyl)` do
 * not. Outside brackets, any leading non-alphanumeric that isn't Greek counts.
 */
function isSymbolLed(s: string): boolean {
  const bracketed = /^[([{]([^)\]}]*)[)\]}]/.exec(s)
  if (bracketed) {
    const inner = bracketed[1].trim()
    return inner.length > 0 && !/[a-z0-9Ͱ-Ͽ]/i.test(inner)
  }
  const c = s.charAt(0)
  if (!c) return false
  return !/[a-z0-9([{Ͱ-Ͽ]/i.test(c)
}

export function bucketOf(name: string): Bucket {
  const raw = name.trim().toLowerCase()
  if (!raw) return SYMBOL_KEY

  // Sign-led names are decided before anything is stripped away.
  if (isSymbolLed(raw)) return SYMBOL_KEY

  const s = stripLead(STRIP_CONFIG_PREFIXES ? raw.replace(CONFIG_RE, '') : raw)
  if (!s) return SYMBOL_KEY

  const core = SKIP_LOCANTS ? stripLocants(s) : s

  const word = GREEK_WORD_RE.exec(core)
  if (word) return `g:${word[1]}`

  const glyph = GREEK_BY_SYMBOL.get(core.charAt(0))
  if (glyph) return `g:${glyph}`

  const c = s.charAt(0)
  if (c >= 'a' && c <= 'z') return c.toUpperCase()
  if (c >= '0' && c <= '9') return NUMERIC_MODE === 'split' ? c : '#'
  return SYMBOL_KEY
}

const sortKey = (name: string): string => stripLead(name.trim().toLowerCase())

let _ordered: CatalogEntry[] | null = null
let _counts: Record<Bucket, number> | null = null
let _offsets: Record<Bucket, number> | null = null

function buildOrder() {
  const pool = _catalog ?? []
  const rank = (b: Bucket) => BUCKET_RANK.get(b) ?? BUCKETS.length

  const ordered = [...pool].sort((a, b) => {
    const d = rank(bucketOf(a.name)) - rank(bucketOf(b.name))
    if (d !== 0) return d
    return sortKey(a.name).localeCompare(sortKey(b.name), 'en', { sensitivity: 'base' })
  })

  const counts = Object.fromEntries(BUCKETS.map(b => [b.key, 0])) as Record<Bucket, number>
  const offsets = Object.fromEntries(BUCKETS.map(b => [b.key, -1])) as Record<Bucket, number>

  ordered.forEach((e, i) => {
    const b = bucketOf(e.name)
    counts[b] = (counts[b] ?? 0) + 1
    if (offsets[b] === -1) offsets[b] = i
  })

  // An empty bucket resolves to where it *would* start, so jumping to a letter
  // with nothing behind it lands on the next one rather than back at A.
  let next = ordered.length
  for (let i = BUCKETS.length - 1; i >= 0; i--) {
    const k = BUCKETS[i].key
    if (offsets[k] === -1) offsets[k] = next
    else next = offsets[k]
  }

  _ordered = ordered
  _counts = counts
  _offsets = offsets
}

/**
 * The whole catalog in display order: A first, then digits, the Greek
 * descriptors, and the symbol-led names last. Sorted once and cached.
 */
export function orderedCatalog(): CatalogEntry[] {
  if (!_ordered) buildOrder()
  return _ordered!
}

/** Entry count per bucket, for disabling buckets with nothing behind them. */
export function bucketCounts(): Record<Bucket, number> {
  if (!_counts) buildOrder()
  return _counts!
}

/**
 * Index of each bucket's first entry within `orderedCatalog()`. Lets the nav
 * jump into the middle of one continuous run instead of filtering it.
 */
export function bucketOffsets(): Record<Bucket, number> {
  if (!_offsets) buildOrder()
  return _offsets!
}

// ─────────────────────────────────────────────────────────────────────────────
// Search — local, synchronous, no network
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Score one candidate string against the normalized query (0 = no match). */
function scoreText(text: string, q: string, exact: number, prefix: number, word: number, sub: number): number {
  if (!text) return 0
  if (text === q) return exact
  if (text.startsWith(q)) return prefix
  if (text.includes(` ${q}`)) return word
  if (text.includes(q)) return sub
  return 0
}

/**
 * Ranked substring search over name, every brand name, and slug.
 * Ranking: exact slug > exact name > exact brand > name prefix > brand prefix >
 * word-boundary > substring. A hit that came from a brand carries
 * `matchedBrand`, so the result can read "metformin (Glucophage)".
 * ~15k entries scans in well under a frame; no index needed client-side.
 */
export function searchCatalog(query: string, limit = 25): CatalogEntry[] {
  if (!_catalog) return []
  const q = norm(query)
  if (!q) return []

  const scored: { e: CatalogEntry; s: number }[] = []

  for (const e of _catalog) {
    let s = 0
    let matchedBrand: string | undefined

    if (e.slug === query.toLowerCase()) s = 100
    else s = scoreText(norm(e.name), q, 95, 80, 60, 40)

    for (const b of e.brands) {
      const bs = scoreText(norm(b), q, 90, 75, 55, 35)
      if (bs > s) {
        s = bs
        matchedBrand = b
      }
    }

    if (!s && e.slug.includes(q.replace(/ /g, '-'))) s = 30
    if (!s) continue

    if (e.stub) s -= 5 // curated entries first
    scored.push({ e: matchedBrand ? { ...e, matchedBrand } : e, s })
  }

  // Combination brands ("Janumet") → the combination product itself
  const seenCombos = new Map<number, { e: CatalogEntry; s: number }>()
  for (const { brand, entry } of _comboBrands) {
    const s = scoreText(norm(brand), q, 88, 72, 52, 32)
    if (!s) continue
    const prev = seenCombos.get(entry.n)
    if (!prev || s > prev.s) seenCombos.set(entry.n, { e: { ...entry, matchedBrand: brand }, s })
  }
  scored.push(...seenCombos.values())

  scored.sort((a, b) => b.s - a.s || a.e.name.length - b.e.name.length)
  return scored.slice(0, limit).map(x => x.e)
}

export function getBySlug(slug: string): CatalogEntry | null {
  return _bySlug?.get(slug) ?? null
}

export function getByPcid(pcid: string): CatalogEntry | null {
  const m = /^PCID-(\d+)$/.exec(pcid)
  return m ? _byNum?.get(Number(m[1])) ?? null : null
}

/**
 * Paged browse over the ordered catalog.
 *
 * `bucket` narrows the pool to one bucket; `offset` instead starts partway
 * through the full run and keeps going, which is how the nav scrolls across
 * bucket boundaries. `total` always reflects the pool, not the page.
 */
export function browse(
  opts: { type?: 0 | 1 | 2 | 3; bucket?: Bucket; offset?: number; limit?: number } = {},
) {
  if (!_catalog) return { entries: [] as CatalogEntry[], total: 0 }
  const { type, bucket, offset = 0, limit = 50 } = opts

  let pool = orderedCatalog()
  if (type !== undefined) pool = pool.filter(e => e.type === type)
  if (bucket) pool = pool.filter(e => bucketOf(e.name) === bucket)

  return {
    entries: pool.slice(offset, limit === Infinity ? undefined : offset + limit),
    total: pool.length,
  }
}
