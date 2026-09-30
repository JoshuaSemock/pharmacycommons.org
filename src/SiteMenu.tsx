import { useEffect, useRef, useState } from 'react'
import type { FocusEvent } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ACTIVE_TOOL_SECTIONS } from './tools'
import type { Tool } from './tools'
import { useSession } from './auth'

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
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg max-[359px]:w-9 text-mint-800 transition-colors hover:bg-mint-100 hover:text-mint-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hepatica-500"
      >
        {isOpen ? <CloseIcon /> : <HamburgerIcon />}
      </button>

      {/* Dimmed page under the bar; tapping it closes the menu. */}
      <div
        aria-hidden="true"
        onClick={() => setIsOpen(false)}
        className={[
          'absolute inset-x-0 top-full h-[100dvh] bg-neutral-950/30 transition-opacity duration-200 motion-reduce:transition-none',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
      />

      <div
        ref={panelRef}
        id={MENU_ID}
        aria-label="Site menu"
        onBlur={onPanelBlur}
        className={[
          'absolute inset-x-0 top-full border-b border-mint-200 bg-neutral-50 shadow-lg shadow-mint-900/10',
          'max-h-[calc(100dvh-var(--nav-h,3.5rem))] overflow-y-auto overscroll-contain',
          'transition-[opacity,translate,visibility] duration-200 ease-out motion-reduce:transition-none',
          isOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0',
        ].join(' ')}
      >
        <div className="mx-auto max-w-page px-4 pt-2 pb-6 sm:px-6 md:grid md:grid-cols-[1fr_1.6fr_1fr] md:gap-x-10 md:pt-5">
          <div>
            {/* The bar shows the account button from md up; below that it lives here. */}
            <div className="border-b border-mint-200/70 py-3 md:hidden">
              <AccountButton block />
            </div>
            <MenuGroup label="Explore" links={EXPLORE_LINKS} />
          </div>

          <div className="border-t border-mint-200/70 md:border-t-0">
            <GroupLabel>Tools</GroupLabel>
            <div className="sm:grid sm:grid-cols-2 sm:gap-x-6">
              {ACTIVE_TOOL_SECTIONS.map(section => (
                <section key={section.id} aria-label={section.label} className="pb-2">
                  <p className="px-3 pt-2 pb-0.5 font-sans text-[12.5px] text-mint-700">{section.label}</p>
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

          <div className="border-t border-mint-200/70 md:border-t-0">
            <MenuGroup label="About the Commons" links={REFERENCE_LINKS} />
            <MenuGroup label="Legal" links={LEGAL_LINKS} small />
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * "Log in / Register" when signed out, "Signed In" once signed in; both go to
 * /account. The email address is deliberately not shown in the bar.
 */
export function AccountButton({ block = false }: { block?: boolean }) {
  const { user, loading } = useSession()
  const base = [
    'items-center justify-center rounded-lg border px-3 font-sans text-[13px] font-medium whitespace-nowrap transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hepatica-500',
    block ? 'flex h-11 w-full' : 'inline-flex h-9',
  ].join(' ')

  if (loading) {
    return <span className={`${base} border-transparent bg-mint-100 ${block ? '' : 'w-[8.5rem]'}`} aria-hidden="true" />
  }

  if (user) {
    return (
      <Link
        to="/account"
        title={user.email ?? undefined}
        className={`${base} gap-1.5 border-mint-300 bg-mint-50 text-mint-800 hover:border-mint-500 hover:text-mint-950`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-mint-600" aria-hidden="true" />
        Signed In
      </Link>
    )
  }

  return (
    <Link to="/account" className={`${base} border-mint-300 bg-white text-mint-800 hover:border-mint-500 hover:text-mint-950`}>
      Log in / Register
    </Link>
  )
}

type MenuLink = { to: string; label: string }

/* Not headings: the unlayered h1–h6 sizes in index.css would override text-*. */
function GroupLabel({ children }: { children: string }) {
  return (
    <p aria-hidden="true" className="px-3 pt-4 pb-1 font-display text-[17px] font-semibold text-mint-900 md:pt-0">
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
                  'flex min-h-11 items-center rounded-r-lg border-l-2 px-3 font-sans transition-colors md:min-h-9',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-hepatica-500',
                  small ? 'text-[13px]' : 'text-[14.5px]',
                  isActive
                    ? 'border-hepatica-500 bg-white text-mint-950'
                    : `border-transparent hover:bg-mint-100 ${small ? 'text-mint-700 hover:text-mint-950' : 'text-mint-900'}`,
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
    'flex min-h-11 items-center rounded-r-lg border-l-2 px-3 font-sans text-[14.5px] transition-colors md:min-h-9',
    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-hepatica-500',
    current ? 'border-hepatica-500 bg-white text-mint-950' : 'border-transparent text-mint-900 hover:bg-mint-100',
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
      <span className="ml-1 text-mint-600" aria-hidden="true">
        ↗
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
