// GENERATED from src/pageSource/suggest.ts by scripts/sync-page-source.mjs — do not edit here.
/**
 * "Did you mean …" for unknown keys, block names and section names, so a wrong
 * guess gets pointed at the right place instead of just rejected
 * (docs/page-editor.md §4a).
 */

import type { BlockSchema } from './types.ts'

export function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

/** Closest candidate within a distance that scales with length, or null. */
export function nearest(input: string, candidates: string[]): string | null {
  const needle = input.toLowerCase()
  let best: string | null = null
  let bestScore = Infinity
  for (const c of candidates) {
    const hay = c.toLowerCase()
    const score = hay.startsWith(needle) || needle.startsWith(hay) ? 0.5 : editDistance(needle, hay)
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  const limit = Math.max(2, Math.floor(needle.length / 3))
  return best !== null && bestScore <= limit ? best : null
}

/** A block whose hint words appear in what the contributor typed ("kidney_warning" → renal-dosing). */
export function blockByHint(input: string, blocks: BlockSchema[], except?: string): BlockSchema | null {
  const words = input.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  for (const b of blocks) {
    if (b.name === except || !b.enabled) continue
    if (b.hints.some(h => words.includes(h) || input.toLowerCase().includes(h.replace(/\s+/g, '_')))) return b
  }
  return null
}
