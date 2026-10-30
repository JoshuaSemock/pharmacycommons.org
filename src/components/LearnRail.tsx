/**
 * Learn — the sticky left reference rail shared by /learn and the study session: today's queue, study settings
 * in a recessed tray, and the official collections as embossed rows. Mirrors the drug page's rail.
 *
 * Destination: src/components/LearnRail.tsx
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCollections } from '../learn/api'
import type { LearnCollection } from '../learn/types'
import type { Progress } from '../learn/useProgress'
import LearnSettings from './LearnSettings'

type Props = {
  progress: Progress
  /** Slug or id of the collection being studied; 'due' for the review queue. */
  activeId?: string
  /** Collections the page already has; the rail fetches its own when omitted. */
  collections?: LearnCollection[] | null
}

export default function LearnRail({ progress, activeId, collections }: Props) {
  const [own, setOwn] = useState<LearnCollection[] | null>(null)
  useEffect(() => {
    if (collections !== undefined) return
    let cancelled = false
    listCollections()
      .then(rows => !cancelled && setOwn(rows))
      .catch(err => console.error(err))
    return () => {
      cancelled = true
    }
  }, [collections])
  const rows = collections ?? own

  const { due, started } = useMemo(() => {
    const now = Date.now()
    let n = 0
    for (const s of progress.states.values()) if (new Date(s.due_at).getTime() <= now) n++
    return { due: n, started: progress.states.size }
  }, [progress.states])
  const newLeft = Math.max(0, progress.limits.newItems - progress.newToday)

  return (
    <aside
      aria-label="Study reference"
      className="learn-rail min-w-0 space-y-8 lg:sticky lg:top-[calc(var(--nav-h,3.5rem)_+_1.5rem)] lg:max-h-[calc(100vh_-_var(--nav-h,3.5rem)_-_3rem)] lg:overflow-y-auto lg:overscroll-contain lg:pb-2 lg:pr-2"
    >
      <section aria-labelledby="learn-queue-h">
        <h2 id="learn-queue-h" className="font-sans text-[1.25rem] font-medium text-ink" style={{ fontSize: 'var(--text-xl)' }}>
          Today
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <div className="lp-raised rounded-md px-4 py-3">
            <dd className="font-mono text-[1.618rem] leading-none text-ink">{progress.ready ? due : '–'}</dd>
            <dt className="mt-1.5 font-sans text-[13px] text-ink">due</dt>
          </div>
          <div className="lp-raised rounded-md px-4 py-3">
            <dd className="font-mono text-[1.618rem] leading-none text-ink">{progress.ready ? newLeft : '–'}</dd>
            <dt className="mt-1.5 font-sans text-[13px] text-ink">new left</dt>
          </div>
        </dl>
        <p className="mt-2.5 font-sans text-[12.5px] text-ink">
          {started} started in total.{' '}
          {due > 0 && activeId !== 'due' && (
            <Link to="/learn/study/due" className="underline">
              Review what is due
            </Link>
          )}
        </p>
      </section>

      <LearnSettings progress={progress} compact />

      <nav aria-labelledby="learn-collections-h">
        <h2 id="learn-collections-h" className="font-sans text-[1.25rem] font-medium text-ink" style={{ fontSize: 'var(--text-xl)' }}>
          Collections
        </h2>
        {!rows ? (
          <div className="mt-3 space-y-2" aria-busy="true">
            {[0, 1, 2].map(i => (
              <div key={i} className="lp-raised h-12 animate-pulse rounded-md" />
            ))}
          </div>
        ) : (
          <ul className="mt-3 space-y-2" role="list">
            {rows.map(c => {
              const to = c.slug ?? c.id
              const current = activeId === to || activeId === c.id
              return (
                <li key={c.id}>
                  <Link
                    to={`/learn/study/${to}`}
                    aria-current={current ? 'page' : undefined}
                    className="learn-row lp-raised flex min-h-11 items-baseline justify-between gap-3 rounded-md px-3.5 py-2.5 font-sans text-[14px] leading-snug text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
                  >
                    <span className="min-w-0">{c.title}</span>
                    <span className="shrink-0 font-mono text-[12.5px]">{c.item_count.toLocaleString()}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </nav>
    </aside>
  )
}
