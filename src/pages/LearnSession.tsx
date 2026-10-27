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
import { optionKey } from '../learn/keys'
import { optionOrder } from '../learn/shuffle'
import type { EventMode, LearnItem, Rating, ReviewEvent } from '../learn/types'
import { useProgress } from '../learn/useProgress'

type Loaded = { title: string; collectionId: string | null; items: LearnItem[] }
type Tally = { answered: number; again: number; correct: number; mcq: number }
type McqOption = NonNullable<LearnItem['mcq_options']>[number]

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

  // Multiple choice: grade now, then the learner reads the explanation and continues.
  const choose = useCallback((o: McqOption, guessing: boolean) => {
    const ok = o.is_correct
    pending.current = { rating: gradeMcq(ok, guessing), selected: o.id, correct: ok, unsure: guessing }
    setUnsure(guessing)
    setPicked(o.id)
  }, [])

  const continueMcq = useCallback(() => {
    const p = pending.current
    if (current && p) void advance(current.item, p.rating, { selected: p.selected, correct: p.correct, unsure: p.unsure })
  }, [current, advance])

  // Once an answer is in, focus goes to Continue, so Enter or Space moves on.
  useEffect(() => {
    if (picked !== null) document.querySelector<HTMLButtonElement>('[data-learn-continue]')?.focus()
  }, [picked])

  // Keyboard, multiple choice: 1-5 pick that option (Shift+number = "guessing"), U toggles "not sure", Enter reveals covered options.
  useEffect(() => {
    if (!current || current.item.item_type !== 'mcq' || picked !== null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'checkbox'))) return
      if (cover && !uncovered) {
        if (e.key === 'Enter' || e.key === ' ') {
          if (t && t.tagName === 'BUTTON') return
          e.preventDefault()
          setUncovered(true)
        }
        return
      }
      const k = optionKey(e, order.length)
      if (k) {
        e.preventDefault()
        choose(order[k.index], k.unsure || unsure)
      } else if (e.key === 'u' || e.key === 'U') {
        setUnsure(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, picked, cover, uncovered, order, unsure, choose])

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
  const answered = isMcq && picked !== null
  const preview = !isMcq && revealed ? intervalPreview(progress.states.get(item.id) ?? null, new Date()) : null

  return (
    <main className="mx-auto max-w-[42rem] px-4 pb-24 pt-8 sm:px-6">
      <div className="flex items-baseline justify-between gap-4">
        {back}
        <p className="font-mono text-[12.5px] text-ink" aria-live="polite">
          {loaded.title} · {queue.length} left{tally.mcq > 0 ? ` · ${tally.correct} of ${tally.mcq} correct` : ''}
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
            <div
              role="group"
              aria-label="Answer options"
              className="mt-6 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2"
            >
              {order.map((o, i) => {
                const chosen = picked === o.id
                const state = !answered ? 'idle' : o.is_correct ? 'right' : chosen ? 'wrong' : 'rest'
                const lastOdd = order.length % 2 === 1 && i === order.length - 1
                return (
                  <button
                    key={o.id}
                    type="button"
                    // Settled tiles that were neither picked nor right lie flat; the two that matter stay debossed and filled.
                    disabled={state === 'rest'}
                    aria-disabled={answered || undefined}
                    aria-pressed={state === 'right' || state === 'wrong'}
                    onClick={() => {
                      if (!answered) choose(o, unsure)
                    }}
                    className={[
                      'lp-toggle flex min-h-[3.5rem] w-full min-[480px]:min-h-[4.75rem] items-start gap-3 rounded-md border-0 bg-transparent px-4 py-3.5 text-left font-sans text-[15px] leading-snug text-ink',
                      'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink/40 disabled:cursor-default',
                      lastOdd ? 'min-[480px]:col-span-2' : '',
                      state === 'right' ? 'lp-foil-set' : state === 'wrong' ? 'lp-wrong-set' : '',
                      state === 'rest' ? 'opacity-60' : '',
                    ].join(' ')}
                  >
                    <span className="font-mono text-[13px] leading-snug" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      {o.text}
                      {state === 'right' && <span className="mt-1.5 block text-[12.5px]">Correct answer</span>}
                      {state === 'wrong' && <span className="mt-1.5 block text-[12.5px]">Your answer</span>}
                    </span>
                  </button>
                )
              })}
            </div>
            {answered && picked !== null && pending.current && (() => {
              const ok = pending.current.correct
              const right = order.findIndex(o => o.is_correct)
              const mine = order.findIndex(o => o.id === picked)
              const next = intervalPreview(progress.states.get(item.id) ?? null, new Date(), 'mcq')[pending.current.rating]
              return (
                <div className="lp-sunken mt-5 space-y-2 rounded-md p-4 font-sans text-[14.5px] leading-relaxed text-ink" role="status">
                  <p className="text-[16px]">
                    {ok ? 'Correct.' : `Not quite. The answer is ${right + 1}: ${item.concise_answer}`}
                  </p>
                  {!ok && order[mine]?.rationale && (
                    <p>Option {mine + 1}: {order[mine].rationale}</p>
                  )}
                  {order[right]?.rationale && (
                    <p>
                      {!ok && `Option ${right + 1}: `}
                      {order[right].rationale}
                    </p>
                  )}
                  {order.some((o, i) => i !== right && i !== mine && o.rationale) && (
                    <details>
                      <summary className="lp-toggle inline-block cursor-pointer list-none rounded-md px-3 py-1 text-[12.5px]">
                        {ok ? 'Why the other options are wrong' : 'The other options'}
                      </summary>
                      <ul className="mt-2 space-y-1.5 text-[13.5px]" role="list">
                        {order.map((o, i) =>
                          i !== right && i !== mine && o.rationale ? (
                            <li key={o.id}>
                              Option {i + 1}: {o.rationale}
                            </li>
                          ) : null,
                        )}
                      </ul>
                    </details>
                  )}
                  <p className="text-[12.5px]">
                    {pending.current.unsure && ok ? 'Marked as a guess, so it comes back sooner. ' : ''}Next review in {next}.
                  </p>
                </div>
              )
            })()}
            {!answered && (
              <div className="mt-5 space-y-2 font-sans text-[14px] text-ink">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={unsure} onChange={e => setUnsure(e.target.checked)} />
                  I’m not sure (guessing)
                </label>
                <p className="hidden text-[12.5px] [@media(hover:hover)]:block">
                  Press 1 to {order.length} to answer. Hold Shift if you are guessing. U toggles “not sure”.
                </p>
              </div>
            )}
          </>
        ) : (
          revealed && (
            <p className="mt-6 border-t border-ink/15 pt-5 font-sans text-[17px] leading-relaxed text-ink">{item.concise_answer}</p>
          )
        )}

        {(revealed || answered) && (
          <div className="mt-5 space-y-3 font-sans text-[14.5px] leading-relaxed text-ink">
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
            <Button data-learn-continue="" onClick={continueMcq}>
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

