import { describe, expect, it } from 'vitest'
import { formatInterval, intervalPreview } from './interval'
import { newState, schedule } from './scheduler'

const NOW = new Date('2026-03-01T12:00:00Z')

describe('formatInterval', () => {
  it('picks a readable unit', () => {
    expect(formatInterval(20_000)).toBe('<1m')
    expect(formatInterval(10 * 60_000)).toBe('10m')
    expect(formatInterval(3 * 3_600_000)).toBe('3h')
    expect(formatInterval(4 * 86_400_000)).toBe('4d')
    expect(formatInterval(75 * 86_400_000)).toBe('2.5mo')
    expect(formatInterval(400 * 86_400_000)).toBe('1.1y')
  })
})

describe('intervalPreview', () => {
  it('shows learning steps for a new card and longer gaps for better ratings', () => {
    const p = intervalPreview(null, NOW)
    expect(p[1]).toBe('1m')
    expect(p[2]).toBe('6m') // py-fsrs: Hard on the first step waits the mean of the two steps (5.5 min)
    expect(p[3]).toBe('10m')
    expect(p[4]).toMatch(/d$/)
  })

  it('uses the multiple-choice dampener when asked, so the label matches what is scheduled', () => {
    let s = newState(NOW)
    let t = NOW
    for (let i = 0; i < 4; i++) {
      s = schedule(s, 3, t, { mode: 'flashcard' })
      t = new Date(s.due_at)
    }
    const card = intervalPreview(s, t)
    const mcq = intervalPreview(s, t, 'mcq')
    expect(mcq[3]).not.toBe(card[3])
    const expected = schedule(s, 3, t, { mode: 'mcq' })
    expect(new Date(expected.due_at).getTime()).toBeLessThan(new Date(schedule(s, 3, t, { mode: 'flashcard' }).due_at).getTime())
  })
})
