import { useEffect } from 'react'
import type { ReactNode } from 'react'

type PageShellProps = {
  kicker?: string
  title: string
  lede?: string
  children: ReactNode
}

/**
 * Shared layout for the top-level section pages (About, Tools, Resources,
 * Citations). Matches SearchView's container: mx-auto max-w-7xl px-4 sm:px-6.
 */
export default function PageShell({ kicker, title, lede, children }: PageShellProps) {
  useEffect(() => {
    document.title = `${title} · Pharmacy Commons`
    window.scrollTo(0, 0)
  }, [title])

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 pb-24">
      <header className="max-w-3xl pt-14 pb-10">
        {kicker && (
          <p className="mb-3 font-mono text-[11px] text-aqua-600">{kicker}</p>
        )}
        <h1
          className="font-display text-3xl sm:text-4xl font-semibold text-sage-900 leading-[1.15]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {title}
        </h1>
        {lede && (
          <p className="mt-4 font-sans text-[15px] text-sage-600 leading-relaxed">{lede}</p>
        )}
      </header>

      <div className="max-w-3xl">{children}</div>
    </main>
  )
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="border-t border-sage-200 py-8">
      <h2
        className="mb-3 font-display text-[21px] font-semibold text-sage-900"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {heading}
      </h2>
      <div className="font-sans text-[14.5px] text-sage-700 leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  )
}

export function Pending({ children }: { children: ReactNode }) {
  return (
    <span className="ml-2 rounded border border-sage-200 bg-sage-100 px-1.5 py-0.5 font-mono text-[10px] text-sage-600 align-middle">
      {children}
    </span>
  )
}
