/**
 * Depth for the Network page's local graph, as in Obsidian: depth 1 is the
 * starting concept's own relationships, depth 2 adds the relationships of those
 * concepts, depth 3 one more step. Pure functions over GraphState, so the rules
 * are tested without a browser.
 *
 * A class can hold thousands of members, so depth is bounded: deeper levels
 * load a small page per concept, and the whole graph stops growing at NODE_CAP.
 * The page tells the reader when the cap was reached.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { collapse } from './model'
import type { GraphState } from './model'

export const MAX_DEPTH = 3
export const NODE_CAP = 150
/** Edges requested per concept when expanding to depth 2 and beyond. */
export const DEEP_PAGE = 8

/** Steps from the starting concept, following who introduced whom. Concepts with no path are left out. */
export function nodeDepths(state: GraphState): Map<number, number> {
  const out = new Map<number, number>()
  if (state.root === null) return out
  out.set(state.root, 0)
  let grew = true
  while (grew) {
    grew = false
    for (const [n, by] of state.introducedBy) {
      if (out.has(n) || by === null) continue
      const parent = out.get(by)
      if (parent !== undefined) {
        out.set(n, parent + 1)
        grew = true
      }
    }
  }
  return out
}

/** The deepest level currently drawn. */
export function currentDepth(state: GraphState): number {
  let max = 0
  for (const d of nodeDepths(state).values()) max = Math.max(max, d)
  return max
}

/**
 * Removes everything deeper than `depth`, and forgets that the concepts at that
 * depth were expanded so they can be expanded again.
 */
export function pruneToDepth(state: GraphState, depth: number): GraphState {
  const depths = nodeDepths(state)
  let next = state
  for (const [pcid, d] of depths) if (d === depth) next = collapse(next, pcid)
  return next
}

/**
 * Concepts at `level` that have not been expanded yet, in the order to expand
 * them: those reached by a use, safety, interaction or composition line come
 * before those reached by class membership, because a class is usually a hub
 * and the least specific thing to follow.
 */
export function frontierAt(state: GraphState, level: number): number[] {
  const depths = nodeDepths(state)
  const viaClassification = (pcid: number): boolean => {
    const parent = state.introducedBy.get(pcid)
    if (parent === null || parent === undefined) return false
    for (const e of state.edges.values()) {
      const joins = (e.subject === pcid && e.object === parent) || (e.object === pcid && e.subject === parent)
      if (joins && e.group !== 'classification') return false
    }
    return true
  }
  const out: number[] = []
  for (const [pcid, d] of depths) if (d === level && !state.expanded.has(pcid)) out.push(pcid)
  return out.sort((a, b) => {
    const ca = viaClassification(a) ? 1 : 0
    const cb = viaClassification(b) ? 1 : 0
    if (ca !== cb) return ca - cb
    const na = state.nodes.get(a)?.name ?? ''
    const nb = state.nodes.get(b)?.name ?? ''
    return na.localeCompare(nb, 'en', { sensitivity: 'base' }) || a - b
  })
}
