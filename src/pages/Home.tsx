import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { loadCatalog, orderedCatalog, pcidOf, searchCatalog, toDrug } from '../catalog'
import { formatDate, listPosts } from '../blog'

/** Old links put browse state on `/`; those parameters now belong to /browse. */
const BROWSE_PARAMS = ['q', 'letter', 'mode', 'per']
const RECENT_POSTS = 3

export default function Home() {
  const { search } = useLocation()
  const legacyBrowse = BROWSE_PARAMS.some(k => new URLSearchParams(search).has(k))

  useEffect(() => {
    document.title = 'Pharmacy Commons'
  }, [])

  if (legacyBrowse) return <Navigate to={`/browse${search}`} replace />

  return (
    <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      <Hero />
      <RecentPosts />
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

  useEffect(() => {
    loadCatalog()
      .then(() => setCatalogSize(orderedCatalog().length))
      .catch(err => console.error('[catalog] load failed:', err))
  }, [])

  const suggestions = catalogSize !== null && query.trim().length > 1 ? searchCatalog(query, 6) : []

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    navigate(q ? `/browse?q=${encodeURIComponent(q)}` : '/browse')
  }

  return (
    <section className="pt-16 pb-14 text-center">
      <p className="mb-3 font-sans text-[13.5px] font-medium text-aqua-700">
        This is our Commons, an open source compendium of medical and pharmacy knowledge
      </p>
      <h1
        className="mb-4 font-display text-4xl font-semibold leading-[1.1] text-balance text-sage-900 sm:text-5xl"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Query drug information by active ingredients,
        <br className="hidden sm:block" /> formulations, classes, and more
      </h1>
      <p className="mx-auto mb-8 max-w-xl font-sans text-[15px] leading-relaxed text-pretty text-sage-600">
        Information on this website is for educational purposes, not for medical use without a providers discretion.
      </p>

      <div className="relative mx-auto max-w-lg text-left">
        <form onSubmit={handleSubmit} role="search">
          <div className="flex items-center gap-2 rounded-xl border border-sage-200 bg-white px-4 py-3 shadow-sm shadow-sage-900/5 transition-all focus-within:border-aqua-400 focus-within:ring-3 focus-within:ring-aqua-200">
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-sage-400">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              placeholder="...ibuprofen, Advil, NSAID, analgesic, pain, etc."
              aria-label="Search the catalog"
              className="flex-1 bg-transparent font-sans text-[14px] text-sage-900 placeholder-sage-400 outline-none"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-sage-400 hover:text-sage-600"
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
          <div className="absolute top-full z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-sage-200 bg-white shadow-lg shadow-sage-900/5">
            {suggestions.map(entry => {
              const schedule = toDrug(entry).schedule
              return (
                <button
                  key={entry.n}
                  onMouseDown={() => navigate(`/drugs/${entry.slug}`)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-sage-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-[14px] font-medium text-sage-900">{entry.name}</span>
                    <span className="block truncate font-sans text-[12px] text-sage-600">
                      {entry.brand ?? (entry.type === 1 ? 'Combination product' : 'Single ingredient')}
                    </span>
                  </span>
                  {schedule && (
                    <span className="rounded-md border border-coral-200 bg-coral-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-coral-600">
                      {schedule}
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-sage-400">{pcidOf(entry)}</span>
                </button>
              )
            })}
            <Link
              to={`/browse?q=${encodeURIComponent(query.trim())}`}
              className="block border-t border-sage-100 px-4 py-2.5 font-sans text-[13px] text-aqua-700 hover:bg-sage-50"
            >
              See every match for “{query.trim()}”
            </Link>
          </div>
        )}
      </div>

      <p className="mt-5 font-sans text-[13.5px] text-sage-600">
        Or{' '}
        <Link to="/browse" className="font-medium text-aqua-700 underline-offset-2 hover:underline">
          {catalogSize !== null
            ? `browse all ${catalogSize.toLocaleString()} entries, A to Z`
            : 'browse the full catalog, A to Z'}
        </Link>
      </p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent posts
// ─────────────────────────────────────────────────────────────────────────────

function RecentPosts() {
  const posts = useMemo(() => listPosts().slice(0, RECENT_POSTS), [])
  if (posts.length === 0) return null

  return (
    <section
      aria-labelledby="recent-posts-heading"
      className="border-t border-sage-200 pt-10 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-x-16"
    >
      <div className="mb-6 lg:mb-0">
        <h2
          id="recent-posts-heading"
          className="font-display text-[26px] font-semibold leading-snug text-sage-900"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          From the Community Commons Blog
        </h2>
        <p className="mt-2 font-sans text-[14.5px] leading-relaxed text-sage-600">
          Decisions, commentary, and methodology, written down as the work happens.
        </p>
        <Link
          to="/blog"
          className="mt-4 inline-block font-sans text-[13.5px] font-medium text-aqua-700 underline-offset-2 hover:underline"
        >
          All posts
        </Link>
      </div>

      <ul className="max-w-[46rem] divide-y divide-sage-200">
        {posts.map(post => (
          <li key={post.slug} className="py-6 first:pt-0">
            <article>
              <p className="mb-1.5 font-sans text-[13px] text-sage-600">
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                <span className="ml-3">{post.readingMinutes} minute read</span>
              </p>
              <h3
                className="font-display text-[21px] font-semibold leading-snug text-balance text-sage-900"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <Link
                  to={`/blog/${post.slug}`}
                  className="transition-colors hover:text-aqua-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500"
                >
                  {post.title}
                </Link>
              </h3>
              {post.summary && (
                <p className="mt-2 line-clamp-2 font-sans text-[15px] leading-[1.6] text-pretty text-sage-600">
                  {post.summary}
                </p>
              )}
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
    <footer className="mt-16 border-t border-sage-200 pt-8">
      <div className="grid gap-6 sm:grid-cols-3">
        <DataSource label="FDA DailyMed" desc="Structured product labels, NDC directory, drug interactions" />
        <DataSource label="PubChem / ChEMBL" desc="Chemical structure, CAS numbers, InChIKey identifiers" />
        <DataSource
          label="Founded by Dr. Joshua Semock, PharmD"
          desc="(Aug. 2026) contact@pharmacycommons.org"
        />
      </div>
    </footer>
  )
}

function DataSource({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-xl leading-none" aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className="font-sans text-[13px] font-medium text-sage-800">{label}</p>
        <p className="font-sans text-[12px] leading-relaxed text-sage-600">{desc}</p>
      </div>
    </div>
  )
}
