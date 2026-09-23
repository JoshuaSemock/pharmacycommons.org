import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  loadCatalog,
  searchCatalog,
  browse,
  orderedCatalog,
  bucketCounts,
  bucketOffsets,
  bucketOf,
  bucketDef,
  bucketLabel,
  bucketName,
  bucketToParam,
  paramToBucket,
  pcidOf,
  toDrug,
  BUCKETS,
  type Bucket,
  type BucketDef,
  type CatalogEntry,
} from './catalog'
import { drugWithBrand, formatBrandName, formatDrugName } from './names'

/** 0 means no cap — every remaining entry renders at once. */
const PAGE_SIZES = [50, 100, 500, 0] as const
const DEFAULT_PAGE = 50

/**
 * Nineteen of the twenty-four Greek letters have nothing behind them in the
 * current data, and the symbol bucket fills only once a source with `(+)-` and
 * `(±)-` names lands. Both are hidden while empty; flip either to render the
 * full row greyed out instead.
 */
const SHOW_EMPTY_GREEK = false
const SHOW_EMPTY_SYMBOL = false

const pageLabel = (n: number) => (n === 0 ? 'Everything' : String(n))

export default function SearchView() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const listTop = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.title = 'Browse the catalog · Pharmacy Commons'
  }, [])

  const query = params.get('q') ?? ''
  const bucket = paramToBucket(params.get('letter'))
  /** Confined to one bucket; otherwise the bucket is just a starting point. */
  const confined = params.get('mode') === 'letter'

  // Number(null) is 0, which is also the 'Everything' size — only read a real value.
  const perRaw = params.get('per')
  const perParam = perRaw === null ? NaN : Number(perRaw)
  const per = (PAGE_SIZES as readonly number[]).includes(perParam) ? perParam : DEFAULT_PAGE
  const pageSize = per === 0 ? Infinity : per

  const [limit, setLimit] = useState<number>(pageSize)

  useEffect(() => {
    loadCatalog()
      .then(() => setReady(true))
      .catch(err => {
        console.error('[catalog] load failed:', err)
        setFailed(true)
      })
  }, [])

  useEffect(() => { setLimit(pageSize) }, [query, bucket, confined, pageSize])

  const patch = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k); else next.set(k, v)
    }
    setParams(next, { replace: true })
  }

  const setQuery = (q: string) =>
    patch({ q: q || null, letter: null, mode: null })   // a search spans the catalog

  const selectBucket = (b: Bucket | null) => {
    patch({
      letter: b ? bucketToParam(b) : null,
      q: null,
      mode: b ? params.get('mode') : null,
    })
    requestAnimationFrame(() => listTop.current?.scrollIntoView({ block: 'start' }))
  }

  const counts = useMemo(() => (ready ? bucketCounts() : null), [ready])
  const offsets = useMemo(() => (ready ? bucketOffsets() : null), [ready])
  const catalogSize = useMemo(() => (ready ? orderedCatalog().length : 0), [ready])

  const searching = !!query.trim()
  /** Where this view starts inside the full run. */
  const start = !searching && !confined && bucket && offsets ? offsets[bucket] : 0

  const { entries, total } = useMemo(() => {
    if (!ready) return { entries: [] as CatalogEntry[], total: 0 }
    if (searching) {
      const hits = searchCatalog(query, 1000)
      return { entries: hits.slice(0, limit === Infinity ? undefined : limit), total: hits.length }
    }
    if (confined && bucket) return browse({ bucket, limit })
    return browse({ offset: start, limit })
  }, [ready, searching, query, confined, bucket, start, limit])

  const remaining = total - start - entries.length
  const hasMore = remaining > 0

  /** Bucket runs, so a continuous list reads A … 9 … ω … ± as you scroll. */
  const groups = useMemo(() => {
    if (searching || confined) return [{ key: 'flat', def: null, items: entries }]
    const out: { key: string; def: BucketDef | null; items: CatalogEntry[] }[] = []
    for (const e of entries) {
      const b = bucketOf(e.name)
      const last = out[out.length - 1]
      if (last && last.key === b) last.items.push(e)
      else out.push({ key: b, def: bucketDef(b), items: [e] })
    }
    return out
  }, [entries, searching, confined])


  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 pb-24">

      {/* Page header and filter */}
      <section className="pt-10 pb-8 sm:pt-14">
        <h1
          className="font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.015em] text-sage-900 sm:text-[2.618rem]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Browse the catalog
        </h1>
        <p className="mt-4 max-w-[42rem] font-sans text-[16px] leading-relaxed text-pretty text-sage-600">
          Every drug in the Commons, from A onward. Filter by name or brand, or jump to a letter.
        </p>

        <div className="mt-6 max-w-lg">
          <div className="flex items-center gap-2 rounded-xl border border-sage-200 bg-white px-4 py-2.5 shadow-sm shadow-sage-900/5 focus-within:border-aqua-400 focus-within:ring-3 focus-within:ring-aqua-200 transition-all">
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-sage-400">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter by name or brand, e.g. metformin or Glucophage"
              aria-label="Filter the catalog"
              className="flex-1 bg-transparent font-sans text-[14px] text-sage-900 placeholder-sage-400 outline-none"
              autoFocus={!!query}
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-sage-400 hover:text-sage-600" aria-label="Clear search">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Character index */}
      <CharacterIndex
        counts={counts}
        active={searching ? null : bucket}
        onSelect={selectBucket}
      />

      <div ref={listTop} className="scroll-mt-[calc(var(--nav-h,5.75rem)_+_3rem)]" />

      {/* Results */}
      <section className="pt-6">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
          <h2 className="font-sans text-[13px] text-sage-600">
            {searching
              ? <>Matches for <span className="font-medium text-sage-900">{query}</span></>
              : confined && bucket
                ? <>Drugs filed under <span className="font-medium text-sage-900">{bucketLabel(bucket)}</span></>
                : bucket
                  ? <>The catalog from <span className="font-medium text-sage-900">{bucketLabel(bucket)}</span> onward</>
                  : 'The full catalog, A onward'}
            {ready && total > 0 && (
              <span className="ml-2 font-mono text-[12px] text-sage-400">
                {(start + 1).toLocaleString()}–{(start + entries.length).toLocaleString()} of {total.toLocaleString()}
              </span>
            )}
          </h2>

          {ready && !failed && (
            <div className="flex flex-wrap items-center gap-4">
              {bucket && !searching && (
                <div className="flex items-center rounded-lg border border-sage-200 bg-white p-0.5">
                  <ScopeButton
                    label="Browse on"
                    title={`Start at ${bucketName(bucket)} and keep going`}
                    active={!confined}
                    onClick={() => patch({ mode: null })}
                  />
                  <ScopeButton
                    label={`Only ${bucketLabel(bucket)}`}
                    title={`Show just the ${bucketName(bucket)} entries`}
                    active={confined}
                    onClick={() => patch({ mode: 'letter' })}
                  />
                </div>
              )}

              <label className="flex items-center gap-2 font-sans text-[12.5px] text-sage-600">
                Show
                <select
                  value={per}
                  onChange={e => patch({ per: e.target.value })}
                  className="rounded-lg border border-sage-200 bg-white px-2 py-1 font-mono text-[12px] text-sage-900 outline-none focus:border-aqua-400 focus:ring-2 focus:ring-aqua-200"
                >
                  {PAGE_SIZES.map(n => (
                    <option key={n} value={n}>{pageLabel(n)}</option>
                  ))}
                </select>
                {per !== 0 && <span className="text-sage-400">at a time</span>}
              </label>
            </div>
          )}
        </div>

        {failed ? (
          <div className="py-16 text-center">
            <p className="font-sans text-sage-700">The catalog didn’t load.</p>
            <button onClick={() => window.location.reload()} className="mt-2 font-sans text-[13px] text-aqua-700 hover:underline">
              Reload the page
            </button>
          </div>
        ) : !ready ? (
          <div className="py-16 text-center">
            <p className="font-sans text-sage-600">Loading the catalog…</p>
          </div>
        ) : total === 0 ? (
          <div className="py-16 text-center">
            <p className="font-sans text-sage-600">
              Nothing in the catalog matches <span className="font-medium text-sage-900">{query}</span>.
            </p>
            <button onClick={() => setQuery('')} className="mt-2 font-sans text-[13px] text-aqua-700 hover:underline">
              Browse every drug instead
            </button>
          </div>
        ) : (
          <>
            {groups.map(g => (
              <div key={g.key} className="mb-10 last:mb-0">
                {g.def && (
                  <div id={`bucket-${bucketToParam(g.key)}`} className="mb-3 flex items-baseline gap-3 scroll-mt-[calc(var(--nav-h,5.75rem)_+_3rem)]">
                    <span
                      className="font-display text-[26px] font-semibold leading-none text-sage-300"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {g.def.label}
                    </span>
                    {(g.def.kind === 'greek' || g.def.kind === 'symbol') && (
                      <span className="font-sans text-[12px] text-sage-400">{g.def.name}</span>
                    )}
                    <span className="h-px flex-1 self-center bg-sage-200" />
                    <span className="font-mono text-[11px] text-sage-400">
                      {counts ? (counts[g.key] ?? 0).toLocaleString() : ''}
                    </span>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.items.map(e => (
                    <DrugCard key={`${e.n}-${e.matchedBrand ?? ''}`} entry={e} onSelect={() => navigate(`/drugs/${e.slug}`)} />
                  ))}
                </div>
              </div>
            ))}

            {hasMore && (
              <div className="mt-8 flex flex-col items-center gap-2">
                <button
                  onClick={() => setLimit(l => l + pageSize)}
                  className="rounded-lg bg-aqua-600 px-6 py-2.5 font-sans text-[13px] font-medium text-white hover:bg-aqua-700 transition-colors"
                >
                  Load {Math.min(per || remaining, remaining).toLocaleString()} more
                </button>
                <span className="font-mono text-[11px] text-sage-400">
                  {remaining.toLocaleString()} left
                </span>
              </div>
            )}
          </>
        )}
      </section>

      {/* Data provenance footer */}
      {!searching && (
        <footer className="mt-16 border-t border-sage-200 pt-8">
          <div className="grid gap-6 sm:grid-cols-3">
            <DataSource icon="🏛️" label="FDA DailyMed" desc="Structured product labels, NDC directory, drug interactions" />
            <DataSource icon="🧪" label="PubChem / ChEMBL" desc="Chemical structure, CAS numbers, InChIKey identifiers" />
            <DataSource icon="🌿" label="Founded by Dr. Joshua Semock, PharmD" desc="(Aug. 2026) contact@pharmacycommons.org" />
          </div>
        </footer>
      )}
    </main>
  )
}

