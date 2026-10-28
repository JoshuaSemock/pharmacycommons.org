/**
 * Learn — cram mode: go through a whole collection now, whatever its schedule says, and leave the schedule alone.
 * Every card is shown once in a shuffled order; a card you miss comes back a few cards later until you get it.
 * Nothing is scheduled or saved, so cramming before an exam does not distort what spaced repetition has learned.
 *
 * Destination: src/learn/cram.ts
 */

import type { QueueEntry } from './queue'
import { seededShuffle } from './shuffle'
import type { LearnItem } from './types'

/** How many cards later a missed card returns. */
export const CRAM_GAP = 4

export function cramQueue(items: readonly LearnItem[], seed: string): QueueEntry[] {
  return seededShuffle(items, seed).map(item => ({ item, state: null }))
}

/** After an answer, `remaining` is the queue without the card just answered. A missed card goes back in `gap` cards later. */
export function cramRequeue(remaining: QueueEntry[], item: LearnItem, missed: boolean, gap: number = CRAM_GAP): QueueEntry[] {
  if (!missed) return remaining
  const out = [...remaining]
  out.splice(Math.min(gap, out.length), 0, { item, state: null })
  return out
}
