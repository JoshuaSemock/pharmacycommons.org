/**
 * /learn — the study hub: what is due today and every published collection.
 * Content comes from the learn_* tables (docs/learn.md); progress from useProgress (account or this device).
 *
 * Destination: src/pages/Learn.tsx
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import LearnSettings from '../components/LearnSettings'
import { listCollections } from '../learn/api'
import { useProgress } from '../learn/useProgress'
import type { LearnCollection } from '../learn/types'

export default function Learn() {
  const [collections, setCollections] = useState<LearnCollection[] | null>(null)
  const [failed, setFailed] = useState(false)
  const progress = useProgress()

  useEffect(() => {
    document.title = 'Learn · Pharmacy Commons'
    let cancelled = false
    listCollections()
      .then(rows => !cancelled && setCollections(rows))
      .catch(err => {
        console.error(err)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const { due, started } = useMemo(() => {
    const now = Date.now()
    let due = 0
    for (const s of progress.states.values()) if (new Date(s.due_at).getTime() <= now) due++
    return { due, started: progress.states.size }
  }, [progress.states])

  const bySubject = useMemo(() => {
    const m = new Map<string, LearnCollection[]>()
    for (const c of collections ?? []) m.set(c.subject_area, [...(m.get(c.subject_area) ?? []), c])
    return [...m.entries()]
  }, [collections])

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <header className="border-b border-ink/15 pb-10 pt-10 sm:pt-14">
        <h1
          className="font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.015em] text-ink sm:text-[2.618rem]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Learn
        </h1>
        <p className="mt-5 max-w-[42rem] font-sans text-[17px] leading-relaxed text-ink">
          Flashcards and single-best-answer questions built from the same records as the rest of the site, scheduled
          with spaced repetition so you see a drug again just before you would forget it. Free, with no account needed;
          sign in to keep your progress across devices.
        </p>
        <p className="mt-3 max-w-[42rem] font-sans text-[14px] leading-relaxed text-ink">
          Study aids, not clinical guidance. Every card shows its source; confirm against current labeling before acting.
        </p>
      </header>

      {progress.ready && started > 0 && (
        <section className="lp-raised mt-9 flex flex-wrap items-center justify-between gap-4 rounded-md p-6" aria-label="Today">
          <div>
            <p className="font-sans text-[15px] text-ink">
              <span className="font-mono text-[1.618rem] font-semibold">{due}</span>{' '}
              {due === 1 ? 'card is' : 'cards are'} due across everything you have started ({started} in total).
            </p>
            {!progress.signedIn && (
              <p className="mt-1 font-sans text-[13.5px] text-ink">
                Saved on this device only. <Link to="/account" className="underline">Sign in</Link> to keep it.
              </p>
            )}
            {progress.pending && (
              <p className="mt-1 font-sans text-[13.5px] text-ink">Some reviews are waiting to sync; they send next time you are online.</p>
            )}
          </div>
          {due > 0 && (
            <Link to="/learn/study/due" className="lp-raised lp-press rounded-md px-4 py-2 font-sans text-[13.5px] font-medium text-ink">
              Review what is due
            </Link>
          )}
        </section>
      )}
      {progress.failed && (
        <p className="mt-6 font-sans text-[14px] text-ink">Your progress couldn’t be loaded right now; you can still study.</p>
      )}

      {failed ? (
        <p className="py-10 font-sans text-[15px] text-ink">Collections couldn’t be loaded right now.</p>
      ) : !collections ? (
        <div className="space-y-4 py-9" aria-busy="true">
          {[0, 1, 2].map(i => (
            <div key={i} className="lp-raised h-24 animate-pulse rounded-md" />
          ))}
        </div>
      ) : collections.length === 0 ? (
        <p className="py-10 font-sans text-[15px] leading-relaxed text-ink">
          No collections are published yet. The first sets (Do Not Crush, anticholinergic burden, drug classes, brand and
          generic names) are being reviewed before they open.
        </p>
      ) : (
        bySubject.map(([subject, rows]) => (
          <section key={subject} className="pt-10">
            <h2 className="font-display text-[1.25rem] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
              {subject}
            </h2>
            <ul className="mt-4 divide-y divide-ink/15 border-y border-ink/15">
              {rows.map(c => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0 max-w-[40rem]">
                    <h3 className="font-sans text-[16px] font-medium text-ink">{c.title}</h3>
                    {c.description && <p className="mt-1 font-sans text-[14px] leading-relaxed text-ink">{c.description}</p>}
                    <p className="mt-1 font-mono text-[12.5px] text-ink">{c.item_count.toLocaleString()} cards</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Link
                      to={`/learn/study/${c.slug ?? c.id}`}
                      className="lp-raised lp-press rounded-md px-4 py-2 font-sans text-[13.5px] font-medium text-ink"
                    >
                      Study
                    </Link>
                    <Link
                      to={`/learn/study/${c.slug ?? c.id}?mode=cram`}
                      title="Go through every card now, without changing your schedule"
                      className="lp-raised lp-press rounded-md px-4 py-2 font-sans text-[13.5px] text-ink"
                    >
                      Cram
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <LearnSettings progress={progress} />
    </main>
  )
}