/**
 * A–Z, the numbers, the Greek descriptors, then the symbol bucket — set as type
 * rather than as chips, with hairline dividers between runs. Empty buckets in
 * the Latin and numeric runs stay inert; empty Greek and symbol buckets are
 * omitted entirely unless their SHOW_EMPTY flag is set.
 */
function CharacterIndex({
  counts, active, onSelect,
}: {
  counts: Record<Bucket, number> | null
  active: Bucket | null
  onSelect: (b: Bucket | null) => void
}) {
  const visible = BUCKETS.filter(b => {
    const n = counts?.[b.key] ?? 0
    if (b.kind === 'greek') return SHOW_EMPTY_GREEK || n > 0
    if (b.kind === 'symbol') return SHOW_EMPTY_SYMBOL || n > 0
    return true
  })

  return (
    <nav
      aria-label="Browse by first character"
      className="sticky top-[var(--nav-h,5.75rem)] z-30 -mx-4 border-y border-sage-200 bg-sage-50/90 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6"
    >
      <div className="flex items-center gap-1 overflow-x-auto sm:flex-wrap sm:overflow-visible">
        <button
          onClick={() => onSelect(null)}
          aria-pressed={!active}
          className={`shrink-0 rounded px-2 py-1 font-sans text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-600 ${
            !active ? 'text-sage-900 font-medium' : 'text-sage-600 hover:text-sage-900'
          }`}
        >
          All
        </button>

        {visible.map((b, i) => {
          const n = counts?.[b.key] ?? 0
          const isActive = active === b.key
          const startsRun = i > 0 && visible[i - 1].kind !== b.kind
          return (
            <span key={b.key} className="flex shrink-0 items-center">
              <span
                className={`mx-1 h-4 w-px bg-sage-200 ${i === 0 || startsRun ? '' : 'hidden'}`}
                aria-hidden="true"
              />
              <button
                onClick={() => onSelect(isActive ? null : b.key)}
                disabled={!n}
                aria-pressed={isActive}
                aria-label={b.kind === 'latin' || b.kind === 'numeric' ? undefined : b.name}
                title={n ? `${b.name} — ${n.toLocaleString()} entries` : `${b.name} — no entries`}
                className={`rounded px-[7px] py-1 font-mono text-[13px] leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-600 ${
                  !n
                    ? 'cursor-default text-sage-300'
                    : isActive
                      ? 'bg-aqua-600 font-medium text-white'
                      : 'text-sage-700 hover:bg-sage-100 hover:text-sage-900'
                }`}
              >
                {b.label}
              </button>
            </span>
          )
        })}
      </div>
    </nav>
  )
}

