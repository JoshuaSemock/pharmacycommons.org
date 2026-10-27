/**
 * Learn — FSRS-5 spaced-repetition scheduler (docs/learn.md §4).
 *
 * A TypeScript port of the FSRS-5 algorithm with the default weights, learning steps of 1 and 10
 * minutes, a relearning step of 10 minutes, 90 % desired retention and no interval fuzz, so results
 * are reproducible. `src/learn/scheduler.test.ts` checks it against sequences produced by the
 * reference implementation (py-fsrs 5.1.0, `fsrs.fixtures.ts`) to full floating-point precision.
 *
 * Differences from the reference, both deliberate:
 *   1. `mcq` mode multiplies the stability *gain* of a successful long-term review by
 *      MCQ_STABILITY_FACTOR (recognising an option is weaker evidence than recalling an answer).
 *      That constant is a tunable guess, not a validated value. Flashcard mode is the reference.
 *   2. The learning step is stored (`step`) so a review needs no hidden state.
 *
 * Destination: src/learn/scheduler.ts
 */

import type { CardState, Rating, SchedState, StudyMode } from './types'

/** Recorded with every review so history stays interpretable when the algorithm changes. */
export const SCHEDULER_VERSION = 'fsrs-5.0'

/** FSRS-5 default weights w0..w18. */
export const WEIGHTS: readonly number[] = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11,
  0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
]

const DECAY = -0.5
const FACTOR = 0.9 ** (1 / DECAY) - 1
export const DESIRED_RETENTION = 0.9
export const MAX_INTERVAL_DAYS = 36500
const LEARNING_STEPS_MIN = [1, 10]
const RELEARNING_STEPS_MIN = [10]
const MIN = 60 * 1000
const DAY = 24 * 60 * MIN

/** Weight applied to the stability gain of a successful MCQ review. Tunable; not validated. */
export const MCQ_STABILITY_FACTOR = 0.75

export type ScheduleOptions = { mode?: StudyMode; mcqStabilityFactor?: number }

