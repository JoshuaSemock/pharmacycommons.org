import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { entryKindLine, loadCatalog, pcidOf, searchCatalog, toDrug } from './catalog'
import SiteMenu, { AccountButton, BAR_LINKS } from './SiteMenu'
import { drugScore, groupHits, loadSiteEntries, searchSite, staticEntries } from './siteSearch'
import type { SiteEntry } from './siteSearch'

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
          <span className="font-sans text-[13px] min-w-0 truncate max-[599px]:hidden md:max-lg:hidden min-[360px]:text-[14px] tracking-[-0.01em] text-ink sm:text-[15px]">
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

/** One selectable row in the dropdown. */
type Option = { key: string; to: string }

function HeaderSearch() {
  const navigate = useNavigate()
  const [focused, setFocused] = useState(false)
  const [query, setQuery] = useState('')
  const [catalogReady, setCatalogReady] = useState(false)
  const [entries, setEntries] = useState<SiteEntry[]>(staticEntries)
  const [active, setActive] = useState(-1)

  // The catalog and the site index (lists, classes, posts) are fetched once and
  // cached; start as soon as the field is used. Tools and pages need no fetch.
  useEffect(() => {
    if (!focused) return
    if (!catalogReady)
      loadCatalog()
        .then(() => setCatalogReady(true))
        .catch(err => console.error('[catalog] load failed:', err))
    loadSiteEntries().then(setEntries, err => console.error('[site search] load failed:', err))
  }, [focused, catalogReady])

  const q = query.trim()
  const drugs = catalogReady && q.length > 1 ? searchCatalog(q, 6) : []
  const siteHits = useMemo(() => searchSite(entries, q), [entries, q])
  const drugBest = drugs.length ? drugScore(drugs[0].name, drugs[0].matchedBrand, q) : 0
  const { site, drugsFirst } = groupHits(siteHits, drugBest)

  // Groups in the order shown, and the flat list the arrow keys walk.
  const groups: { key: string; label: string; rows: { option: Option; node: ReactNode }[] }[] = []
  const drugGroup = {
    key: 'drug',
    label: 'Drugs and topics',
    rows: drugs.map(entry => {
      const schedule = toDrug(entry).schedule
      return {
        option: { key: `drug-${entry.n}`, to: `/drugs/${entry.slug}` },
        node: (
          <>
            <span className="min-w-0 flex-1">
              <span className="lp-link-text block truncate font-sans text-[13.5px] text-ink">{entry.name}</span>
              <span className="block truncate font-sans text-[12px] text-ink">{entryKindLine(entry)}</span>
            </span>
            {schedule && (
              <span className="lp-label rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink">{schedule}</span>
            )}
            <span className="shrink-0 font-mono text-[10.5px] text-ink">{pcidOf(entry)}</span>
          </>
        ),
      }
    }),
  }
  const siteGroups = site.map(g => ({
    key: g.key,
    label: g.label,
    rows: g.items.map(h => ({
      option: { key: h.id, to: h.to },
      node: (
        <span className="min-w-0 flex-1">
          <span className="lp-link-text block truncate font-sans text-[13.5px] text-ink">{h.title}</span>
          <span className="block truncate font-sans text-[12px] text-ink">{h.hint}</span>
        </span>
      ),
    })),
  }))
  groups.push(...(drugsFirst ? [drugGroup, ...siteGroups] : [...siteGroups, drugGroup]).filter(g => g.rows.length > 0))

  const seeAll: Option = { key: 'all', to: `/browse?q=${encodeURIComponent(q)}` }
  const options: Option[] = [...groups.flatMap(g => g.rows.map(r => r.option)), ...(groups.length ? [seeAll] : [])]
  const open = focused && q.length > 1 && groups.length > 0

  useEffect(() => setActive(-1), [q])

  function go(to: string) {
    navigate(to)
    setQuery('')
    setFocused(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!q) return
    if (q.length < 2) return go(seeAll.to)
    // Highlighted row wins; otherwise the first row shown (the best match) opens directly.
    if (open && active >= 0 && options[active]) return go(options[active].to)
    if (open && options[0] && options[0] !== seeAll) return go(options[0].to)
    // Dropdown not showing yet (catalog still loading): resolve the best match now.
    try {
      await loadCatalog()
      setCatalogReady(true)
    } catch (err) {
      console.error('[catalog] load failed:', err)
    }
    const d = searchCatalog(q, 1)[0]
    const s = searchSite(entries, q)[0]
    const dScore = d ? drugScore(d.name, d.matchedBrand, q) : 0
    if (d && dScore >= (s?.score ?? 0)) return go(`/drugs/${d.slug}`)
    if (s) return go(s.to)
    go(seeAll.to)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') return setFocused(false)
    if (!open || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
    e.preventDefault()
    const n = options.length
    setActive(a => (e.key === 'ArrowDown' ? (a + 1) % n : (a - 1 + n) % n))
  }

  const listId = 'header-search-results'

  return (
    // Below md the bar is a 3-column grid and this spans row 2 on its own; from
    // md the bar is a flex row and this sits between the name and the links.
    <div className="relative col-span-3 row-start-2 min-w-0 md:mx-2 md:max-w-xl md:flex-1">
      <form onSubmit={handleSubmit} role="search">
        <div className="lp-field lp-foil flex h-10 items-center gap-2 rounded-md px-3 md:h-9">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={handleKeyDown}
            placeholder="Search drugs, tools, lists, classes"
            aria-label="Search the commons"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
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

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="lp-popover pc-grain absolute top-full z-10 mt-1.5 grid max-h-[70vh] w-full gap-1.5 md:min-w-[24rem] overflow-y-auto rounded-lg bg-paper p-1.5"
        >
          {groups.map(group => (
            <div key={group.key} role="group" aria-label={group.label} className="grid gap-1.5">
              <p className="px-3 pt-1 font-sans text-[12px] text-ink">{group.label}</p>
              {group.rows.map(({ option, node }) => {
                const i = options.indexOf(option)
                return (
                  <OptionRow key={option.key} id={`${listId}-${i}`} selected={i === active} onPick={() => go(option.to)}>
                    {node}
                  </OptionRow>
                )
              })}
            </div>
          ))}
          <OptionRow id={`${listId}-${options.length - 1}`} selected={active === options.length - 1} onPick={() => go(seeAll.to)}>
            <span className="min-w-0 flex-1 truncate font-sans text-[13.5px] text-ink">See all results for “{q}”</span>
          </OptionRow>
        </div>
      )}
    </div>
  )
}

function OptionRow({ id, selected, onPick, children }: { id: string; selected: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onMouseDown={e => {
        e.preventDefault()
        onPick()
      }}
      data-autocomplete
      className={`lp-option flex min-h-[48px] w-full items-center gap-3 rounded-md px-3 py-2 text-left focus-visible:shadow-deboss focus-visible:outline-none ${selected ? 'shadow-deboss' : ''}`}
    >
      {children}
    </button>
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
