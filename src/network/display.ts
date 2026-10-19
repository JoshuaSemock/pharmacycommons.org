/**
 * Display settings for the Network canvas, modelled on the Display and Forces
 * panels of Obsidian's graph view: arrows, text fade, link thickness, node size
 * by number of connections, hover focus, and an optional live physics layout.
 *
 * Pure functions and plain data, so they are tested without a browser. Settings
 * are a per-reader convenience kept in localStorage; they never touch the data.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type Display = {
  /** Bigger circles for concepts with more drawn connections. */
  sizeByDegree: boolean
  /** Arrowheads on lines. Direction is still stated in the details panel and table. */
  arrows: boolean
  /** Fade everything except a hovered concept and its neighbors. */
  hoverFocus: boolean
  /** 0 shows names at any zoom, 1 only when zoomed well in. */
  textZoom: number
  /** Line width in pixels. */
  linkWidth: number
  /** Live force layout: concepts drift into place and follow a drag. */
  physics: boolean
  /** Repel force multiplier (physics only). */
  repel: number
  /** Resting line length in pixels (physics only). */
  linkDistance: number
}

export const RANGES = {
  textZoom: { min: 0, max: 1, step: 0.05 },
  linkWidth: { min: 0.5, max: 3, step: 0.25 },
  repel: { min: 0.25, max: 2.5, step: 0.25 },
  linkDistance: { min: 60, max: 260, step: 10 },
} as const

export const defaultDisplay = (): Display => ({
  sizeByDegree: true,
  arrows: true,
  hoverFocus: true,
  textZoom: 0.35,
  linkWidth: 1.5,
  physics: false,
  repel: 1,
  linkDistance: 110,
})

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Reads stored settings defensively: wrong types fall back to defaults, numbers are clamped. */
export function sanitizeDisplay(raw: unknown): Display {
  const d = defaultDisplay()
  if (typeof raw !== 'object' || raw === null) return d
  const r = raw as Record<string, unknown>
  const bool = (k: keyof Display, fallback: boolean) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : fallback)
  const num = (k: keyof typeof RANGES, fallback: number) => {
    const v = r[k]
    return typeof v === 'number' && Number.isFinite(v) ? clamp(v, RANGES[k].min, RANGES[k].max) : fallback
  }
  return {
    sizeByDegree: bool('sizeByDegree', d.sizeByDegree),
    arrows: bool('arrows', d.arrows),
    hoverFocus: bool('hoverFocus', d.hoverFocus),
    textZoom: num('textZoom', d.textZoom),
    linkWidth: num('linkWidth', d.linkWidth),
    physics: bool('physics', d.physics),
    repel: num('repel', d.repel),
    linkDistance: num('linkDistance', d.linkDistance),
  }
}

const KEY = 'pc.network.display'

export function loadDisplay(): Display {
  try {
    const s = window.localStorage.getItem(KEY)
    return sanitizeDisplay(s ? JSON.parse(s) : null)
  } catch {
    return defaultDisplay()
  }
}

export function saveDisplay(d: Display): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    // Private windows and blocked storage: the page works without it.
  }
}

/** Cytoscape's min-zoomed-font-size for a text-fade setting (4 px to 16 px). */
export const minZoomedFont = (textZoom: number): number => Math.round(4 + clamp(textZoom, 0, 1) * 12)

const BASE = 38
const ROOT_BASE = 54

/**
 * Diameter of a concept's circle. With sizing on it grows with the log of its
 * drawn connections, so a class with 40 members is clearly bigger than a leaf
 * without one dwarfing the rest. The starting concept is never smaller than its
 * normal size.
 */
export function nodeSize(degree: number, isRoot: boolean, byDegree: boolean): number {
  if (!byDegree) return isRoot ? ROOT_BASE : BASE
  const s = clamp(26 + 9 * Math.log2(1 + Math.max(0, degree)), 26, 78)
  return isRoot ? Math.max(ROOT_BASE, s) : s
}

/** Number of drawn edges at each drawn concept. */
export function degrees(v: { nodes: { pcid: number }[]; edges: { subject: number; object: number }[] }): Map<number, number> {
  const out = new Map<number, number>()
  for (const n of v.nodes) out.set(n.pcid, 0)
  for (const e of v.edges) {
    out.set(e.subject, (out.get(e.subject) ?? 0) + 1)
    out.set(e.object, (out.get(e.object) ?? 0) + 1)
  }
  return out
}
