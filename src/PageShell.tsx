import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import OnThisPage, { scrollToId, useHeadings } from './OnThisPage'

/**
 * Layout for the text pages (About, Tools, Resources, Citations, Blog, posts).
 *
 * Uses the same container as Nav and SearchView (max-w-7xl px-4 sm:px-6) so the
 * page edges line up with the wordmark on the left and Contribute on the right.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Title (full width, lede capped for line length)              │
 *   ├──────────────────────────────────────────────────────────────┤  ← rule spans the container
 *   │ Reading column (≤42rem)                  │ Rail (15rem,       │
 *   │                                          │ sticky: TOC + page │
 *   │                                          │ specific extras)   │
 *   └──────────────────────────────────────────┴───────────────────┘
 *
 * Below lg the rail's TOC is hidden and any `aside` content stacks above the
 * reading column.
 */

type PageFrameProps = {
  header: ReactNode
  /** Page-specific rail content, rendered under the TOC. */
  aside?: ReactNode
  /** Changes when the content changes (post slug, page title). */
  contentKey: string
  /** Set false for pages whose h2s are list items, not sections. */
  toc?: boolean
  /** Minimum headings before the TOC is worth showing. */
  tocMin?: number
  /**
   * Below lg, `aside` stacks above the content by default (right for filters).
   * Use 'hidden' when the page renders its own small-screen version elsewhere.
   */
  asideOnMobile?: 'before' | 'hidden'
  children: ReactNode
}

export function PageFrame({
  header,
  aside,
  contentKey,
  toc = true,
  tocMin = 3,
  asideOnMobile = 'before',
  children,
}: PageFrameProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const { hash } = useLocation()
  const headings = useHeadings(contentRef, toc ? contentKey : null)
  const showToc = headings.length >= tocMin

  // Declared after useHeadings so heading ids exist before a deep link resolves.
  useEffect(() => {
    if (hash && scrollToId(decodeURIComponent(hash.slice(1)))) return
    window.scrollTo(0, 0)
  }, [contentKey, hash])

  return (
    <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      <header className="pt-10 pb-10 sm:pt-14 lg:pb-12">{header}</header>

      <div className="border-t border-sage-200 lg:grid lg:grid-cols-[minmax(0,42rem)_15rem] lg:justify-between lg:gap-x-12">
        {(showToc || aside) && (
          <aside
            className={[
              aside && asideOnMobile === 'before' ? 'block pt-8' : 'hidden',
              'lg:col-start-2 lg:row-start-1 lg:block lg:self-start lg:sticky lg:top-28',
              'lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pt-10 lg:pb-8',
            ].join(' ')}
          >
            <div className="space-y-9">
              {showToc && (
                <div className="hidden lg:block">
                  <OnThisPage headings={headings} />
                </div>
              )}
              {aside}
            </div>
          </aside>
        )}

        <div
          ref={contentRef}
          className="min-w-0 lg:col-start-1 lg:row-start-1 [&>section:first-child]:border-t-0"
        >
          {children}
        </div>
      </div>
    </main>
  )
}

export function PageTitle({
  title,
  lede,
  children,
}: {
  title: string
  lede?: string
  children?: ReactNode
}) {
  return (
    <div className="max-w-4xl">
      <h1
        className="font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.015em] text-balance text-sage-900 sm:text-[2.618rem]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {title}
      </h1>
      {lede && (
        <p className="mt-5 max-w-[42rem] font-sans text-[17px] leading-relaxed text-pretty text-sage-600">
          {lede}
        </p>
      )}
      {children}
    </div>
  )
}

/** Rail block heading — sentence case, matches the TOC label. */
export function RailHeading({ children }: { children: ReactNode }) {
  return <p className="mb-3 font-sans text-[12.5px] font-medium text-sage-900">{children}</p>
}

type PageShellProps = {
  /**
   * Accepted for compatibility; no longer rendered. It duplicated the active
   * section in the nav bar directly above it.
   */
  kicker?: string
  title: string
  lede?: string
  aside?: ReactNode
  toc?: boolean
  children: ReactNode
}

export default function PageShell({ title, lede, aside, toc, children }: PageShellProps) {
  useEffect(() => {
    document.title = `${title} · Pharmacy Commons`
  }, [title])

  return (
    <PageFrame
      contentKey={title}
      aside={aside}
      toc={toc}
      header={<PageTitle title={title} lede={lede} />}
    >
      {children}
    </PageFrame>
  )
}

export function Section({
  heading,
  id,
  children,
}: {
  heading: string
  id?: string
  children: ReactNode
}) {
  return (
    <section className="border-t border-sage-200 py-9">
      <h2
        id={id}
        className="mb-4 font-display text-[22px] font-semibold leading-snug text-sage-900"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {heading}
      </h2>
      <div className="space-y-4 font-sans text-[15.5px] leading-[1.7] text-sage-700">
        {children}
      </div>
    </section>
  )
}

export function Pending({ children }: { children: ReactNode }) {
  return (
    <span className="ml-2 rounded border border-sage-200 bg-sage-100 px-1.5 py-0.5 align-middle font-mono text-[10px] text-sage-600">
      {children}
    </span>
  )
}