/** A card that has never been reviewed. `due_at` is when it first becomes available. */
export function newState(now: Date = new Date()): SchedState {
  return {
    state: 'new',
    step: 0,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    last_rating: null,
    last_reviewed_at: null,
    due_at: now.toISOString(),
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi)
const w = (i: number) => WEIGHTS[i]

function initialStability(r: Rating): number {
  return Math.max(w(r - 1), 0.1)
}

function initialDifficulty(r: Rating): number {
  return clamp(w(4) - Math.exp(w(5) * (r - 1)) + 1, 1, 10)
}

function nextDifficulty(d: number, r: Rating): number {
  const delta = -(w(6) * (r - 3))
  const damped = d + ((10 - d) * delta) / 9
  return clamp(w(7) * initialDifficulty(4) + (1 - w(7)) * damped, 1, 10)
}

function shortTermStability(s: number, r: Rating): number {
  return s * Math.exp(w(17) * (r - 3 + w(18)))
}

/** Probability of recall after `elapsedDays` whole days (the reference floors to whole days). */
export function retrievabilityAt(stability: number, elapsedDays: number): number {
  return (1 + (FACTOR * Math.max(0, elapsedDays)) / stability) ** DECAY
}

function nextRecallStability(d: number, s: number, rv: number, r: Rating): number {
  const hard = r === 2 ? w(15) : 1
  const easy = r === 4 ? w(16) : 1
  return s * (1 + Math.exp(w(8)) * (11 - d) * s ** -w(9) * (Math.exp((1 - rv) * w(10)) - 1) * hard * easy)
}

function nextForgetStability(d: number, s: number, rv: number): number {
  const longTerm = w(11) * d ** -w(12) * ((s + 1) ** w(13) - 1) * Math.exp((1 - rv) * w(14))
  const shortTerm = s / Math.exp(w(17) * w(18))
  return Math.min(longTerm, shortTerm)
}

/** Whole days from the last review (floor), as in the reference implementation. */
function daysSince(last: string | null, now: Date): number | null {
  if (!last) return null
  return Math.floor((now.getTime() - new Date(last).getTime()) / DAY)
}

function intervalDays(stability: number): number {
  const raw = (stability / FACTOR) * (DESIRED_RETENTION ** (1 / DECAY) - 1)
  return clamp(Math.round(raw), 1, MAX_INTERVAL_DAYS)
}

/** Current probability of recall, or 0 for a card that has not been reviewed. */
export function retrievability(s: SchedState, now: Date = new Date()): number {
  if (!s.last_reviewed_at || s.stability <= 0) return 0
  return retrievabilityAt(s.stability, daysSince(s.last_reviewed_at, now) ?? 0)
}

/**
 * The state after reviewing a card with `rating` at `now`. Pure: the input is not modified.
 */
export function schedule(prev: SchedState, rating: Rating, now: Date, opts: ScheduleOptions = {}): SchedState {
  const mode = opts.mode ?? 'flashcard'
  const factor = mode === 'mcq' ? (opts.mcqStabilityFactor ?? MCQ_STABILITY_FACTOR) : 1
  const first = prev.state === 'new'
  const elapsed = daysSince(prev.last_reviewed_at, now)

  let stability: number
  let difficulty: number
  if (first) {
    stability = initialStability(rating)
    difficulty = initialDifficulty(rating)
  } else if (elapsed !== null && elapsed < 1) {
    stability = shortTermStability(prev.stability, rating)
    difficulty = nextDifficulty(prev.difficulty, rating)
  } else {
    const rv = retrievabilityAt(prev.stability, elapsed ?? 0)
    stability =
      rating === 1
        ? nextForgetStability(prev.difficulty, prev.stability, rv)
        : prev.stability + factor * (nextRecallStability(prev.difficulty, prev.stability, rv, rating) - prev.stability)
    difficulty = nextDifficulty(prev.difficulty, rating)
  }

  let state: CardState = first ? 'learning' : prev.state
  let step = prev.step
  let delayMs: number

  const review = () => {
    state = 'review'
    step = 0
    delayMs = intervalDays(stability) * DAY
  }
  const ladder = (steps: number[]) => {
    if (rating === 1) {
      step = 0
      delayMs = steps[0] * MIN
    } else if (rating === 2) {
      delayMs =
        step === 0 && steps.length === 1
          ? steps[0] * 1.5 * MIN
          : step === 0
            ? ((steps[0] + steps[1]) / 2) * MIN
            : steps[step] * MIN
    } else if (rating === 3) {
      if (step + 1 === steps.length) review()
      else {
        step += 1
        delayMs = steps[step] * MIN
      }
    } else review()
  }

  delayMs = 0
  let lapses = prev.lapses
  if (state === 'learning') ladder(LEARNING_STEPS_MIN)
  else if (state === 'relearning') ladder(RELEARNING_STEPS_MIN)
  else if (rating === 1) {
    lapses += 1
    state = 'relearning'
    step = 0
    delayMs = RELEARNING_STEPS_MIN[0] * MIN
  } else review()

  return {
    state,
    step,
    stability,
    difficulty,
    reps: prev.reps + 1,
    lapses,
    last_rating: rating,
    last_reviewed_at: now.toISOString(),
    due_at: new Date(now.getTime() + delayMs).toISOString(),
  }
}

/**
 * Turn a multiple-choice answer into a rating (docs/learn.md §4.2): a wrong answer is Again, a correct
 * answer the learner was unsure of is Hard, a confident correct answer is Good. Easy is never
 * inferred from a first multiple-choice attempt.
 */
export function gradeMcq(isCorrect: boolean, wasUnsure: boolean): Rating {
  if (!isCorrect) return 1
  return wasUnsure ? 2 : 3
}
