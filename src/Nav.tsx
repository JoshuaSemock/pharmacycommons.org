import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { entryKindLine, loadCatalog, pcidOf, searchCatalog, toDrug } from './catalog'
import SiteMenu, { AccountButton, BAR_LINKS } from './SiteMenu'

/**
 * The site header: one bar, always in this order — logo, "Pharmacy Commons",
 * search, Browse · Lists · Classifications · Tools, then the account button and the menu.
 *
 * md and up it is a single 56px flex row. Below md the same bar is a two-row
 * grid: name, links and menu on the first (the name truncates before anything
 * wraps), the search box full width on the second, and the account button
 * moves into the menu. Below 600px the wordmark is hidden and the logo tile
 * alone is the home link: four bar links (Classifications is long) leave no
 * room for it on a phone, and below 600px "Classifications" reads "Classes"
 * (BAR_LINKS.short) so the bold embossed buttons fit. The wordmark is hidden
 * again from md to lg, where the bar is one row and the search box would otherwise be squeezed to nothing. The
 * search box is shown on every page, including / and /browse, which also have
 * their own.
 *
 * The static copy of this bar in index.html (inside #root) paints before the
 * bundle loads; keep the two in step.
 */
export default function Nav() {
  const navRef = useRef<HTMLElement>(null)

  // Publish the header height so sticky elements below it (the browse index)
  // sit flush under it, and the menu knows how much viewport it has.
  useLayoutEffect(() => {
    const el = navRef.current
    if (!el) return
    const root = document.documentElement
    const publish = () => root.style.setProperty('--nav-h', `${el.getBoundingClientRect().height}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <nav ref={navRef} className="pc-grain lp-rule-b sticky top-0 z-50 bg-paper">
      <div className="mx-auto grid max-w-page grid-cols-[minmax(2rem,1fr)_auto_auto] items-center gap-x-1 px-3 pb-2 max-[359px]:px-2 sm:gap-x-3 sm:px-6 md:flex md:h-14 md:pb-0">
        {/* The home button: logo tile and wordmark stamped as one button,
            pressed in under the pointer and on the home page itself. */}
        <NavLink
          to="/"
          end
          className="lp-toggle flex h-9 min-w-0 items-center gap-2 justify-self-start rounded-md px-1 max-[359px]:gap-1.5 md:shrink-0 min-[600px]:pr-2.5 md:max-lg:pr-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
          aria-label="Pharmacy Commons home"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center max-[359px]:h-6 max-[359px]:w-6">
            <img src="/logo-40.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" />
          </span>
          <span className="font-sans text-[13px] min-w-0 truncate max-[599px]:hidden md:max-lg:hidden min-[360px]:text-[14px] font-bold tracking-[-0.01em] text-ink sm:text-[15px]">
            Pharmacy Commons
          </span>
        </NavLink>

        <HeaderSearch />

        <ul className="flex shrink-0 items-center gap-1 max-[399px]:gap-0.5 md:ml-auto">
          {BAR_LINKS.map(link => (
            <li key={link.to}>
              <NavLink to={link.to} className={barLinkClass}>
                {link.short ? (
                  <>
                    <span className="min-[600px]:hidden">{link.short}</span>
                    <span className="max-[599px]:hidden">{link.label}</span>
                  </>
                ) : (
                  link.label
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="hidden shrink-0 md:block">
          <AccountButton />
        </div>

        <div className="shrink-0">
          <SiteMenu />
        </div>
      </div>
    </nav>
  )
}

/** Bar links are embossed buttons; the current page's link stays pressed in
    and the others press in under the pointer. NavLink sets
    aria-current="page", which .lp-toggle keys off. */
const barLinkClass = [
  'lp-toggle flex h-8 items-center rounded-md px-1 font-sans text-[12px] text-ink min-[360px]:px-1.5 min-[360px]:text-[13px] min-[400px]:px-2 min-[400px]:text-[13.5px] sm:px-2.5 sm:text-[14px]',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40',
].join(' ')

// ─────────────────────────────────────────────────────────────────────────────
// Header search
// ─────────────────────────────────────────────────────────────────────────────

function HeaderSearch() {
  const navigate = useNavigate()
  const [focused, setFocused] = useState(false)
  const [query, setQuery] = useState('')
  const [catalogReady, setCatalogReady] = useState(false)

  // The catalog is fetched once and cached; start as soon as the field is used.
  useEffect(() => {
    if (!focused || catalogReady) return
    loadCatalog()
      .then(() => setCatalogReady(true))
      .catch(err => console.error('[catalog] load failed:', err))
  }, [focused, catalogReady])

  const suggestions = catalogReady && query.trim().length > 1 ? searchCatalog(query, 6) : []

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    navigate(`/browse?q=${encodeURIComponent(q)}`)
    setQuery('')
    setFocused(false)
  }

  function handleSuggestion(slug: string) {
    navigate(`/drugs/${slug}`)
    setQuery('')
    setFocused(false)
  }

  return (
    // Below md the bar is a 3-column grid and this spans row 2 on its own; from
    // md the bar is a flex row and this sits between the name and the links.
    <div className="relative col-span-3 row-start-2 min-w-0 md:mx-2 md:max-w-xl md:flex-1">
      <form onSubmit={handleSubmit} role="search">
        <div
          className="lp-field flex h-10 items-center gap-2 rounded-md px-3 md:h-9"
        >
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Search drugs, brands, classes"
            aria-label="Search the commons"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent font-sans text-[13.5px] text-ink placeholder:text-ink outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="-mr-2 flex h-8 w-8 shrink-0 items-center justify-center text-ink"
              aria-label="Clear search"
            >
              <XIcon />
            </button>
          )}
        </div>
      </form>

      {focused && suggestions.length > 0 && (
        <div className="lp-popover pc-grain absolute top-full z-10 mt-1.5 grid w-full gap-1.5 overflow-hidden rounded-lg bg-paper p-1.5">
          {suggestions.map(entry => {
            const schedule = toDrug(entry).schedule
            return (
              <button
                key={entry.n}
                onMouseDown={() => handleSuggestion(entry.slug)}
                data-autocomplete
                className="lp-option flex min-h-[48px] w-full items-center gap-3 rounded-md px-3 py-2 text-left focus-visible:shadow-deboss focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1">
                  <span className="lp-link-text block truncate font-sans text-[13.5px] text-ink">{entry.name}</span>
                  <span className="block truncate font-sans text-[12px] text-ink">
                    {entryKindLine(entry)}
                  </span>
                </span>
                {schedule && (
                  <span className="lp-label rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink">
                    {schedule}
                  </span>
                )}
                <span className="shrink-0 font-mono text-[10.5px] text-ink">{pcidOf(entry)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-ink">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
