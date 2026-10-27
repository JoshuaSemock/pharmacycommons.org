/**
 * Learn — building a study session (docs/learn.md §4.1).
 *
 * Order: learning / relearning cards that are due, then due reviews (lowest retrievability first), with
 * new cards interleaved so a session is not all-new or all-review. Daily limits default to 100 reviews
 * and 20 new cards; new cards already started today count against the new limit.
 *
 * Destination: src/learn/queue.ts
 */

import { retrievability } from './scheduler'
import type { LearnItem, SchedState } from './types'

export type QueueEntry = { item: LearnItem; state: SchedState | null }

export type Limits = { reviews: number; newItems: number }

export const DEFAULT_LIMITS: Limits = { reviews: 100, newItems: 20 }

const isNew = (s: SchedState | null) => !s || s.state === 'new'

/** A card that failed or is mid-learning comes back within the session. */
export const SESSION_WINDOW_MS = 20 * 60 * 1000

export type BuiltQueue = { entries: QueueEntry[]; dueCount: number; newCount: number; newAvailable: number }

export function buildQueue(
  items: readonly LearnItem[],
  states: ReadonlyMap<string, SchedState>,
  now: Date,
  limits: Limits = DEFAULT_LIMITS,
  opts: { newToday?: number } = {},
): BuiltQueue {
  const t = now.getTime()
  const learning: QueueEntry[] = []
  const reviews: { entry: QueueEntry; r: number }[] = []
  const fresh: QueueEntry[] = []

  for (const item of items) {
    const state = states.get(item.id) ?? null
    if (isNew(state)) {
      fresh.push({ item, state })
    } else if (state && new Date(state.due_at).getTime() <= t) {
      if (state.state === 'learning' || state.state === 'relearning') learning.push({ item, state })
      else reviews.push({ entry: { item, state }, r: retrievability(state, now) })
    }
  }

  learning.sort((a, b) => a.state!.due_at.localeCompare(b.state!.due_at))
  reviews.sort((a, b) => a.r - b.r)
  const due = [...learning, ...reviews.map(x => x.entry)].slice(0, Math.max(0, limits.reviews))

  const newAllowed = Math.max(0, limits.newItems - (opts.newToday ?? 0))
  const newCards = fresh.slice(0, newAllowed)

  return {
    entries: interleave(due, newCards),
    dueCount: due.length,
    newCount: newCards.length,
    newAvailable: fresh.length,
  }
}

/** Spread new cards evenly through the due cards; due cards keep their order. */
export function interleave(due: QueueEntry[], fresh: QueueEntry[]): QueueEntry[] {
  if (fresh.length === 0) return due
  if (due.length === 0) return fresh
  const out: QueueEntry[] = []
  const every = Math.max(1, Math.floor(due.length / fresh.length))
  let n = 0
  due.forEach((entry, i) => {
    out.push(entry)
    if ((i + 1) % every === 0 && n < fresh.length) out.push(fresh[n++])
  })
  while (n < fresh.length) out.push(fresh[n++])
  return out
}

/**
 * After an answer, `remaining` is the queue without the card just answered. If the card comes due
 * within SESSION_WINDOW_MS (an Again, or a learning step) it returns a few cards later in the same
 * session; otherwise it is done for now.
 */
export function requeue(remaining: QueueEntry[], item: LearnItem, updated: SchedState, now: Date): QueueEntry[] {
  const due = new Date(updated.due_at).getTime()
  if (due - now.getTime() > SESSION_WINDOW_MS) return remaining
  const out = [...remaining]
  out.splice(Math.min(4, out.length), 0, { item, state: updated })
  return out
}

/** Cards first reviewed on the local day of `now`, from a list of events (guest mode). */
export function countNewToday(events: readonly { reviewed_at: string; state_before: SchedState }[], now: Date): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return events.filter(e => e.state_before.state === 'new' && new Date(e.reviewed_at).getTime() >= start.getTime()).length
}
