/**
 * Learn — the "next interval" shown on each rating button.
 *
 * Destination: src/learn/interval.ts
 */

import { newState, schedule } from './scheduler'
import type { Rating, SchedState } from './types'

/** "<1m", "10m", "3h", "4d", "2.5mo", "1.2y": the gap until a card is next due, rounded for a button label. */
export function formatInterval(ms: number): string {
  const min = ms / 60000
  if (min < 1) return '<1m'
  if (min < 60) return `${Math.round(min)}m`
  const h = min / 60
  if (h < 24) return `${Math.round(h)}h`
  const d = h / 24
  if (d < 30) return `${Math.round(d)}d`
  const mo = d / 30.4375
  if (mo < 12) return `${Number(mo.toFixed(1))}mo`
  return `${Number((d / 365.25).toFixed(1))}y`
}

/** Next interval label for each rating, from the card's current state (null = new). `mode` matches the session's scheduling mode. */
export function intervalPreview(state: SchedState | null, now: Date, mode: 'flashcard' | 'mcq' = 'flashcard'): Record<Rating, string> {
  const before = state ?? newState(now)
  const out = {} as Record<Rating, string>
  for (const r of [1, 2, 3, 4] as const) {
    const after = schedule(before, r, now, { mode })
    out[r] = formatInterval(new Date(after.due_at).getTime() - now.getTime())
  }
  return out
}
