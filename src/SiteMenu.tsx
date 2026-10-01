import { useEffect, useRef, useState } from 'react'
import type { FocusEvent } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ACTIVE_TOOL_SECTIONS } from './tools'
import type { Tool } from './tools'
import { useSession } from './auth'
import { useThemeChoice } from './theme'
import type { ThemeChoice } from './theme'

/**
 * The hamburger button and the menu it opens.
 *
 * The menu drops down from the bottom edge of the header bar, full width,
 * instead of sliding in from the side. It is positioned `absolute` against the
 * sticky <nav> (its nearest positioned ancestor), so it always starts exactly
 * where the bar ends, including on phones where the bar is two lines tall.
 * Do not add `relative` to any element between this component and the <nav>.
 *
 * The nav uses backdrop-filter, which makes it the containing block for
 * `fixed` descendants too, so nothing in here uses `fixed`: the dimmed
 * backdrop is an absolute layer one viewport tall under the bar.
 */

/** Always visible in the bar, in this order. */
export const BAR_LINKS = [
  { to: '/browse', label: 'Browse' },
  { to: '/lists', label: 'Lists' },
  { to: '/tools', label: 'Tools' },
]

const EXPLORE_LINKS = [
  { to: '/browse', label: 'Browse A to Z' },
  { to: '/classes', label: 'Drug classes' },
  { to: '/lists', label: 'Lists' },
  { to: '/tools', label: 'All tools' },
]

const REFERENCE_LINKS = [
  { to: '/about', label: 'About' },
  { to: '/blog', label: 'Blog' },
  { to: '/references', label: 'References' },
  { to: '/resources', label: 'Resources' },
]

