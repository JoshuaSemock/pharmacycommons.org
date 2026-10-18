/**
 * The Network page's data model: pure functions, no React, no Cytoscape, no
 * network. The page keeps one GraphState; every user action (search, expand,
 * collapse, filter) is a function from state to state, which is what makes the
 * duplicate-edge, collapse and filter rules testable.
 *
 * Shapes mirror what network_neighborhood() returns (db/phase19_network.sql).
 * Node ids are PCIDs and edge ids are the database's own ("cs:12", "cm:5:7"),
 * so the same record never appears twice however many neighborhoods overlap.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GROUP_ORDER, isGroup, nodeKind, predicatePhrase } from './predicates'
import type { NetworkGroup } from './predicates'

export type NetworkNode = {
  pcid: number
  slug: string
  name: string
  entity_type: string
  class_type: string | null
}

export type NetworkEdge = {
  id: string
  subject: number
  predicate: string
  object: number
  group: NetworkGroup
  evidence_level: string | null
  source_agency: string | null
  source_doc_id: string | null
  /** Class membership: true when the record is a direct member, not inherited. */
  direct: boolean
  /** Written by a contributor (community_statements), not ingested. */
  community: boolean
  basis: string | null
}

export type NetworkPayload = {
  center: NetworkNode | null
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  group_counts: Partial<Record<NetworkGroup, number>>
  total: number
  offset: number
  limit: number
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function parseNode(v: unknown): NetworkNode | null {
  if (!isRecord(v)) return null
  const pcid = num(v.pcid)
  const slug = str(v.slug)
  const name = str(v.name)
  if (pcid === null || !slug || !name) return null
  return { pcid, slug, name, entity_type: str(v.entity_type) ?? '', class_type: str(v.class_type) }
}

function parseEdge(v: unknown): NetworkEdge | null {
  if (!isRecord(v)) return null
  const id = str(v.id)
  const subject = num(v.subject)
  const object = num(v.object)
  const predicate = str(v.predicate)
  const group = str(v.group)
  if (!id || subject === null || object === null || !predicate || !group || !isGroup(group)) return null
  return {
    id,
    subject,
    object,
    predicate,
    group,
    evidence_level: str(v.evidence_level),
    source_agency: str(v.source_agency),
    source_doc_id: str(v.source_doc_id),
    direct: v.direct !== false,
    community: v.community === true,
    basis: str(v.basis),
  }
}

/** Reads an RPC result defensively. Anything malformed is dropped, never rendered. */
export function parsePayload(raw: unknown): NetworkPayload {
  const r = isRecord(raw) ? raw : {}
  const nodes = (Array.isArray(r.nodes) ? r.nodes : []).map(parseNode).filter((n): n is NetworkNode => n !== null)
  const edges = (Array.isArray(r.edges) ? r.edges : []).map(parseEdge).filter((e): e is NetworkEdge => e !== null)
  const counts: Partial<Record<NetworkGroup, number>> = {}
  if (isRecord(r.group_counts)) {
    for (const [k, v] of Object.entries(r.group_counts)) {
      const n = num(v)
      if (isGroup(k) && n !== null) counts[k] = n
    }
  }
  return {
    center: parseNode(r.center),
    nodes,
    edges,
    group_counts: counts,
    total: num(r.total) ?? edges.length,
    offset: num(r.offset) ?? 0,
    limit: num(r.limit) ?? edges.length,
  }
}

// ─── State ───────────────────────────────────────────────────────────────────

export type ExpandInfo = {
  /** Edges loaded so far for this node, across pages. */
  shown: number
  /** Edges the node has in the groups requested. */
  total: number
  /** Edge counts per group over everything, for the filter list. */
  groupCounts: Partial<Record<NetworkGroup, number>>
}

export type GraphState = {
  root: number | null
  nodes: ReadonlyMap<number, NetworkNode>
  edges: ReadonlyMap<string, NetworkEdge>
  /** Who brought each node in, so collapsing a node can take its branch away. */
  introducedBy: ReadonlyMap<number, number | null>
  expanded: ReadonlyMap<number, ExpandInfo>
}

export const emptyGraph = (): GraphState => ({
  root: null,
  nodes: new Map(),
  edges: new Map(),
  introducedBy: new Map(),
  expanded: new Map(),
})

/**
 * Adds one neighborhood. `from` is the node that was expanded (the first
 * call, for the root, passes the same PCID). Existing nodes and edges are
 * kept exactly as they were, so positions and selection survive; an edge
 * whose end is unknown is dropped rather than drawn dangling.
 */
export function mergePayload(state: GraphState, payload: NetworkPayload, from: number, asRoot = false): GraphState {
  const nodes = new Map(state.nodes)
  const edges = new Map(state.edges)
  const introducedBy = new Map(state.introducedBy)
  const expanded = new Map(state.expanded)

  for (const n of payload.nodes) {
    if (!nodes.has(n.pcid)) {
      nodes.set(n.pcid, n)
      introducedBy.set(n.pcid, n.pcid === from ? null : from)
    }
  }
  if (payload.center && !nodes.has(payload.center.pcid)) {
    nodes.set(payload.center.pcid, payload.center)
    introducedBy.set(payload.center.pcid, null)
  }
  for (const e of payload.edges) {
    if (edges.has(e.id)) continue
    if (!nodes.has(e.subject) || !nodes.has(e.object)) continue
    edges.set(e.id, e)
  }

  const prev = expanded.get(from)
  expanded.set(from, {
    shown: Math.max(prev?.shown ?? 0, payload.offset + payload.edges.length),
    total: payload.total,
    groupCounts: payload.group_counts,
  })

  return { root: asRoot ? from : state.root, nodes, edges, introducedBy, expanded }
}

/** Every node that was brought in, directly or not, by `pcid`. */
export function branchOf(state: GraphState, pcid: number): Set<number> {
  const out = new Set<number>()
  let grew = true
  while (grew) {
    grew = false
    for (const [n, by] of state.introducedBy) {
      if (n === state.root || out.has(n) || by === null) continue
      if (by === pcid || out.has(by)) {
        out.add(n)
        grew = true
      }
    }
  }
  return out
}

/** Removes the neighbors `pcid` brought in (and theirs). The node itself and the root stay. */
export function collapse(state: GraphState, pcid: number): GraphState {
  const gone = branchOf(state, pcid)
  if (gone.size === 0) {
    const expanded = new Map(state.expanded)
    expanded.delete(pcid)
    return { ...state, expanded }
  }
  const nodes = new Map(state.nodes)
  const introducedBy = new Map(state.introducedBy)
  const expanded = new Map(state.expanded)
  for (const n of gone) {
    nodes.delete(n)
    introducedBy.delete(n)
    expanded.delete(n)
  }
  expanded.delete(pcid)
  const edges = new Map<string, NetworkEdge>()
  for (const [id, e] of state.edges) if (!gone.has(e.subject) && !gone.has(e.object)) edges.set(id, e)
  return { ...state, nodes, edges, introducedBy, expanded }
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export type Filters = {
  groups: ReadonlySet<NetworkGroup>
  /** entity_type values to hide. */
  hiddenKinds: ReadonlySet<string>
  /** Classification systems to hide (class_type: 'chemont', 'atc', ...). */
  hiddenClassTypes: ReadonlySet<string>
  includeCommunity: boolean
}

export const defaultFilters = (): Filters => ({
  groups: new Set(GROUP_ORDER),
  hiddenKinds: new Set(),
  hiddenClassTypes: new Set(),
  includeCommunity: false,
})

export type Visible = { nodes: NetworkNode[]; edges: NetworkEdge[] }

/**
 * What is drawn. Nothing here deletes state: a hidden group or kind comes back
 * unchanged when the filter is cleared. The root is always shown, and a node
 * left with no visible edge (its only edges were filtered) is hidden with them.
 */
export function visibleGraph(state: GraphState, filters: Filters): Visible {
  const kindShown = (pcid: number) => {
    const n = state.nodes.get(pcid)
    if (!n) return false
    if (pcid === state.root) return true
    if (filters.hiddenKinds.has(n.entity_type)) return false
    return !(n.class_type && filters.hiddenClassTypes.has(n.class_type))
  }
  const edges: NetworkEdge[] = []
  for (const e of state.edges.values()) {
    if (!filters.groups.has(e.group)) continue
    if (e.community && !filters.includeCommunity) continue
    if (!kindShown(e.subject) || !kindShown(e.object)) continue
    edges.push(e)
  }
  const touched = new Set<number>()
  for (const e of edges) {
    touched.add(e.subject)
    touched.add(e.object)
  }
  const nodes: NetworkNode[] = []
  for (const n of state.nodes.values()) {
    if (n.pcid === state.root || touched.has(n.pcid)) nodes.push(n)
  }
  return { nodes, edges }
}

/** Classification systems among the class nodes drawn so far, for the system filter. */
export function classTypesPresent(state: GraphState): string[] {
  const seen = new Set<string>()
  for (const n of state.nodes.values()) if (n.entity_type === 'class' && n.class_type) seen.add(n.class_type)
  return [...seen].sort()
}

/** Distinct entity types present in the graph, for the node-type filter. */
export function kindsPresent(state: GraphState): string[] {
  const seen = new Set<string>()
  for (const n of state.nodes.values()) seen.add(n.entity_type)
  return [...seen].sort((a, b) => nodeKind(a).label.localeCompare(nodeKind(b).label))
}

// ─── Text alternative ────────────────────────────────────────────────────────

export type RelationRow = {
  edge: NetworkEdge
  other: NetworkNode
  /** Is `pcid` the subject ("out") or the object ("in") of the recorded edge? */
  direction: 'out' | 'in'
  phrase: string
}

/**
 * Every edge touching `pcid` as readable rows. This is the accessible version of
 * the graph (the page shows it as a table beside the canvas), so it takes the
 * same filters and covers exactly what is drawn.
 */
export function relationsOf(state: GraphState, pcid: number, filters: Filters): RelationRow[] {
  const { edges } = visibleGraph(state, filters)
  const rows: RelationRow[] = []
  for (const edge of edges) {
    if (edge.subject !== pcid && edge.object !== pcid) continue
    const direction = edge.subject === pcid ? 'out' : 'in'
    const other = state.nodes.get(direction === 'out' ? edge.object : edge.subject)
    if (!other) continue
    rows.push({ edge, other, direction, phrase: predicatePhrase(edge.predicate, direction === 'out' ? 'subject' : 'object') })
  }
  const rank = (g: NetworkGroup) => GROUP_ORDER.indexOf(g)
  return rows.sort(
    (a, b) =>
      rank(a.edge.group) - rank(b.edge.group) ||
      Number(b.edge.direct) - Number(a.edge.direct) ||
      a.other.name.localeCompare(b.other.name, 'en', { sensitivity: 'base' }),
  )
}

/** Does this node have edges the page has not loaded yet? */
export function hasMore(state: GraphState, pcid: number): number {
  const info = state.expanded.get(pcid)
  return info ? Math.max(0, info.total - info.shown) : 0
}
