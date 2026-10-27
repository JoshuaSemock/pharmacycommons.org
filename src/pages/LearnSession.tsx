/**
 * /learn/study/:collectionId and /learn/study/due — one study session.
 *
 * Flashcards: reveal, then rate Again / Hard / Good / Easy. Multiple choice: mark "unsure" if you are guessing,
 * pick an answer, read the explanation; the rating follows (wrong → Again, right but unsure → Hard, right → Good,
 * never Easy). Reviews go through the FSRS scheduler (src/learn/scheduler.ts) and are saved to the account when
 * signed in, or to this device when not.
 *
 * Destination: src/pages/LearnSession.tsx
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/Button'
import { getCollection, getItemsByIds } from '../learn/api'
import { buildQueue, requeue, type QueueEntry } from '../learn/queue'
import { intervalPreview } from '../learn/interval'
import { gradeMcq, newState, schedule, SCHEDULER_VERSION } from '../learn/scheduler'
import { optionOrder } from '../learn/shuffle'
import type { EventMode, LearnItem, Rating, ReviewEvent } from '../learn/types'
import { useProgress } from '../learn/useProgress'

type Loaded = { title: string; collectionId: string | null; items: LearnItem[] }
type Tally = { answered: number; again: number; correct: number; mcq: number }

const RATINGS: { rating: Rating; label: string }[] = [
  { rating: 1, label: 'Again' },
  { rating: 2, label: 'Hard' },
  { rating: 3, label: 'Good' },
  { rating: 4, label: 'Easy' },
]

const COVER_KEY = 'pc_learn_cover'
function readCover(): boolean {
  try {
    return localStorage.getItem(COVER_KEY) === '1'
  } catch {
    return false
  }
}
function writeCover(on: boolean): void {
  try {
    localStorage.setItem(COVER_KEY, on ? '1' : '0')
  } catch {
    // storage unavailable: the choice lasts for this visit only
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const hex = () => Math.floor(Math.random() * 16).toString(16)
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, hex)
}

export default function LearnSession() {
  const { collectionId = '' } = useParams<{ collectionId: string }>()
  const isDue = collectionId === 'due'
  const progress = useProgress()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [missing, setMissing] = useState(false)
  const [queue, setQueue] = useState<QueueEntry[] | null>(null)
  const [tally, setTally] = useState<Tally>({ answered: 0, again: 0, correct: 0, mcq: 0 })
  const [revealed, setRevealed] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [unsure, setUnsure] = useState(false)
  const [cover, setCover] = useState(readCover)
  const [uncovered, setUncovered] = useState(false)
  const shownAt = useRef(Date.now())
  const seed = useRef(uuid())
  const pending = useRef<{ rating: Rating; selected: string; correct: boolean; unsure: boolean } | null>(null)

  // Content: one collection, or every item the learner has started (the due queue).
  useEffect(() => {
    document.title = 'Study · Pharmacy Commons'
    if (isDue && !progress.ready) return
    let cancelled = false
    ;(async () => {
      try {
        if (isDue) {
          const items = await getItemsByIds([...progress.states.keys()])
          if (!cancelled) setLoaded({ title: 'Due for review', collectionId: null, items })
        } else {
          const got = await getCollection(collectionId)
          if (cancelled) return
          if (!got) setMissing(true)
          else setLoaded({ title: got.collection.title, collectionId: got.collection.id, items: got.items })
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) setMissing(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // The due queue is built once from the states present when progress first becomes ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId, isDue, isDue ? progress.ready : false])

  // Build the queue once content and progress are both in.
  useEffect(() => {
    if (!loaded || !progress.ready || queue) return
    const built = buildQueue(loaded.items, progress.states, new Date(), progress.limits, { newToday: progress.newToday })
    // The due queue only holds cards already started; buildQueue would add new ones for items without state, so drop them.
    setQueue(isDue ? built.entries.filter(e => e.state) : built.entries)
    shownAt.current = Date.now()
  }, [loaded, progress.ready, queue, progress.states, progress.limits, progress.newToday, isDue])

  const current = queue && queue.length > 0 ? queue[0] : null
  const order = useMemo(() => (current ? optionOrder(current.item, seed.current) : []), [current])

  const advance = useCallback(
    async (item: LearnItem, rating: Rating, extra: { selected: string | null; correct: boolean | null; unsure: boolean }) => {
      if (!queue) return
      const now = new Date()
      const before = progress.states.get(item.id) ?? newState(now)
      const mcq = item.item_type === 'mcq'
      const after = schedule(before, rating, now, { mode: mcq ? 'mcq' : 'flashcard' })
      const mode: EventMode = isDue ? 'due_queue' : mcq ? 'mcq_practice' : 'flashcard'
      const event: ReviewEvent = {
        client_event_id: uuid(),
        item_id: item.id,
        collection_id: loaded?.collectionId ?? null,
        mode,
        rating,
        is_correct: extra.correct,
        selected_option_id: extra.selected,
        was_unsure: extra.unsure,
        duration_ms: Math.min(Date.now() - shownAt.current, 600000),
        reviewed_at: now.toISOString(),
        scheduler_version: SCHEDULER_VERSION,
        state_before: before,
        state_after: after,
      }
      setTally(t => ({
        answered: t.answered + 1,
        again: t.again + (rating === 1 ? 1 : 0),
        correct: t.correct + (extra.correct ? 1 : 0),
        mcq: t.mcq + (mcq ? 1 : 0),
      }))
      setQueue(requeue(queue.slice(1), item, after, now))
      setRevealed(false)
      setPicked(null)
      setUnsure(false)
      setUncovered(false)
      shownAt.current = Date.now()
      await progress.record(event)
    },
    [queue, progress, isDue, loaded],
  )

  // Keyboard: Space/Enter reveals a flashcard; 1-4 rate it.
  useEffect(() => {
    if (!current || current.item.item_type !== 'flashcard') return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setRevealed(true)
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        void advance(current.item, Number(e.key) as Rating, { selected: null, correct: null, unsure: false })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, revealed, advance])

  const back = (
    <Link to="/learn" className="font-sans text-[13.5px] text-ink underline">
      ← Learn
    </Link>
  )

  if (missing)
    return (
      <main className="mx-auto max-w-page px-4 pb-24 pt-10 sm:px-6">
        {back}
        <p className="mt-6 font-sans text-[15px] text-ink">That collection isn’t available.</p>
      </main>
    )

  if (!loaded || !queue)
    return <main className="mx-auto max-w-page px-4 pb-24 pt-10 sm:px-6" aria-busy="true">{back}</main>

  if (!current) {
    const empty = tally.answered === 0
    return (
      <main className="mx-auto max-w-[42rem] px-4 pb-24 pt-10 sm:px-6">
        {back}
        <h1 className="mt-6 font-display text-[1.618rem] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
          {empty ? 'Nothing due right now' : 'Session complete'}
        </h1>
        <p className="mt-4 font-sans text-[16px] leading-relaxed text-ink">
          {empty
            ? 'Every card in this set is scheduled for later, or today’s new-card limit is used up. Come back later.'
            : `${tally.answered} cards reviewed${tally.again ? `, ${tally.again} to see again soon` : ''}${
                tally.mcq ? `. Multiple choice: ${tally.correct} of ${tally.mcq} correct` : ''
              }.`}
        </p>
        {!progress.signedIn && !empty && (
          <p className="mt-3 font-sans text-[14px] text-ink">
            Saved on this device only. <Link to="/account" className="underline">Sign in</Link> to keep your progress across devices.
          </p>
        )}
        <div className="mt-8 flex gap-3">
          <Link to="/learn" className="lp-raised lp-press rounded-md px-4 py-2 font-sans text-[13.5px] font-medium text-ink">
            Back to Learn
          </Link>
        </div>
      </main>
    )
  }

  const { item } = current
  const isMcq = item.item_type === 'mcq'
  const correctOption = item.mcq_options?.find(o => o.is_correct)
  const answered = isMcq && picked !== null
  const preview = !isMcq && revealed ? intervalPreview(progress.states.get(item.id) ?? null, new Date()) : null

  return (
    <main className="mx-auto max-w-[42rem] px-4 pb-24 pt-8 sm:px-6">
      <div className="flex items-baseline justify-between gap-4">
        {back}
        <p className="font-mono text-[12.5px] text-ink" aria-live="polite">
          {loaded.title} · {queue.length} left
        </p>
      </div>

      <article className="lp-raised mt-6 rounded-md p-6 sm:p-8" aria-label="Card">
        <p className="font-sans text-[12.5px] text-ink">{item.topic}</p>
        <h1 className="mt-2 font-sans text-[19px] font-medium leading-snug text-ink">{item.prompt}</h1>

        {isMcq && cover && !uncovered && picked === null ? (
          <div className="mt-6">
            <p className="font-sans text-[14px] text-ink">Think of your answer first.</p>
            <Button className="mt-3" onClick={() => setUncovered(true)}>
              Show options
            </Button>
          </div>
        ) : isMcq ? (
          <>
            <ul className="mt-6 space-y-2.5" role="list">
              {order.map((o, i) => {
                const chosen = picked === o.id
                const show = answered
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      disabled={answered}
                      aria-pressed={chosen}
                      onClick={() => {
                        const ok = o.is_correct
                        setPicked(o.id)
                        // Grade now; the learner reads the explanation, then continues.
                        pending.current = { rating: gradeMcq(ok, unsure), selected: o.id, correct: ok, unsure }
                      }}
                      className={[
                        'lp-toggle flex w-full items-start gap-3 rounded-md border-0 bg-transparent px-4 py-3 text-left font-sans text-[15px] text-ink',
                        'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink/40 disabled:cursor-default',
                        show && o.is_correct ? 'font-semibold' : '',
                      ].join(' ')}
                    >
                      <span className="font-mono text-[13px]">{String.fromCharCode(65 + i)}</span>
                      <span className="min-w-0 flex-1">
                        {o.text}
                        {show && (o.is_correct || chosen) && (
                          <span className="mt-1 block text-[13.5px] font-normal">
                            {o.is_correct ? 'Correct.' : 'Your answer.'} {o.rationale}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {!answered && (
              <label className="mt-5 flex items-center gap-2 font-sans text-[14px] text-ink">
                <input type="checkbox" checked={unsure} onChange={e => setUnsure(e.target.checked)} />
                I’m not sure (guessing)
              </label>
            )}
          </>
        ) : (
          revealed && (
            <p className="mt-6 border-t border-ink/15 pt-5 font-sans text-[17px] leading-relaxed text-ink">{item.concise_answer}</p>
          )
        )}

        {(revealed || answered) && (
          <div className="mt-5 space-y-3 font-sans text-[14.5px] leading-relaxed text-ink">
            {isMcq && correctOption && picked !== correctOption.id && <p>Answer: {item.concise_answer}</p>}
            {item.clinical_rationale && <p>{item.clinical_rationale}</p>}
            {item.clinical_caveats && <p className="text-[13.5px]">Note: {item.clinical_caveats}</p>}
            <p className="text-[12.5px]">
              Source:{' '}
              {item.source_url ? (
                <a href={item.source_url} className="underline" rel="noreferrer">
                  {item.source_citation}
                </a>
              ) : (
                item.source_citation
              )}
              {item.third_party_sources.length > 0 && ` · includes ${item.third_party_sources.join(', ')}`}
              {' · '}
              {item.license}
              {item.primary_pcid && (
                <>
                  {' · '}
                  <Link to={`/id/PCID-${item.primary_pcid}`} className="underline">
                    Drug page
                  </Link>
                </>
              )}
            </p>
          </div>
        )}
      </article>

      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        {isMcq ? (
          answered && (
            <Button
              onClick={() => {
                const p = pending.current
                if (p) void advance(item, p.rating, { selected: p.selected, correct: p.correct, unsure: p.unsure })
              }}
            >
              Continue
            </Button>
          )
        ) : !revealed ? (
          <Button onClick={() => setRevealed(true)}>Show answer</Button>
        ) : (
          RATINGS.map(r => (
            <Button key={r.rating} onClick={() => void advance(item, r.rating, { selected: null, correct: null, unsure: false })}>
              {r.label} <span className="font-mono text-[11.5px]">{preview?.[r.rating] ?? r.rating}</span>
            </Button>
          ))
        )}
      </div>
      {isMcq && (
        <label className="mt-4 flex items-center gap-2 font-sans text-[13px] text-ink">
          <input
            type="checkbox"
            checked={cover}
            onChange={e => {
              setCover(e.target.checked)
              writeCover(e.target.checked)
            }}
          />
          Hide the options until I ask for them
        </label>
      )}
      {!isMcq && !revealed && (
        <p className="mt-3 font-sans text-[12.5px] text-ink">Space shows the answer; 1 to 4 rate it.</p>
      )}
    </main>
  )
}

