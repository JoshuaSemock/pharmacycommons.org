import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'

/**
 * The hamburger button and the slide-out drawer it opens.
 *
 * The button sits at the right end of the header's first row at every width.
 * Below md it is the only way to reach the sections, because the ribbon of
 * primary links is hidden there; on md+ it holds the secondary pages that no
 * longer fit in the ribbon.
 *
 * The drawer is portaled to <body>. The <nav> uses backdrop-filter, which makes
 * it the containing block for fixed-position descendants, so a drawer rendered
 * inside it would be clipped to the header's height.
 */

export const PRIMARY_LINKS = [
  { to: '/browse', label: 'Browse' },
  { to: '/classes', label: 'Classes' },
  { to: '/lists', label: 'Lists' },
  { to: '/tools', label: 'Tools' },
]

const REFERENCE_LINKS = [
  { to: '/about', label: 'About' },
  { to: '/references', label: 'References' },
  { to: '/resources', label: 'Resources' },
  { to: '/developers', label: 'Developers' },
  { to: '/blog', label: 'Blog' },
]

const LEGAL_LINKS = [
  { to: '/terms', label: 'Terms of use' },
  { to: '/disclaimer', label: 'Medical disclaimer' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/licensing', label: 'Data licensing' },
]

const MENU_ID = 'mobile-menu'

export default function SiteMenu() {
  const { pathname, search } = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)

  // Navigating anywhere (including a link inside the drawer) closes it.
  useEffect(() => setIsOpen(false), [pathname, search])

  // Escape closes; the page behind stops scrolling while the drawer is open.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('overflow-hidden')
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('overflow-hidden')
    }
  }, [isOpen])

  // Focus moves into the drawer on open and back to the button on close.
  useEffect(() => {
    if (isOpen) panelRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    else if (wasOpen.current && panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus()
    wasOpen.current = isOpen
  }, [isOpen])

  // Keep Tab inside the drawer while it is open (it is modal).
  function onPanelKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a, button') ?? [])
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const drawer = (
    <>
      <div
        aria-hidden="true"
        onClick={() => setIsOpen(false)}
        className={[
          'fixed inset-0 z-[60] bg-neutral-950/40 backdrop-blur-xs transition-opacity duration-300 motion-reduce:transition-none',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
      />
      <div
        ref={panelRef}
        id={MENU_ID}
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        onKeyDown={onPanelKeyDown}
        className={[
          'fixed inset-y-0 right-0 z-[70] flex w-[min(20rem,calc(100vw-3rem))] flex-col',
          'border-l border-sage-200 bg-sage-50 shadow-xl shadow-sage-900/10',
          'transition-[translate,visibility] duration-300 ease-out motion-reduce:transition-none',
          isOpen ? 'visible translate-x-0' : 'invisible translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-sage-200 pr-2 pl-5">
          <span className="font-sans text-[15px] font-medium tracking-[-0.01em] text-sage-900">Menu</span>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close navigation"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-sage-600 transition-colors hover:bg-sage-100 hover:text-sage-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
          <MenuGroup label="Explore" links={PRIMARY_LINKS} size="primary" />
          <MenuGroup label="Reference" links={REFERENCE_LINKS} size="secondary" />
          <MenuGroup label="Legal" links={LEGAL_LINKS} size="legal" />
        </div>
      </div>
    </>
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        aria-controls={MENU_ID}
        aria-label="Toggle navigation"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sage-700 transition-colors hover:bg-sage-100 hover:text-sage-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500"
      >
        <HamburgerIcon />
      </button>
      {typeof document !== 'undefined' && createPortal(drawer, document.body)}
    </>
  )
}

type MenuLink = { to: string; label: string }
type GroupSize = 'primary' | 'secondary' | 'legal'

const LINK_SIZE: Record<GroupSize, string> = {
  primary: 'min-h-12 text-[15px] font-medium',
  secondary: 'min-h-11 text-[14px]',
  legal: 'min-h-11 text-[13px] text-sage-600',
}

function MenuGroup({ label, links, size }: { label: string; links: MenuLink[]; size: GroupSize }) {
  return (
    <section aria-label={label} className="border-b border-sage-200/70 py-2 last:border-b-0">
      {/* Not an <h2>: the unlayered heading sizes in index.css override text-* here. */}
      <p aria-hidden="true" className="px-3 pt-2 pb-1 font-sans text-[12px] font-medium text-sage-500">
        {label}
      </p>
      <ul>
        {links.map(link => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              className={({ isActive }) =>
                [
                  'flex items-center rounded-r-lg border-l-2 px-3 font-sans transition-colors',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-aqua-500',
                  LINK_SIZE[size],
                  isActive
                    ? 'border-aqua-500 bg-white text-sage-900'
                    : `border-transparent hover:bg-sage-100 ${size === 'legal' ? 'hover:text-sage-900' : 'text-sage-800'}`,
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
