import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { entryKindLine, loadCatalog, orderedCatalog, pcidOf, searchCatalog, toDrug } from '../catalog'
import { formatDate, listPosts } from '../blog'
import { loadListPreview, type ListPreview } from '../homeLists'
import { formatDrugName } from '../names'
import { TOOLS, isActive } from '../tools'
import { ctaFor, whatsNew } from '../updates'
import Stamp from '../components/Stamp'

/** Old links put browse state on `/`; those parameters now belong to /browse. */
const BROWSE_PARAMS = ['q', 'letter', 'mode', 'per']
/** Entries shown in What's new; older ones stay on /tools, /lists and /blog. */
const RECENT_UPDATES = 3
/** Rows a collapsible list tile shows on phones before "Show all". */
const PHONE_ROWS = 5

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
      <div className="pc-bento">
        <Hero />
        <WhatsNew />
        <DestinationTile
          area="browse"
          tint="mint"
          to="/browse"
          title="Browse drugs"
          blurb="Every drug and active moiety from A to Z, with salts, brand names and combination products nested under each one."
        />
        <DestinationTile
          area="about"
          tint="hepatica"
          to="/about"
          title="About"
          blurb="What the Commons is, why it exists and who runs it."
        />
        <DestinationTile
          area="classes"
          tint="salmon"
          to="/classifications"
          title="Classifications"
          blurb="Pharmacologic classes from FDA, RxClass and ClassyFire, searchable and comparable."
        />
        <DestinationTile
          area="lists"
          tint="mint"
          to="/lists"
          title="Lists"
          blurb="MPJE, do-not-crush, arrhythmia risk, anticholinergic burden and more."
        />
        <DestinationTile
          area="network"
          tint="salmon"
          to="/network"
          title="Network"
          blurb="See how a drug, class or condition connects to others, with the source of every line."
        />
        <ListTile area="topdrugs" slug="most-used-drugs-us" title="Most-used drugs in the US" count={10} ranked collapsible />
        <ToolsTile />
        <DestinationTile
          area="dictionary"
          tint="hepatica"
          to="/tools/dictionary"
          title="Dictionary"
          blurb="Spell-check drug names and medical terms in Word, with about 43,000 words."
        />
        <ListTile area="dnc" slug="do-not-crush" title="Do not crush" count={5} />
        <ListTile area="qtc" slug="arrhythmia-risk-long-qt" title="QTc prolonging medications" count={5} />
        <DestinationTile
          area="references"
          tint="salmon"
          to="/references"
          title="References"
          blurb="Every source dataset and reference behind the Commons, with its license."
        />
        <DestinationTile
          area="resources"
          tint="mint"
          to="/resources"
          title="Resources"
          blurb="Outside links, grouped by topic."
        />
        <BlogTile />
        <Contribute />
      </div>
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
    <section className="pc-bento__hero lp-raised relative z-10 flex flex-col justify-center rounded-md px-6 py-10 text-center sm:py-14">
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
          <div className="lp-field lp-foil flex items-center gap-2 rounded-md px-4 py-3">
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
          <div className="lp-popover pc-grain absolute top-full z-20 mt-1.5 grid w-full gap-1.5 overflow-hidden rounded-lg bg-paper p-1.5">
            {suggestions.map(entry => {
              const schedule = toDrug(entry).schedule
              return (
                <button
                  key={entry.n}
                  onMouseDown={() => navigate(`/drugs/${entry.slug}`)}
                  data-autocomplete
                  className="lp-option flex min-h-[48px] w-full items-center gap-3 rounded-md px-4 py-2.5 text-left focus-visible:shadow-deboss focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="lp-link-text block truncate font-sans text-[14px] text-ink">{entry.name}</span>
                    <span className="block truncate font-sans text-[12px] text-ink">
                      {entryKindLine(entry)}
                    </span>
                  </span>
                  {schedule && (
                    <span className="lp-label rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink">
                      {schedule}
                    </span>
                  )}
                  <span className="shrink-0 font-mono text-[11px] text-ink">{pcidOf(entry)}</span>
                </button>
              )
            })}
            <Link
              to={`/browse?q=${encodeURIComponent(query.trim())}`}
              data-autocomplete
              className="lp-option lp-link-text flex min-h-[48px] items-center rounded-md px-4 py-2.5 font-sans text-[13px] text-ink focus-visible:shadow-deboss focus-visible:outline-none"
            >
              See every match for “{query.trim()}”
            </Link>
          </div>
        )}
      </div>

      <p className="mt-5 font-sans text-[13px] text-ink sm:text-[13.5px]">
        Or{' '}
        <Link to="/browse" className="lp-press ml-0.5 inline-block rounded-md px-2 py-0.5 text-ink">
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
      className="pc-bento__new lp-raised min-w-0 rounded-md p-6"
    >
      <div className="mb-6">
        <h2 id="whats-new-heading" className="pc-tile-title text-ink">
          What's new in the Commons
        </h2>
        <p className="mt-2 font-sans text-[14.5px] leading-relaxed text-ink">
          New tools, features, and writing from the Community Commons Blog, as they ship.
        </p>
        <p className="mt-4 flex flex-wrap gap-2 font-sans text-[13.5px]">
          <Link to="/tools" className="lp-press inline-flex items-center rounded-md px-2 py-0.5 text-ink">
            All tools
          </Link>
          <Link to="/blog" className="lp-press inline-flex items-center rounded-md px-2 py-0.5 text-ink">
            All posts
          </Link>
        </p>
      </div>

      <ul className="lp-divide-y">
        {items.map((item, i) => (
          <li key={item.id} className={`py-4 first:pt-0 ${i >= 2 ? 'max-md:hidden' : ''}`}>
            <article>
              <p className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[13px] text-ink">
                <time dateTime={item.date}>{formatDate(item.date)}</time>
                <Stamp>{item.kind}</Stamp>
              </p>
              <h3 className="pc-update-title text-balance text-ink">
                <Link
                  to={item.to}
                  className="lp-press -mx-2 inline-block rounded-md px-2 py-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
                >
                  {item.title}
                </Link>
              </h3>
              {item.summary ? (
                <p className="mt-2 line-clamp-3 font-sans lg:line-clamp-2 text-[15px] leading-[1.6] text-pretty text-ink">
                  {item.summary}
                </p>
              ) : (
                item.detail && <p className="mt-1.5 font-sans text-[13px] text-ink">{item.detail}</p>
              )}
              <Link
                to={item.to}
                aria-label={`${ctaFor(item)}: ${item.title}`}
                className="lp-press mt-2 inline-block rounded-md px-2 py-0.5 font-sans text-[13.5px] text-ink lg:hidden"
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

// ─────────────────────────────────────────────────────────────────────────────
// Bento destination tiles (layout classes live in src/index.css, .pc-bento)
// ─────────────────────────────────────────────────────────────────────────────

/** A whole-tile link: one .lp-card, the title names the link. */
function DestinationTile({
  area,
  tint,
  to,
  title,
  blurb,
}: {
  area: string
  /** Brand pastel for the card; it deepens as the card presses in (index.css, .pc-tint-*). */
  tint?: 'mint' | 'hepatica' | 'salmon'
  to: string
  title: string
  blurb: string
}) {
  return (
    <Link to={to} className={`pc-bento__tile pc-bento__${area} lp-card ${tint ? `pc-tint pc-tint-${tint} ` : ''}rounded-md p-6`}>
      <h2 className="pc-tile-title lp-link-text text-ink">{title}</h2>
      <p className="mt-2 font-sans text-[14px] leading-relaxed text-pretty text-ink max-md:line-clamp-5">{blurb}</p>
    </Link>
  )
}

/** True once the element has come within ~300px of the viewport (then stays true). */
function useNearViewport<T extends Element>() {
  const ref = useRef<T | null>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [near])
  return { ref, near }
}

/** A panel that previews the first entries of a published list. */
function ListTile({
  area,
  slug,
  title,
  count,
  ranked = false,
  collapsible = false,
}: {
  area: string
  slug: string
  title: string
  count: number
  ranked?: boolean
  /** On phones show the first PHONE_ROWS entries, with a row to show the rest. */
  collapsible?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const { ref, near } = useNearViewport<HTMLElement>()
  const [preview, setPreview] = useState<ListPreview | null>(null)
  const headingId = `home-${area}-heading`

  useEffect(() => {
    if (!near) return
    let live = true
    loadListPreview(slug, count).then(p => {
      if (live) setPreview(p)
    })
    return () => {
      live = false
    }
  }, [near, slug, count])

  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      className={`pc-bento__tile pc-bento__list pc-bento__${area} lp-raised rounded-md p-6`}
    >
      <h2 id={headingId} className="pc-tile-title text-ink">
        {title}
      </h2>
      {preview && preview.items.length > 0 && (
        <ol className="pc-rows mt-3">
          {preview.items.map((item, i) => (
            <li
              key={`${item.position}-${item.name}`}
              className={collapsible && !expanded && i >= PHONE_ROWS ? 'max-md:hidden' : undefined}
            >
              {item.slug ? (
                <Link to={`/drugs/${item.slug}`} className="pc-row lp-press rounded-md text-ink">
                  {ranked && <span className="pc-row__rank">{item.rank ?? item.position}</span>}
                  <span className="pc-row__text">{formatDrugName(item.name)}</span>
                </Link>
              ) : (
                <span className="pc-row text-ink">
                  {ranked && <span className="pc-row__rank">{item.rank ?? item.position}</span>}
                  <span className="pc-row__text">{formatDrugName(item.name)}</span>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {collapsible && preview && preview.items.length > PHONE_ROWS && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(e => !e)}
          className="pc-row pc-row--more lp-toggle mt-3 rounded-md text-ink md:hidden"
        >
          {expanded ? `Show first ${PHONE_ROWS}` : `Show all ${preview.items.length}`}
        </button>
      )}
      <Link to={`/lists/${slug}`} className="pc-row pc-row--more lp-press mt-3 rounded-md text-ink">
        {preview && preview.total > preview.items.length ? 'See the full list' : 'Open the list'}
      </Link>
    </section>
  )
}

/** Tools: the live ones by name. */
function ToolsTile() {
  const tools = TOOLS.filter(t => isActive(t) && t.section !== 'lists')
  return (
    <section aria-labelledby="home-tools-heading" className="pc-bento__tile pc-bento__list pc-bento__tools lp-raised rounded-md p-6">
      <h2 id="home-tools-heading" className="pc-tile-title text-ink">
        Tools
      </h2>
      <ul className="pc-rows pc-rows--2 mt-3">
        {tools.map(tool => (
          <li key={tool.id}>
            {tool.to ? (
              <Link to={tool.to} className="pc-row lp-press rounded-md text-ink">
                <span className="pc-row__text">{tool.name}</span>
              </Link>
            ) : (
              <a href={tool.href} target="_blank" rel="noopener noreferrer" className="pc-row lp-press rounded-md text-ink">
                <span className="pc-row__text">{tool.name}</span>
              </a>
            )}
          </li>
        ))}
      </ul>
      <Link to="/tools" className="pc-row pc-row--more lp-press mt-3 rounded-md text-ink">
        All tools
      </Link>
    </section>
  )
}

/** Blog: the newest posts. */
function BlogTile() {
  const posts = useMemo(() => listPosts().slice(0, 5), [])
  return (
    <section aria-labelledby="home-blog-heading" className="pc-bento__tile pc-bento__list pc-bento__blog lp-raised rounded-md p-6">
      <h2 id="home-blog-heading" className="pc-tile-title text-ink">
        Blog
      </h2>
      {posts.length > 0 && (
        <ul className="pc-rows mt-3">
          {posts.map(post => (
            <li key={post.slug}>
              <Link to={`/blog/${post.slug}`} className="pc-row lp-press rounded-md text-ink">
                <span className="pc-row__text">{post.title}</span>
                <time dateTime={post.date} className="pc-row__date">
                  {formatDate(post.date)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/blog" className="pc-row pc-row--more lp-press mt-3 rounded-md text-ink">
        All posts
      </Link>
    </section>
  )
}

/** Two links, so a panel (not a card): GitHub and the About page. */
function Contribute() {
  return (
    <section aria-labelledby="contribute-heading" className="pc-bento__tile pc-bento__contribute lp-raised rounded-md p-6">
      <h2 id="contribute-heading" className="pc-tile-title text-ink">
        Contribute
      </h2>
      <p className="mt-2 font-sans text-[14px] leading-relaxed text-pretty text-ink">
        Review records, propose corrections, or read the code.
      </p>
      <p className="mt-3 flex flex-wrap gap-2 font-sans text-[13.5px]">
        <a
          href="https://github.com/JoshuaSemock/pharmacycommons.org"
          target="_blank"
          rel="noopener noreferrer"
          className="lp-press inline-flex items-center rounded-md px-2 py-0.5 text-ink"
        >
          GitHub
        </a>
        <Link to="/about" className="lp-press inline-flex items-center rounded-md px-2 py-0.5 text-ink">
          About the project
        </Link>
      </p>
    </section>
  )
}

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
