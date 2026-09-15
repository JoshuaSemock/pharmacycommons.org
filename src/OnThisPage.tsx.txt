import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/**
 * "On this page" navigation for long-form pages (blog posts, About, Resources).
 *
 * Headings are read from the rendered DOM rather than parsed from source, so the
 * same component works for markdown (ids from rehype-slug) and for hand-written
 * TSX pages (ids assigned here if missing). Anything inside an element marked
 * `data-toc-skip` (e.g. the footnotes block) is ignored.
 */

export type TocHeading = { id: string; text: string; level: 2 | 3 }

/**
 * Height of the sticky site header plus breathing room. Measured rather than
 * hard-coded so the offset stays right if the nav grows a row. `nav.sticky`
 * targets the site Nav specifically — post pages also contain a plain <nav>.
 */
function headerOffset(): number {
  const nav = document.querySelector<HTMLElement>('nav.sticky')
  return (nav?.getBoundingClientRect().height ?? 0) + 24
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

/** Scrolls so the element clears the sticky nav. Returns false if not found. */
export function scrollToId(id: string, behavior: ScrollBehavior = 'auto'): boolean {
  const el = document.getElementById(id)
  if (!el) return false
  const top = el.getBoundingClientRect().top + window.scrollY - headerOffset()
  window.scrollTo({ top, behavior })
  return true
}

/**
 * Collects h2/h3 elements under `ref`. Re-runs when `key` changes (pass the
 * post slug or page title). Pass `key = null` to disable collection.
 */
export function useHeadings(
  ref: RefObject<HTMLElement | null>,
  key: string | null,
): TocHeading[] {
  const [headings, setHeadings] = useState<TocHeading[]>([])

  useEffect(() => {
    const root = ref.current
    if (!root || key === null) {
      setHeadings([])
      return
    }

    const found: TocHeading[] = []
    root.querySelectorAll<HTMLHeadingElement>('h2, h3').forEach(el => {
      if (el.closest('[data-toc-skip]')) return
      const text = el.textContent?.trim() ?? ''
      if (!text) return

      if (!el.id) {
        const base = slugify(text) || 'section'
        let id = base
        for (let n = 2; document.getElementById(id); n++) id = `${base}-${n}`
        el.id = id
      }

      found.push({ id: el.id, text, level: el.tagName === 'H3' ? 3 : 2 })
    })

    setHeadings(found)
  }, [ref, key])

  return headings
}

/**
 * Id of the last heading scrolled past the header line.
 *
 * `pin` lets a TOC click win: on short pages the target can't reach the header
 * line, and the bottom-of-page rule would otherwise highlight the last entry.
 * The pin clears on the next wheel, touch, or key input.
 */
function useActiveHeading(ids: string[]): [string | null, (id: string) => void] {
  const [active, setActive] = useState<string | null>(null)
  const pinned = useRef<string | null>(null)
  const idKey = ids.join('|')

  const pin = useCallback((id: string) => {
    pinned.current = id
    setActive(id)
  }, [])

  useEffect(() => {
    pinned.current = null
    if (ids.length === 0) {
      setActive(null)
      return
    }

    let frame = 0

    const update = () => {
      frame = 0
      if (pinned.current) {
        setActive(pinned.current)
        return
      }

      const line = headerOffset() + 8
      let current: string | null = ids[0]

      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= line) current = id
        else break
      }

      // Short final sections can never reach the header line.
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      if (atBottom) current = ids[ids.length - 1]

      setActive(current)
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    const unpin = () => {
      if (pinned.current) {
        pinned.current = null
        schedule()
      }
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('wheel', unpin, { passive: true })
    window.addEventListener('touchmove', unpin, { passive: true })
    window.addEventListener('keydown', unpin)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('wheel', unpin)
      window.removeEventListener('touchmove', unpin)
      window.removeEventListener('keydown', unpin)
      if (frame) cancelAnimationFrame(frame)
    }
    // idKey stands in for ids — the array identity changes every render.
  }, [idKey])

  return [active, pin]
}

export default function OnThisPage({ headings }: { headings: TocHeading[] }) {
  const [active, pin] = useActiveHeading(headings.map(h => h.id))

  if (headings.length === 0) return null

  function jump(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault()
    if (!scrollToId(id, prefersReducedMotion() ? 'auto' : 'smooth')) return
    pin(id)

    // Keep React Router's history state intact; only the fragment changes.
    window.history.replaceState(window.history.state, '', `#${id}`)

    // Move focus for keyboard and screen-reader users without a second scroll.
    const el = document.getElementById(id)
    if (el) {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
      el.focus({ preventScroll: true })
    }
  }

  return (
    <nav aria-label="On this page">
      <p className="mb-3 font-sans text-[12.5px] font-medium text-sage-900">On this page</p>
      <ol className="border-l border-sage-200">
        {headings.map(h => {
          const isActive = active === h.id
          return (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                onClick={e => jump(e, h.id)}
                aria-current={isActive ? 'location' : undefined}
                className={[
                  '-ml-px block border-l-2 py-1 pr-2 font-sans text-[13px] leading-snug transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500',
                  h.level === 3 ? 'pl-6' : 'pl-3',
                  isActive
                    ? 'border-aqua-500 text-sage-900'
                    : 'border-transparent text-sage-600 hover:border-sage-300 hover:text-sage-900',
                ].join(' ')}
              >
                {h.text}
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
