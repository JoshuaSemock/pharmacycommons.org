import { describe, expect, it } from 'vitest'
import { FSRS_FIXTURES } from './fsrs.fixtures'
import {
  MCQ_STABILITY_FACTOR,
  gradeMcq,
  newState,
  retrievability,
  schedule,
} from './scheduler'

describe('FSRS-5 scheduler matches the reference implementation (py-fsrs 5.1.0)', () => {
  for (const [name, rows] of Object.entries(FSRS_FIXTURES)) {
    it(name, () => {
      let s = newState(new Date(rows[0].at))
      rows.forEach((row, i) => {
        s = schedule(s, row.rating, new Date(row.at))
        const where = `${name} review ${i + 1}`
        expect(s.state, where).toBe(row.state)
        expect(s.step, where).toBe(row.step)
        expect(s.stability, where).toBeCloseTo(row.stability, 9)
        expect(s.difficulty, where).toBeCloseTo(row.difficulty, 9)
        expect(new Date(s.due_at).getTime(), where).toBe(new Date(row.due).getTime())
      })
    })
  }
})

describe('schedule', () => {
  const t0 = new Date('2026-01-01T09:00:00Z')

  it('does not modify its input', () => {
    const before = newState(t0)
    const copy = structuredClone(before)
    schedule(before, 3, t0)
    expect(before).toEqual(copy)
  })

  it('counts reviews and lapses', () => {
    let s = newState(t0)
    s = schedule(s, 3, t0)
    s = schedule(s, 3, new Date(s.due_at))
    s = schedule(s, 3, new Date(s.due_at)) // graduates to review
    expect(s.state).toBe('review')
    s = schedule(s, 1, new Date(s.due_at))
    expect(s.state).toBe('relearning')
    expect(s.lapses).toBe(1)
    expect(s.reps).toBe(4)
  })

  it('first review of a new card with Good is 10 minutes out; Easy graduates at once', () => {
    expect(new Date(schedule(newState(t0), 3, t0).due_at).getTime() - t0.getTime()).toBe(10 * 60 * 1000)
    const easy = schedule(newState(t0), 4, t0)
    expect(easy.state).toBe('review')
    expect(new Date(easy.due_at).getTime() - t0.getTime()).toBeGreaterThanOrEqual(24 * 3600 * 1000)
  })

  it('retrievability is about 0.9 on the day a review comes due', () => {
    let s = newState(t0)
    s = schedule(s, 4, t0)
    const due = new Date(s.due_at)
    expect(retrievability(s, due)).toBeGreaterThan(0.85)
    expect(retrievability(s, due)).toBeLessThan(0.95)
    expect(retrievability(newState(t0), t0)).toBe(0)
  })

  it('multiple-choice mode adds less stability than flashcard mode on a successful long-term review', () => {
    let s = newState(t0)
    s = schedule(s, 4, t0)
    const due = new Date(s.due_at)
    const card = schedule(s, 3, due, { mode: 'flashcard' })
    const mcq = schedule(s, 3, due, { mode: 'mcq' })
    expect(mcq.stability).toBeLessThan(card.stability)
    expect(mcq.stability).toBeGreaterThan(s.stability)
    const gain = (x: number) => x - s.stability
    expect(gain(mcq.stability) / gain(card.stability)).toBeCloseTo(MCQ_STABILITY_FACTOR, 9)
  })

  it('multiple-choice dampening does not change a lapse or a first review', () => {
    const first = (mode: 'flashcard' | 'mcq') => schedule(newState(t0), 3, t0, { mode })
    expect(first('mcq')).toEqual(first('flashcard'))
    let s = schedule(newState(t0), 4, t0)
    const due = new Date(s.due_at)
    expect(schedule(s, 1, due, { mode: 'mcq' }).stability).toBe(schedule(s, 1, due, { mode: 'flashcard' }).stability)
    s = schedule(s, 3, due)
    expect(s.state).toBe('review')
  })
})

describe('gradeMcq', () => {
  it('maps wrong, unsure-correct and confident-correct answers; never Easy', () => {
    expect(gradeMcq(false, false)).toBe(1)
    expect(gradeMcq(false, true)).toBe(1)
    expect(gradeMcq(true, true)).toBe(2)
    expect(gradeMcq(true, false)).toBe(3)
  })
})
