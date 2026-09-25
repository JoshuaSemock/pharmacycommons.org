import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { FocusEvent, FormEvent, KeyboardEvent, PointerEvent } from 'react'
import { Link, NavLink as RouterNavLink, useLocation, useNavigate } from 'react-router-dom'
import { loadCatalog, pcidOf, searchCatalog, toDrug } from './catalog'
import { ROUTED_TOOLS } from './tools'
import { useView, VIEWS, VIEW_GROUPS, viewDef } from './views'
import type { ViewKey } from './views'
import { useSession } from './auth'

const SECTIONS = [
  { to: '/browse', label: 'Browse' },
  { to: '/classes', label: 'Classes' },
  { to: '/lists', label: 'Lists' },
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
      <div className="mx-auto flex h-14 max-w-page items-center gap-4 px-4 sm:px-6">
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
          <AccountLink />
        </div>
      </div>

      {/* Row 2 — view switcher on the left, sections on the right */}
      <div className="border-t border-sage-200/70">
        <div className="mx-auto flex max-w-page items-center gap-4 px-4 sm:px-6">
          <ViewSwitcher />

          <ul className="-mr-3 ml-auto flex min-w-0 items-stretch gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SECTIONS.map(section =>
              section.to === '/tools' && ROUTED_TOOLS.length > 0 ? (
                <ToolsSection key={section.to} to={section.to} label={section.label} />
              ) : (
                <li key={section.to} className="shrink-0">
                  <SectionLink to={section.to} label={section.label} />
                </li>
              ),
            )}
          </ul>
        </div>
      </div>
    </nav>
  )
}

/**
 * "Sign in / Register" when signed out; the account's email (truncated) once
 * signed in. Session state comes from useSession() (src/auth.ts), the same
 * hook Account.tsx uses, so this updates the moment auth state changes
 * anywhere — no polling, no prop drilling from App.
 */
function AccountLink() {
  const { user, loading } = useSession()

  if (loading) {
    return <span className="h-[30px] w-24 rounded-lg bg-sage-100" aria-hidden="true" />
  }

  if (user) {
    return (
      <Link
        to="/account"
        className="max-w-[9rem] truncate rounded-lg border border-sage-300 bg-white px-3 py-1.5 font-sans text-[12.5px] font-medium text-sage-800 transition-colors hover:border-sage-400 hover:text-sage-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500"
        title={user.email ?? undefined}
      >
        {user.email}
      </Link>
    )
  }

  return (
    <Link
      to="/account"
      className="rounded-lg border border-sage-300 bg-white px-3 py-1.5 font-sans text-[12.5px] font-medium text-sage-800 transition-colors hover:border-sage-400 hover:text-sage-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500"
    >
      <span className="sm:hidden">Sign in</span>
      <span className="hidden sm:inline">Sign in / Register</span>
    </Link>
  )
}

function sectionLinkClass({ isActive }: { isActive: boolean }): string {
  return [
    'relative block px-3 py-2 font-sans text-[13px] transition-colors',
    'after:absolute after:inset-x-3 after:bottom-0 after:h-px after:transition-colors',
    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-aqua-500',
    isActive ? 'text-sage-900 after:bg-aqua-500' : 'text-sage-600 hover:text-sage-900 after:bg-transparent',
  ].join(' ')
}

