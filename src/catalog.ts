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
    _ordered = null              // invalidate derived caches
    _counts = null
    _offsets = null
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
// Browse buckets — A…Z, then 0…9, then α…ω, then ±
// ─────────────────────────────────────────────────────────────────────────────

/** One 0–9 bucket, or ten separate digit buckets. */
export const NUMERIC_MODE: 'single' | 'split' = 'single'

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

const GREEK_BY_SYMBOL = const GREEK_BY_SYMBOL = new Map<string, string>(GREEK_LETTERS.map(g => [g.symbol, g.name]))

/** Greek glyphs survive this so `β-carotene` can reach the β bucket. */
const stripLead = (s: string) => s.replace(/^[^a-z0-9\u0370-\u03ff]+/, '')

/** Locants, stereo numbering, and the commas between them: `4,17beta-…` */
const stripLocants = (s: string) => s.replace(/^[\d,'\u2019\-\s]+/, '')

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
    return inner.length > 0 && !/[a-z0-9\u0370-\u03ff]/i.test(inner)
  }
  const c = s.charAt(0)
  if (!c) return false
  return !/[a-z0-9([{\u0370-\u03ff]/i.test(c)
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

/**
 * Paged browse over the ordered catalog.
 *
 * `bucket` narrows the pool to one bucket; `offset` instead starts partway
 * through the full run and keeps going, which is how the nav scrolls across
 * bucket boundaries. `total` always reflects the pool, not the page.
 */
export function browse(
  opts: { type?: 0 | 1; bucket?: Bucket; offset?: number; limit?: number } = {},
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
