import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { loadCatalog, orderedCatalog, pcidOf, searchCatalog, toDrug } from '../catalog'
import { formatDate } from '../blog'
import { ctaFor, whatsNew } from '../updates'
import Stamp from '../components/Stamp'

/** Old links put browse state on `/`; those parameters now belong to /browse. */
const BROWSE_PARAMS = ['q', 'letter', 'mode', 'per']
/** Entries shown in What's new; older ones stay on /tools, /lists and /blog. */
const RECENT_UPDATES = 5

/** Autofocus the search box only with a mouse or trackpad. On a phone it pops
    the keyboard (Android) or zooms the page (iOS) before the visitor has
    looked at anything. */
const FINE_POINTER =
  typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches

export default function Home() {
  const { search } = useLocation()
  const legacyBrowse = BROWSE_PARAMS.some(k => new URLSearchParams(search).has(k))

  useEffect(() => {
    document.title = 'Pharmacy Commons'
  }, [])

  if (legacyBrowse) return <Navigate to={`/browse${search}`} replace />

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <Hero />
      <WhatsNew />
      <SourcesFooter />
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────────────────────────

function Hero() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [catalogSize, setCatalogSize] = useState<number | null>(null)

  // The full catalog is ~15,000 rows paged in from Supabase. Fetching and
  // indexing it on mount was most of the homepage's main-thread blocking time,
  // so wait until someone actually starts typing (same rule as the header
  // search). loadCatalog() caches, so a visitor who already browsed pays nothing.
  const wantsCatalog = query.length > 0
  useEffect(() => {
    if (!wantsCatalog || catalogSize !== null) return
    loadCatalog()
      .then(() => setCatalogSize(orderedCatalog().length))
      .catch(err => console.error('[catalog] load failed:', err))
  }, [wantsCatalog, catalogSize])

  const suggestions = catalogSize !== null && query.trim().length > 1 ? searchCatalog(query, 6) : []

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    navigate(q ? `/browse?q=${encodeURIComponent(q)}` : '/browse')
  }

  return (
    <section className="pt-8 pb-6 text-center sm:pt-16 sm:pb-14">
      {/* Title. Type specs (size, weight, tracking) come from .pc-hero-title in
          src/index.css, matched to the Nav wordmark: the bare h1 rule there is
          unlayered, so text-* utilities on an h1 are ignored. */}
      <h1 className="pc-hero-title mx-auto mb-3 max-w-4xl text-balance text-ink">
        Pharmacy Commons
      </h1>

      {/* Scope and educational disclaimer */}
      <p className="mx-auto mb-6 max-w-xl font-sans text-[13px] leading-normal text-pretty text-ink sm:text-[13.5px]">
        Together we can cultivate our commons to create an open compendium of drug information and clinical evidence accessible to all.
        Query structured data in an open educational source for providers and the public. While not to be used as a substitute for direct medical evaluation or clinical recommendation, this resource can be used to aid licensed practitioners.
      </p>

      <div className="relative mx-auto max-w-lg text-left">
        <form onSubmit={handleSubmit} role="search">
          <div className="lp-field flex items-center gap-2 rounded-md px-4 py-3">
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-ink">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              placeholder="drug, brand name, combination product, class..."
              aria-label="Search the commons"
              className="min-w-0 flex-1 bg-transparent font-sans text-[14px] text-ink placeholder:text-ink outline-none"
              autoFocus={FINE_POINTER}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="-my-2 -mr-2 inline-flex min-h-[32px] min-w-[32px] items-center justify-center text-ink"
                aria-label="Clear search"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </form>

        {focused && suggestions.length > 0 && (
          <div className="absolute top-full z-20 mt-1.5 w-full overflow-hidden rounded-md bg-paper shadow-lg shadow-black/15">
            {suggestions.map(entry => {
              const schedule = toDrug(entry).schedule
              return (
                <button
                  key={entry.n}
                  onMouseDown={() => navigate(`/drugs/${entry.slug}`)}
                  className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-100"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-[14px] font-medium text-ink">{entry.name}</span>
                    <span className="block truncate font-sans text-[12px] text-ink">
                      {entry.brand ?? (entry.type === 1 ? 'Combination product' : 'Single ingredient')}
                    </span>
                  </span>
                  {schedule && (
                    <span className="lp-raised rounded-md bg-salmon-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink">
                      {schedule}
                    </span>
                  )}
                  <span className="shrink-0 font-mono text-[11px] text-ink">{pcidOf(entry)}</span>
                </button>
              )
            })}
            <Link
              to={`/browse?q=${encodeURIComponent(query.trim())}`}
              className="lp-rule-t flex min-h-[48px] items-center px-4 py-2.5 font-sans text-[13px] text-ink hover:bg-neutral-100"
            >
              See every match for “{query.trim()}”
            </Link>
          </div>
        )}
      </div>

      <p className="mt-5 font-sans text-[13px] text-ink sm:text-[13.5px]">
        Or{' '}
        <Link to="/browse" className="font-medium text-ink underline-offset-2 hover:underline">
          {catalogSize !== null
            ? `browse all ${catalogSize.toLocaleString()} entries, A to Z`
            : 'browse the full catalog, A to Z'}
        </Link>
      </p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// What's new — shipped features (src/updates.ts) and blog posts, newest first
// ─────────────────────────────────────────────────────────────────────────────

function WhatsNew() {
  const items = useMemo(() => whatsNew(RECENT_UPDATES), [])
  if (items.length === 0) return null

  return (
    <section
      aria-labelledby="whats-new-heading"
      className="lp-rule-t pt-10 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-x-16"
    >
      <div className="mb-6 lg:mb-0">
        <h2
          id="whats-new-heading"
          className="font-display text-[26px] font-semibold leading-snug text-ink"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          What's new in the Commons
        </h2>
        <p className="mt-2 font-sans text-[14.5px] leading-relaxed text-ink">
          New tools, features, and writing from the Community Commons Blog, as they ship.
        </p>
        <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-sans text-[13.5px] font-medium">
          <Link to="/tools" className="text-ink underline-offset-2 hover:underline">
            All tools
          </Link>
          <Link to="/blog" className="text-ink underline-offset-2 hover:underline">
            All posts
          </Link>
        </p>
      </div>

      <ul className="lp-divide-y max-w-[46rem]">
        {items.map(item => (
          <li key={item.id} className="py-6 first:pt-0">
            <article>
              <p className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[13px] text-ink">
                <time dateTime={item.date}>{formatDate(item.date)}</time>
                <Stamp>{item.kind}</Stamp>
              </p>
              <h3
                className="font-display text-[21px] font-semibold leading-snug text-balance text-ink"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <Link
                  to={item.to}
                  className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
                >
                  {item.title}
                </Link>
              </h3>
              {item.summary ? (
                <p className="mt-2 line-clamp-3 font-sans text-[15px] leading-[1.6] text-pretty text-ink">
                  {item.summary}
                </p>
              ) : (
                item.detail && <p className="mt-1.5 font-sans text-[13px] text-ink">{item.detail}</p>
              )}
              <Link
                to={item.to}
                aria-label={`${ctaFor(item)}: ${item.title}`}
                className="mt-2 inline-block font-sans text-[13.5px] font-medium text-ink underline-offset-2 hover:underline"
              >
                {ctaFor(item)}
              </Link>
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sources footer
// ─────────────────────────────────────────────────────────────────────────────

function SourcesFooter() {
  return (
    <footer className="lp-rule-t mt-16 pt-8">
      <div className="grid gap-6 sm:grid-cols-3">
        <DataSource
          label="Founded by Dr. Joshua Semock, PharmD"
          desc="(2026) contact@pharmacycommons.org"
        />
      </div>
    </footer>
  )
}

function DataSource({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-xl leading-none" aria-hidden="true">
      </span>
      <div>
        <p className="font-sans text-[13px] font-medium text-ink">{label}</p>
        <p className="font-sans text-[12px] leading-relaxed text-ink">{desc}</p>
      </div>
    </div>
  )
}
