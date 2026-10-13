/**
 * Days supply and quantity — refill calendar view (pure date logic).
 * Dates are yyyy-mm-dd and worked in UTC so daylight saving can't move a day.
 * The component is CalendarView.tsx. Design: docs/days-supply.md, "Calendar view".
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addDays, daysBetween } from './calc'

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const

/** Weeks shown on first load: this many before the current week, and after it. */
export const WEEKS_BEFORE = 5
export const WEEKS_AFTER = 6

/** Sunday = 0 … Saturday = 6. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** The Sunday that starts the week holding `iso`. */
export function weekStart(iso: string): string {
  return addDays(iso, -weekdayOf(iso)) ?? iso
}

/** `count` consecutive weeks (7 dates each), the first starting on Sunday `start`. */
export function buildWeeks(start: string, count: number): string[][] {
  const weeks: string[][] = []
  for (let w = 0; w < count; w++) {
    const row: string[] = []
    for (let d = 0; d < 7; d++) row.push(addDays(start, w * 7 + d) ?? start)
    weeks.push(row)
  }
  return weeks
}

/** First Sunday and week count for the opening view around `today`. */
export function initialSpan(today: string): { start: string; weeks: number } {
  return { start: addDays(weekStart(today), -7 * WEEKS_BEFORE) ?? today, weeks: WEEKS_BEFORE + 1 + WEEKS_AFTER }
}

export type Direction = 'before' | 'after'

/** The date `n` days before or after `from`; null unless `n` is a whole number of days. */
export function offsetDate(from: string, direction: Direction, n: number): string | null {
  if (!Number.isInteger(n) || n < 0) return null
  return addDays(from, direction === 'before' ? -n : n)
}

export type Span = { start: string; end: string; days: number; backwards: boolean }

/** The span between two dates, ordered for drawing; `days` counts from `from` to `to`, not counting the first day. */
export function spanOf(from: string, to: string): Span | null {
  const days = daysBetween(from, to)
  if (days == null) return null
  return days >= 0 ? { start: from, end: to, days, backwards: false } : { start: to, end: from, days: -days, backwards: true }
}

export type CellRole = 'start' | 'end' | 'between' | 'none'

/** How a date relates to the highlighted span. A zero-day span is one 'start'. */
export function roleOf(iso: string, anchor: string, other: string | null): CellRole {
  if (iso === anchor) return 'start'
  if (other == null) return 'none'
  if (iso === other) return 'end'
  const s = spanOf(anchor, other)
  return s && iso > s.start && iso < s.end ? 'between' : 'none'
}

export const dayWord = (n: number): string => (n === 1 ? 'day' : 'days')

/** "7 days (1 week)", "90 days (12 weeks 6 days)". */
export function weeksText(n: number): string {
  const w = Math.floor(n / 7)
  const d = n % 7
  if (w === 0) return ''
  return `${w} ${w === 1 ? 'week' : 'weeks'}${d ? ` ${d} ${dayWord(d)}` : ''}`
}
