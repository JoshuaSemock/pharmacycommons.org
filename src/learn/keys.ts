/**
 * Learn — keyboard shortcuts for multiple-choice options.
 *
 * Number keys pick the option with that number (1 = first tile). Holding Shift picks it and marks
 * "I'm not sure (guessing)" in the same stroke. `code` is read first because Shift turns `key` into "!" or "@"
 * on most layouts; `key` is the fallback for environments that don't report a code.
 *
 * Destination: src/learn/keys.ts
 */

export type KeyLike = { code?: string; key: string; shiftKey: boolean }

/** The option a key press selects (0-based) and whether it also flags the answer as a guess, or null. */
export function optionKey(e: KeyLike, count: number): { index: number; unsure: boolean } | null {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code ?? '')
  const n = m ? Number(m[1]) : /^[1-9]$/.test(e.key) ? Number(e.key) : 0
  if (n < 1 || n > count) return null
  return { index: n - 1, unsure: e.shiftKey }
}
