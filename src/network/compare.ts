/**
 * Compare two to four concepts: pure model, no React, no network.
 *
 * network_compare() (db/phase32b_network_compare.sql) turns each concept's edges inside out: for
 * every OTHER concept, which of the compared concepts connect to it. A set is one distinct group of
 * linking concepts ("all of them", "metformin and empagliflozin", "only empagliflozin"). Shared
 * means more than one concept links to the same other concept; it says nothing about whether the
 * two relationships mean the same thing, which is why each link keeps its own predicate and source.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GROUP_ORDER, isGroup, predicatePhrase } from './predicates'
import type { NetworkGroup } from './predicates'
import { parseNodeValue, parseEdgeValue } from './model'
import type { NetworkEdge, NetworkNode, Visible } from './model'

export const MIN_COMPARE = 2
export const MAX_COMPARE = 4

export type CompareLink = {
  /** The compared concept this link belongs to. */
  src: number
  /** Is the compared concept the subject of the recorded edge? */
  outgoing: boolean
  edge: NetworkEdge
}

export type CompareRow = {
  members: number[]
  group: NetworkGroup
  node: NetworkNode
  links: CompareLink[]
}

export type CompareSet = {
  members: number[]
  count: number
  groups: Partial<Record<NetworkGroup, number>>
}

export type ComparePayload = {
  pcids: number[]
  entities: NetworkNode[]
  /** Edges recorded directly between two of the compared concepts. */
  between: NetworkEdge[]
  sets: CompareSet[]
  rows: CompareRow[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const nums = (v: unknown): number[] => (Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : [])

/** Reads network_compare() defensively. Malformed rows are dropped, never rendered. */
export function parseCompare(raw: unknown): ComparePayload | null {
  if (!isRecord(raw)) return null
  const pcids = nums(raw.pcids)
  if (pcids.length < MIN_COMPARE) return null
  const entities = (Array.isArray(raw.entities) ? raw.entities : []).map(parseNodeValue).filter((n): n is NetworkNode => n !== null)
  const between = (Array.isArray(raw.between) ? raw.between : []).map(parseEdgeValue).filter((e): e is NetworkEdge => e !== null)
  const sets: CompareSet[] = []
  for (const s of Array.isArray(raw.sets) ? raw.sets : []) {
    if (!isRecord(s)) continue
    const members = nums(s.members)
    const count = typeof s.count === 'number' ? s.count : 0
    if (members.length === 0) continue
    const groups: Partial<Record<NetworkGroup, number>> = {}
    if (isRecord(s.groups)) for (const [k, v] of Object.entries(s.groups)) if (isGroup(k) && typeof v === 'number') groups[k] = v
    sets.push({ members, count, groups })
  }
  const rows: CompareRow[] = []
  for (const r of Array.isArray(raw.rows) ? raw.rows : []) {
    if (!isRecord(r)) continue
    const node = parseNodeValue(r.node)
    const members = nums(r.members)
    const group = typeof r.group === 'string' && isGroup(r.group) ? r.group : null
    if (!node || !group || members.length === 0) continue
    const links: CompareLink[] = []
    for (const l of Array.isArray(r.links) ? r.links : []) {
      if (!isRecord(l)) continue
      const edge = parseEdgeValue(l.edge)
      if (edge && typeof l.src === 'number') links.push({ src: l.src, outgoing: l.outgoing === true, edge })
    }
    if (links.length > 0) rows.push({ members, group, node, links })
  }
  return { pcids, entities, between, sets, rows }
}

export const setKey = (members: readonly number[]): string => [...members].sort((a, b) => a - b).join(',')

export type SetKind = 'all' | 'some' | 'only'

export function setKind(members: readonly number[], total: number): SetKind {
  return members.length === 1 ? 'only' : members.length >= total ? 'all' : 'some'
}

/** "In common", "Shared by A and B", "Only A": the heading a set gets. */
export function setTitle(members: readonly number[], entities: readonly NetworkNode[]): string {
  const names = members.map(p => entities.find(e => e.pcid === p)?.name ?? `PCID-${p}`)
  const kind = setKind(members, entities.length)
  if (kind === 'only') return `Only ${names[0]}`
  if (kind === 'all') return entities.length === 2 ? `In common: ${names[0]} and ${names[1]}` : 'In common to all'
  return `Shared by ${names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}`
}

/** Shared sets first (largest, then by the compared concepts' order), then each concept's own. */
export function orderSets(sets: readonly CompareSet[], pcids: readonly number[]): CompareSet[] {
  const first = (s: CompareSet) => Math.min(...s.members.map(m => pcids.indexOf(m)))
  return [...sets].sort((a, b) => b.members.length - a.members.length || first(a) - first(b) || setKey(a.members).localeCompare(setKey(b.members)))
}

/** The sentence one link states, from the compared concept's side: "metformin is a member of". */
export function linkPhrase(link: CompareLink, entities: readonly NetworkNode[]): string {
  const who = entities.find(e => e.pcid === link.src)?.name ?? `PCID-${link.src}`
  return `${who} ${predicatePhrase(link.edge.predicate, link.outgoing ? 'subject' : 'object')}`
}

export const groupRank = (g: NetworkGroup): number => GROUP_ORDER.indexOf(g)

/** Parses ?c= : 7- or 8-digit PCIDs (optionally "PCID-" prefixed), comma separated, no repeats, at most four. */
export function parseCompareParam(raw: string | null): number[] {
  if (!raw) return []
  const out: number[] = []
  for (const part of raw.split(',')) {
    const m = /^(?:PCID-)?(\d{7,8})$/i.exec(part.trim())
    if (m && !out.includes(Number(m[1]))) out.push(Number(m[1]))
    if (out.length === MAX_COMPARE) break
  }
  return out
}

/** Merges a page of rows into the ones already shown for the same sets, without repeats. */
export function mergeRows(have: readonly CompareRow[], more: readonly CompareRow[]): CompareRow[] {
  const seen = new Set(have.map(r => `${setKey(r.members)}|${r.node.pcid}`))
  const out = [...have]
  for (const r of more) {
    const k = `${setKey(r.members)}|${r.node.pcid}`
    if (!seen.has(k)) {
      seen.add(k)
      out.push(r)
    }
  }
  return out
}

/**
 * What the compare graph draws: the compared concepts, every concept loaded so far, and the lines
 * between them. Edge ids are the database's, so an edge never appears twice; a line whose far end
 * is not drawn is dropped rather than left dangling.
 */
export function compareGraph(entities: readonly NetworkNode[], rows: readonly CompareRow[], between: readonly NetworkEdge[]): Visible {
  const nodes = new Map<number, NetworkNode>()
  for (const e of entities) nodes.set(e.pcid, e)
  for (const r of rows) if (!nodes.has(r.node.pcid)) nodes.set(r.node.pcid, r.node)
  const edges = new Map<string, NetworkEdge>()
  for (const e of between) edges.set(e.id, e)
  for (const r of rows) for (const l of r.links) edges.set(l.edge.id, l.edge)
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()].filter(e => nodes.has(e.subject) && nodes.has(e.object)),
  }
}