function SectionLink({ to, label }: { to: string; label: string }) {
  return (
    <RouterNavLink to={to} className={sectionLinkClass}>
      {label}
    </RouterNavLink>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tools menu
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "Tools" stays a plain link to /tools. Hovering it with a mouse opens a menu
 * of the tools that have their own page; the chevron beside it does the same
 * for keyboard and touch. This is disclosure navigation, not an ARIA menu, so
 * Tab moves through the items in DOM order.
 *
 * The section list scrolls horizontally on small screens, and overflow-x clips
 * absolutely positioned children of the list itself. The menu therefore avoids
 * every positioned ancestor up to the sticky <nav>, which becomes its
 * containing block and sits outside the clip. Its offset is measured against
 * the nav. Do not add `relative` to this <li> or to the list.
 */
const MENU_WIDTH = 288 // 18rem
const CLOSE_DELAY = 140

function ToolsSection({ to, label }: { to: string; label: string }) {
  const { pathname } = useLocation()
  const menuId = useId()
  const itemRef = useRef<HTMLLIElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const focusFirstOnOpen = useRef(false)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const place = useCallback(() => {
    const item = itemRef.current
    const nav = item?.closest('nav')
    if (!item || !nav) return
    const r = item.getBoundingClientRect()
    const n = nav.getBoundingClientRect()
    const maxLeft = n.width - MENU_WIDTH - 8
    setPos({
      top: r.bottom - n.top,
      left: Math.max(8, Math.min(r.left - n.left, maxLeft)),
    })
  }, [])

  const cancelClose = () => window.clearTimeout(closeTimer.current)

  const openMenu = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    place()
    setOpen(true)
  }, [place])

  const closeMenu = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    setOpen(false)
  }, [])

  // Navigating anywhere closes the menu.
  useEffect(() => closeMenu(), [pathname, closeMenu])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  // Keyboard opening moves focus into the menu once it has rendered.
  useEffect(() => {
    if (!open || !focusFirstOnOpen.current) return
    focusFirstOnOpen.current = false
    menuRef.current?.querySelector<HTMLAnchorElement>('a')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return

    const inside = (node: EventTarget | null) =>
      node instanceof Node && Boolean(itemRef.current?.contains(node))

    const onPointerDown = (e: globalThis.PointerEvent) => {
      if (!inside(e.target)) closeMenu()
    }
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const hadFocus = inside(document.activeElement)
      closeMenu()
      if (hadFocus) toggleRef.current?.focus()
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', place)
    // Capture catches the section list's own horizontal scroll.
    window.addEventListener('scroll', place, { capture: true, passive: true })
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, { capture: true })
    }
  }, [open, place, closeMenu])

  function onPointerEnter(e: PointerEvent) {
    if (e.pointerType === 'mouse') openMenu()
  }

  function onPointerLeave(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return
    // Don't pull the menu away from someone typing in it.
    if (menuRef.current?.contains(document.activeElement)) return
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY)
  }

  function onBlur(e: FocusEvent) {
    const next = e.relatedTarget
    if (next instanceof Node && itemRef.current?.contains(next)) return
    // Focus left for somewhere else on the page; a hovering mouse keeps it open.
    if (!itemRef.current?.matches(':hover')) closeMenu()
  }

  function onToggleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== 'ArrowDown') return
    e.preventDefault()
    if (open) menuRef.current?.querySelector<HTMLAnchorElement>('a')?.focus()
    else {
      focusFirstOnOpen.current = true
      openMenu()
    }
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const links = Array.from(menuRef.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])
    const i = links.indexOf(document.activeElement as HTMLAnchorElement)
    if (i < 0) return
    e.preventDefault()
    if (e.key === 'ArrowUp' && i === 0) {
      toggleRef.current?.focus()
      return
    }
    links[Math.max(0, Math.min(links.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
  }

  return (
    <li
      ref={itemRef}
      className="flex shrink-0 items-stretch"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerMove={cancelClose}
      onBlur={onBlur}
    >
      <SectionLink to={to} label={label} />
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${label} menu`}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onToggleKeyDown}
        className={[
          '-ml-2 flex w-6 items-center justify-center transition-colors',
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-aqua-500',
          open ? 'text-sage-900' : 'text-sage-400 hover:text-sage-700',
        ].join(' ')}
      >
        <ChevronIcon open={open} />
      </button>

      <div
        ref={menuRef}
        id={menuId}
        hidden={!open}
        onKeyDown={onMenuKeyDown}
        style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
        className="absolute z-10 pt-1.5"
      >
        <div className="overflow-hidden rounded-lg border border-sage-200 bg-white shadow-lg shadow-sage-900/5">
          <ul className="py-1.5">
            {ROUTED_TOOLS.map(tool => {
              const current = pathname === tool.to
              return (
                <li key={tool.id}>
                  <Link
                    to={tool.to}
                    aria-current={current ? 'page' : undefined}
                    onClick={closeMenu}
                    className={[
                      'block border-l-2 px-3.5 py-2 transition-colors',
                      'focus-visible:bg-sage-50 focus-visible:outline-none',
                      current ? 'border-aqua-500 bg-sage-50' : 'border-transparent hover:bg-sage-50',
                    ].join(' ')}
                  >
                    <span className="block font-sans text-[13px] font-medium text-sage-900">{tool.name}</span>
                    {tool.summary && (
                      <span className="mt-0.5 block font-sans text-[11.5px] leading-snug text-sage-600">
                        {tool.summary}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
          <Link
            to={to}
            onClick={closeMenu}
            className="block border-t border-sage-200 px-3.5 py-2 font-sans text-[12.5px] text-sage-600 transition-colors hover:bg-sage-50 hover:text-sage-900 focus-visible:bg-sage-50 focus-visible:text-sage-900 focus-visible:outline-none"
          >
            All tools, including planned ones
          </Link>
        </div>
      </div>
    </li>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className={`transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
    >
      <path d="M2 3.75L5 6.75L8 3.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
    <div className="relative min-w-0 max-w-lg flex-1">
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
            className="min-w-0 flex-1 bg-transparent font-sans text-[13.5px] text-sage-900 placeholder-sage-400 outline-none"
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