const LEGAL_LINKS = [
  { to: '/terms', label: 'Terms of use' },
  { to: '/disclaimer', label: 'Medical disclaimer' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/licensing', label: 'Data licensing' },
]

const MENU_ID = 'site-menu'

export default function SiteMenu() {
  const { pathname, search } = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Navigating anywhere (including a link inside the menu) closes it.
  useEffect(() => setIsOpen(false), [pathname, search])

  // Escape closes and returns focus to the button; the page behind stops
  // scrolling while the menu covers it.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setIsOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('overflow-hidden')
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('overflow-hidden')
    }
  }, [isOpen])

  // Tabbing out past the last item closes the menu (it is a disclosure, not
  // a modal, so focus is not trapped).
  function onPanelBlur(e: FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget
    if (next instanceof Node && (panelRef.current?.contains(next) || triggerRef.current?.contains(next))) return
    if (next) setIsOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        aria-controls={MENU_ID}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        className="lp-toggle flex h-10 w-10 shrink-0 flex-col items-center justify-center gap-[3.4px] rounded-md max-[359px]:w-9 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
      >
        <MenuBars open={isOpen} />
      </button>

      {/* Dimmed page under the bar; tapping it closes the menu. */}
      <div
        aria-hidden="true"
        onClick={() => setIsOpen(false)}
        className={[
          'absolute inset-x-0 top-full h-[100dvh] bg-black/30 transition-opacity duration-200 motion-reduce:transition-none',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
      />

      <div
        ref={panelRef}
        id={MENU_ID}
        aria-label="Site menu"
        onBlur={onPanelBlur}
        className={[
          'pc-grain absolute inset-x-0 top-full bg-paper shadow-lg shadow-black/15',
          'max-h-[calc(100dvh-var(--nav-h,3.5rem))] overflow-y-auto overscroll-contain',
          'transition-[opacity,translate,visibility] duration-200 ease-out motion-reduce:transition-none',
          isOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0',
        ].join(' ')}
      >
        <div className="mx-auto max-w-page px-4 pt-2 pb-6 sm:px-6 md:grid md:grid-cols-[1fr_1.6fr_1fr] md:gap-x-10 md:pt-5">
          <div>
            {/* The bar shows the account button from md up; below that it lives here. */}
            <div className="lp-rule-b py-3 md:hidden">
              <AccountButton block />
            </div>
            <MenuGroup label="Explore" links={EXPLORE_LINKS} />
          </div>

          <div className="lp-rule-t-until-md">
            <GroupLabel>Tools</GroupLabel>
            <div className="sm:grid sm:grid-cols-2 sm:gap-x-6">
              {ACTIVE_TOOL_SECTIONS.map(section => (
                <section key={section.id} aria-label={section.label} className="pb-2">
                  <p className="px-3 pt-2 pb-0.5 font-sans text-[12.5px] text-ink">{section.label}</p>
                  <ul>
                    {section.tools.map(tool => (
                      <li key={tool.id}>
                        <ToolLink tool={tool} current={pathname === tool.to} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>

          <div className="lp-rule-t-until-md">
            <MenuGroup label="About the Commons" links={REFERENCE_LINKS} />
            <MenuGroup label="Legal" links={LEGAL_LINKS} small />
            <AppearanceControl />
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * "Log in / Register" when signed out, "Signed In" once signed in; both go to
 * /account. The email address is deliberately not shown in the bar.
 * Letterpress: "Log in / Register" is raised (a button to press); "Signed In"
 * stays pressed in, a stamp that says the session is on.
 */
export function AccountButton({ block = false }: { block?: boolean }) {
  const { user, loading } = useSession()
  const base = [
    'items-center justify-center rounded-md px-3 font-sans text-[13px] font-medium whitespace-nowrap text-ink',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40',
    block ? 'flex h-11 w-full' : 'inline-flex h-9',
  ].join(' ')

  if (loading) {
    return <span className={`${base} lp-raised ${block ? '' : 'w-[8.5rem]'}`} aria-hidden="true" />
  }

  if (user) {
    return (
      <Link
        to="/account"
        title={user.email ?? undefined}
        className={`${base} lp-sunken gap-1.5`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-mint-600" aria-hidden="true" />
        Signed In
      </Link>
    )
  }

  return (
    <Link to="/account" className={`${base} lp-raised lp-press`}>
      Log in / Register
    </Link>
  )
}

type MenuLink = { to: string; label: string }

/* Not headings: the unlayered h1–h6 sizes in index.css would override text-*. */
function GroupLabel({ children }: { children: string }) {
  return (
    <p aria-hidden="true" className="px-3 pt-4 pb-1 font-display text-[17px] font-semibold text-ink md:pt-0">
      {children}
    </p>
  )
}

function MenuGroup({ label, links, small = false }: { label: string; links: MenuLink[]; small?: boolean }) {
  return (
    <section aria-label={label} className="pb-2">
      <GroupLabel>{label}</GroupLabel>
      <ul>
        {links.map(link => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              end
              className={({ isActive }) =>
                [
                  'lp-flat flex min-h-11 items-center rounded-md px-3 font-sans text-ink md:min-h-9',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink/40',
                  small ? 'text-[13px]' : 'text-[14.5px]',
                  isActive ? 'font-medium' : '',
                ].join(' ')
              }
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ToolLink({ tool, current }: { tool: Tool; current: boolean }) {
  const className = [
    'lp-flat flex min-h-11 items-center rounded-md px-3 font-sans text-[14.5px] text-ink md:min-h-9',
    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink/40',
    current ? 'font-medium' : '',
  ].join(' ')
  if (tool.to) {
    return (
      <Link to={tool.to} aria-current={current ? 'page' : undefined} className={className}>
        {tool.name}
      </Link>
    )
  }
  return (
    <a href={tool.href} target="_blank" rel="noreferrer" className={className}>
      {tool.name}
      <span className="ml-1 text-ink" aria-hidden="true">
        ↗
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** Light / dark / follow-the-system switch. Saved in this browser only. */
function AppearanceControl() {
  const [choice, setChoice] = useThemeChoice()
  return (
    <section aria-label="Appearance" className="pb-2">
      <GroupLabel>Appearance</GroupLabel>
      <div role="radiogroup" aria-label="Color theme" className="mx-3 mt-1 inline-flex gap-1">
        {THEME_OPTIONS.map(option => {
          const selected = choice === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChoice(option.value)}
              className={[
                'lp-toggle min-h-9 rounded-md px-3 font-sans text-[13px] text-ink',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink/40',
                selected ? 'font-medium' : '',
              ].join(' ')}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Three bars that fold into an X when the menu opens: the top bar drops to the
 * middle and turns 45°, the middle one fades, the bottom one rises and turns
 * -45°. Bars are 1.6px with 3.4px gaps, so each outer bar sits 5px from the
 * centre. The same transition runs both ways; reduced motion skips it.
 */
function MenuBars({ open }: { open: boolean }) {
  const bar = 'block h-[1.6px] w-[18px] rounded-full bg-current transition-[translate,rotate,opacity] duration-300 ease-in-out motion-reduce:transition-none'
  return (
    <>
      <span aria-hidden="true" className={`${bar} ${open ? 'translate-y-[5px] rotate-45' : ''}`} />
      <span aria-hidden="true" className={`${bar} ${open ? 'opacity-0' : 'opacity-100'}`} />
      <span aria-hidden="true" className={`${bar} ${open ? '-translate-y-[5px] -rotate-45' : ''}`} />
    </>
  )
}
