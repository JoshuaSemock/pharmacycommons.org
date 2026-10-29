/**
 * Learn — a learner's settings: daily limits and whether multiple-choice options stay hidden until asked for.
 * Signed in, they live in learn_user_settings; they are also mirrored in this browser, so a guest keeps them and
 * the first paint of a session already knows the hide-options choice.
 *
 * Destination: src/learn/settings.ts
 */

import { DEFAULT_LIMITS, type Limits } from './queue'

export type LearnSettings = { limits: Limits; coverOptions: boolean }

/** The same bounds as the check constraints on learn_user_settings. */
export const LIMIT_BOUNDS = { newItems: { min: 0, max: 500 }, reviews: { min: 0, max: 2000 } } as const

export const DEFAULT_SETTINGS: LearnSettings = { limits: DEFAULT_LIMITS, coverOptions: false }

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function clampLimits(l: Partial<Limits> | null | undefined): Limits {
  return {
    newItems: clampInt(l?.newItems, LIMIT_BOUNDS.newItems.min, LIMIT_BOUNDS.newItems.max, DEFAULT_LIMITS.newItems),
    reviews: clampInt(l?.reviews, LIMIT_BOUNDS.reviews.min, LIMIT_BOUNDS.reviews.max, DEFAULT_LIMITS.reviews),
  }
}

const KEY = 'pc_learn_settings_v1'
const OLD_COVER_KEY = 'pc_learn_cover' // before settings were stored together

export function readLocalSettings(): LearnSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as { limits?: Partial<Limits>; coverOptions?: unknown }
      return { limits: clampLimits(p.limits), coverOptions: p.coverOptions === true }
    }
    return { limits: DEFAULT_LIMITS, coverOptions: localStorage.getItem(OLD_COVER_KEY) === '1' }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function writeLocalSettings(s: LearnSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage unavailable: the choice lasts for this visit only
  }
}

export const sameSettings = (a: LearnSettings, b: LearnSettings): boolean =>
  a.coverOptions === b.coverOptions && a.limits.newItems === b.limits.newItems && a.limits.reviews === b.limits.reviews
