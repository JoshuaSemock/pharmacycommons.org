import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clampLimits, DEFAULT_SETTINGS, LIMIT_BOUNDS, readLocalSettings, sameSettings, writeLocalSettings } from './settings'

// vitest runs in node here: a tiny localStorage stand-in.
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: k => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: k => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  }
})
afterEach(() => {
  delete (globalThis as unknown as { localStorage?: Storage }).localStorage
})

describe('clampLimits', () => {
  it('keeps values inside the database bounds and rounds to whole cards', () => {
    expect(clampLimits({ newItems: 9999, reviews: -5 })).toEqual({ newItems: LIMIT_BOUNDS.newItems.max, reviews: 0 })
    expect(clampLimits({ newItems: 12.6, reviews: 250.4 })).toEqual({ newItems: 13, reviews: 250 })
  })

  it('falls back to the defaults for blanks and junk, and allows zero', () => {
    expect(clampLimits({ newItems: Number.NaN, reviews: undefined })).toEqual({ newItems: 20, reviews: 100 })
    expect(clampLimits(null)).toEqual({ newItems: 20, reviews: 100 })
    expect(clampLimits({ newItems: 0, reviews: 0 })).toEqual({ newItems: 0, reviews: 0 })
  })
})

describe('local settings', () => {
  it('round-trips and clamps what it reads back', () => {
    writeLocalSettings({ limits: { newItems: 40, reviews: 300 }, coverOptions: true })
    expect(readLocalSettings()).toEqual({ limits: { newItems: 40, reviews: 300 }, coverOptions: true })
    store.set('pc_learn_settings_v1', JSON.stringify({ limits: { newItems: 100000, reviews: 1 }, coverOptions: 'yes' }))
    expect(readLocalSettings()).toEqual({ limits: { newItems: 500, reviews: 1 }, coverOptions: false })
  })

  it('reads the earlier cover-only key until settings are saved', () => {
    store.set('pc_learn_cover', '1')
    expect(readLocalSettings()).toEqual({ ...DEFAULT_SETTINGS, coverOptions: true })
  })

  it('survives unreadable storage', () => {
    store.set('pc_learn_settings_v1', '{not json')
    expect(readLocalSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('compares settings by value', () => {
    expect(sameSettings(DEFAULT_SETTINGS, { limits: { newItems: 20, reviews: 100 }, coverOptions: false })).toBe(true)
    expect(sameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, coverOptions: true })).toBe(false)
  })
})
