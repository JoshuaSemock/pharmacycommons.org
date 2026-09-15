import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Link, NavLink as RouterNavLink, useLocation, useNavigate } from 'react-router-dom'
import { loadCatalog, pcidOf, searchCatalog, toDrug } from './catalog'
import { useView, VIEWS, VIEW_GROUPS, viewDef } from './views'
import type { ViewKey } from './views'

const SECTIONS = [
  { to: '/browse', label: 'Browse' },
  { to: '/about', label: 'About' },
  { to: '/tools', label: 'Tools' },
  { to: '/resources', label: 'Resources' },
  { to: '/citations', label: 'Citations' },
  { to: '/blog', label: 'Blog' },
]

/** Pages with their own prominent search field don't need the header one. */
const PAGES_WITH_SEARCH = new Set(['/', '/browse'])

export default function Nav() {
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const showSearch = !PAGES_WITH_SEARCH.has(pathname)

  // Publish the header height so sticky elements below it (the browse index)
  // sit flush under it, even when the nav changes height on small screens.
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
    <nav ref={navRef} className="sticky top-0 z-50 border-b border-sage-200 bg-sage-50/90 backdrop-blur-md">
      {/* Row 1 — wordmark, search, account actions */}
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="Pharmacy Commons home">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-sage-100">
            <img src="/logo.png" alt="" className="h-5 w-5 object-contain" />
          </span>
          <span className="hidden font-sans text-[15px] font-medium tracking-[-0.01em] text-sage-900 sm:block">
            Pharmacy Commons
          </span>
        </Link>

        {showSearch ? <HeaderSearch /> : <div className="flex-1" />}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button className="hidden rounded-lg border border-aqua-400 bg-aqua-400/10 px-3 py-1.5 font-sans text-[12.5px] font-medium text-aqua-700 transition-colors hover:border-aqua-500 hover:bg-aqua-400/20 sm:block">
            Contribute
          </button>
          <Link
            to="/account"
            className="rounded-lg border border-sage-300 bg-white px-3 py-1.5 font-sans text-[12.5px] font-medium text-sage-800 transition-colors hover:border-sage-400 hover:text-sage-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500"
          >
            <span className="sm:hidden">Sign in</span>
            <span className="hidden sm:inline">Sign in / Register</span>
          </Link>
        </div>
      </div>

      {/* Row 2 — view switcher on the left, sections on the right */}
      <div className="border-t border-sage-200/70">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 sm:px-6">
          <ViewSwitcher />

          <ul className="-mr-3 ml-auto flex min-w-0 items-stretch gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SECTIONS.map(section => (
              <li key={section.to} className="shrink-0">
                <RouterNavLink
                  to={section.to}
                  className={({ isActive }) =>
                    [
                      'relative block px-3 py-2 font-sans text-[13px] transition-colors',
                      'after:absolute after:inset-x-3 after:bottom-0 after:h-px after:transition-colors',
                      isActive
                        ? 'text-sage-900 after:bg-aqua-500'
                        : 'text-sage-600 hover:text-sage-900 after:bg-transparent',
                    ].join(' ')
                  }
                >
                  {section.label}
                </RouterNavLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// View switcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A radio group on md+ (arrow keys move and select, as native radios do), a
 * grouped <select> below md. The options sit in an inset track; the selected
 * one is raised out of it and reads "Patient View", the rest just "Patient".
 * Hairlines separate Explore / Access / Contribute.
 */
const TRACK =
  'rounded-lg bg-sage-100 ring-1 ring-inset ring-sage-200 shadow-[inset_0_1px_2px_rgb(0_0_0/0.07)]'
const RAISED =
  'shadow-[0_1px_3px_rgb(0_0_0/0.14),0_1px_1px_rgb(0_0_0/0.06)] ring-1 ring-sage-200'

function ViewSwitcher() {
  const { view, setView } = useView()
  const buttons = useRef<Partial<Record<ViewKey, HTMLButtonElement | null>>>({})

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown'
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp'
    if (!forward && !back) return
    e.preventDefault()
    const next = VIEWS[(index + (forward ? 1 : -1) + VIEWS.length) % VIEWS.length]
    setView(next.key)
    buttons.current[next.key]?.focus()
  }

  return (
    <>
      <div
        role="radiogroup"
        aria-label="View"
        className={`my-1.5 hidden shrink-0 items-center gap-0.5 p-0.5 md:flex ${TRACK}`}
      >
        {VIEWS.map((v, i) => {
          const active = v.key === view
          const startsGroup = i > 0 && VIEWS[i - 1].group !== v.group
          const contribute = v.group === 'contribute'
          return (
            <span key={v.key} className="flex items-center">
              {startsGroup && <span className="mx-1 h-4 w-px bg-sage-300/70" aria-hidden="true" />}
              <button
                ref={el => {
                  buttons.current[v.key] = el
                }}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                title={v.tagline}
                onClick={() => setView(v.key)}
                onKeyDown={e => onKeyDown(e, i)}
                className={[
                  'rounded-md px-2.5 py-1 font-sans text-[12.5px] whitespace-nowrap transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-aqua-500',
                  active
                    ? `${RAISED} font-medium ${contribute ? 'bg-aqua-100 text-aqua-700' : 'bg-white text-sage-900'}`
                    : 'text-sage-600 hover:text-sage-900',
                ].join(' ')}
              >
                {active ? `${v.label} View` : v.label}
              </button>
            </span>
          )
        })}
      </div>

      <select
        value={view}
        onChange={e => setView(e.target.value as ViewKey)}
        aria-label="View"
        title={viewDef(view).tagline}
        className={`my-1.5 shrink-0 px-2 py-1 font-sans text-[12.5px] font-medium text-sage-900 outline-none focus:ring-2 focus:ring-aqua-200 md:hidden ${TRACK}`}
      >
        {VIEW_GROUPS.map(g => (
          <optgroup key={g.key} label={g.label}>
            {VIEWS.filter(v => v.group === g.key).map(v => (
              <option key={v.key} value={v.key}>
                {v.key === view ? `${v.label} View` : v.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Header search (hidden on pages that have their own)
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
    <div className="relative max-w-lg flex-1">
      <form onSubmit={handleSubmit} role="search">
        <div
          className={`flex items-center gap-2 rounded-lg border bg-white/70 px-3 py-1.5 transition-all ${
            focused ? 'border-aqua-400 bg-white ring-2 ring-aqua-200' : 'border-sage-200 hover:border-sage-300'
          }`}
        >
          <SearchIcon />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="...query the commons"
            aria-label="Search the catalog"
            className="flex-1 bg-transparent font-sans text-[13.5px] text-sage-900 placeholder-sage-400 outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-sage-400 hover:text-sage-600"
              aria-label="Clear search"
            >
              <XIcon />
            </button>
          )}
        </div>
      </form>

      {focused && suggestions.length > 0 && (
        <div className="absolute top-full mt-1.5 w-full overflow-hidden rounded-lg border border-sage-200 bg-white shadow-lg shadow-sage-900/5">
          {suggestions.map(entry => {
            const schedule = toDrug(entry).schedule
            return (
              <button
                key={entry.n}
                onMouseDown={() => handleSuggestion(entry.slug)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-sage-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-sans text-[13px] font-medium text-sage-900">{entry.name}</span>
                  <span className="block truncate font-sans text-[11.5px] text-sage-600">
                    {entry.brand ?? (entry.type === 1 ? 'Combination product' : 'Single ingredient')}
                  </span>
                </span>
                {schedule && (
                  <span className="rounded-md border border-coral-200 bg-coral-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-coral-600">
                    {schedule}
                  </span>
                )}
                <span className="font-mono text-[10.5px] text-sage-400">{pcidOf(entry)}</span>
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
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-sage-400">
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
