/**
 * Learn — deterministic shuffling. The same seed always gives the same order, so a card re-shown after
 * a re-render keeps its option order, while a new session (new seed) reshuffles.
 *
 * Destination: src/learn/shuffle.ts
 */

import type { LearnItem, McqOption } from './types'

/** xmur3 string hash → 32-bit seed. */
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^ (h >>> 16)) >>> 0
}

/** mulberry32 PRNG. */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates on a copy. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items]
  const rand = rng(hashSeed(seed))
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Items tagged `fixed-option-order` (scores, schedules, ordered scales) keep their authored order. */
export function optionOrder(item: Pick<LearnItem, 'id' | 'tags' | 'mcq_options'>, sessionSeed: string): McqOption[] {
  const options = item.mcq_options ?? []
  return item.tags.includes('fixed-option-order') ? [...options] : seededShuffle(options, `${sessionSeed}:${item.id}`)
}
