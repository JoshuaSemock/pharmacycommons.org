import { describe, expect, it } from 'vitest'
import { buildWeeks, initialSpan, offsetDate, roleOf, spanOf, weekStart, weekdayOf, weeksText } from './calendar'

describe('weeks', () => {
  it('finds the Sunday that starts a week', () => {
    expect(weekdayOf('2026-10-13')).toBe(2) // Tuesday
    expect(weekStart('2026-10-13')).toBe('2026-10-11')
    expect(weekStart('2026-10-11')).toBe('2026-10-11')
  })
  it('opens on 5 weeks back, this week, 6 ahead', () => {
    const { start, weeks } = initialSpan('2026-10-13')
    expect(start).toBe('2026-09-06')
    expect(weeks).toBe(12)
    const rows = buildWeeks(start, weeks)
    expect(rows).toHaveLength(12)
    expect(rows[5][2]).toBe('2026-10-13')
    expect(rows[11][6]).toBe('2026-11-28')
  })
})

describe('offsetDate', () => {
  it('90 days before Oct 13 is Jul 15', () => {
    expect(offsetDate('2026-10-13', 'before', 90)).toBe('2026-07-15')
  })
  it('counts days after, across a year end', () => {
    expect(offsetDate('2026-12-20', 'after', 30)).toBe('2027-01-19')
  })
  it('rejects fractions and negatives', () => {
    expect(offsetDate('2026-10-13', 'after', 1.5)).toBeNull()
    expect(offsetDate('2026-10-13', 'after', -1)).toBeNull()
  })
})

describe('spanOf and roleOf', () => {
  it('Oct 13 to Oct 20 is 7 days', () => {
    expect(spanOf('2026-10-13', '2026-10-20')).toEqual({ start: '2026-10-13', end: '2026-10-20', days: 7, backwards: false })
  })
  it('orders a span that runs backwards', () => {
    expect(spanOf('2026-10-13', '2026-07-15')).toMatchObject({ start: '2026-07-15', end: '2026-10-13', days: 90, backwards: true })
  })
  it('marks the dates in between', () => {
    expect(roleOf('2026-10-13', '2026-10-13', '2026-10-20')).toBe('start')
    expect(roleOf('2026-10-16', '2026-10-13', '2026-10-20')).toBe('between')
    expect(roleOf('2026-10-20', '2026-10-13', '2026-10-20')).toBe('end')
    expect(roleOf('2026-10-21', '2026-10-13', '2026-10-20')).toBe('none')
    expect(roleOf('2026-08-01', '2026-10-13', '2026-07-15')).toBe('between')
  })
})

describe('weeksText', () => {
  it('words weeks and leftover days', () => {
    expect(weeksText(7)).toBe('1 week')
    expect(weeksText(90)).toBe('12 weeks 6 days')
    expect(weeksText(5)).toBe('')
  })
})