function ScopeButton({
  label, title, active, onClick,
}: {
  label: string; title: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`rounded-[6px] px-2.5 py-1 font-sans text-[12px] transition-colors ${
        active ? 'bg-sage-100 font-medium text-sage-900' : 'text-sage-600 hover:text-sage-900'
      }`}
    >
      {label}
    </button>
  )
}

function DrugCard({ entry, onSelect }: { entry: CatalogEntry; onSelect: () => void }) {
  const drug = toDrug(entry)
  const monogram = entry.name.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '··'
  // A brand hit reads "metformin (Glucophage)"; the line under it lists the drug's other brands.
  const title = entry.matchedBrand ? drugWithBrand(entry.name, entry.matchedBrand) : formatDrugName(entry.name)
  const otherBrands = entry.brands.filter(b => b !== entry.matchedBrand).map(formatBrandName)
  const subtitle =
    otherBrands.length > 0
      ? otherBrands.slice(0, 3).join(', ') + (otherBrands.length > 3 ? ` +${otherBrands.length - 3} more` : '')
      : entry.type === 1
        ? 'combination product'
        : drug.entryType

  return (
    <button
      onClick={onSelect}
      className="group rounded-xl border border-sage-200 bg-white p-4 text-left transition-all hover:border-sage-300 hover:shadow-md hover:shadow-sage-900/5 hover:-translate-y-0.5"
    >
      <div className="mb-3 flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sage-100 font-mono text-[11px] font-medium text-sage-600">
          {monogram}
        </span>
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-sage-900 group-hover:text-aqua-700 transition-colors" style={{ fontFamily: 'var(--font-display)', fontSize: '16px', lineHeight: 1.25 }}>
            {title}
          </h3>
          <p className="truncate font-sans text-[11px] text-sage-600" title={otherBrands.join(', ') || undefined}>
            {subtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-sage-100 pt-2.5">
        <span className="font-mono text-[10.5px] text-sage-400">{pcidOf(entry)}</span>
        <span className="flex items-center gap-1.5">
          {entry.stub === 1 && (
            <span className="rounded-md border border-sage-200 bg-sage-50 px-2 py-0.5 font-sans text-[10px] text-sage-600">
              Needs an editor
            </span>
          )}
          {drug.schedule && (
            <span className="rounded-md border border-coral-200 bg-coral-100 px-2 py-0.5 font-mono text-[10px] font-medium text-coral-600">
              {drug.schedule}
            </span>
          )}
        </span>
      </div>
    </button>
  )
}

function DataSource({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-xl leading-none mt-0.5">{icon}</span>
      <div>
        <p className="font-sans text-[13px] font-medium text-sage-800">{label}</p>
        <p className="font-sans text-[12px] text-sage-600 leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}
