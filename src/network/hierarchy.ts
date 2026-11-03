/**
 * Classification hierarchy for one to four concepts (/network/hierarchy).
 *
 * class_members lists every ancestor of a class as an inherited membership, so a flat reading makes a
 * drug look like a member of five unrelated classes. The real structure is the tree in
 * drug_classes.parent_pcid. network_hierarchy() (db/phase33_network_hierarchy.sql) returns the classes
 * on the path from each concept's own classes up to the root, with the concepts beneath each one.
 * This file turns that into one tree per classification system and lays it out.
 *
 * A class is a "meeting point" when two or more of the concepts sit beneath it and no child class
 * holds the same set: the lowest clade they have in common in that system. Everything above it is
 * shared by definition, everything below it belongs to one concept.
 *
 * Pure functions, no DOM, so they are tested without a browser.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { parseNodeValue } from './model'
import type { NetworkNode } from './model'

/**
 * Badge and order per class_type. Mirrors SYSTEMS in src/classifications.ts, which is not imported
 * here because it pulls the Supabase SDK into the module graph.
 */
const SYSTEMS: { type: string; badge: string }[] = [
  { type: 'atc', badge: 'WHO ATC' },
  { type: 'va', badge: 'VA' },
  { type: 'epc', badge: 'FDA EPC' },
  { type: 'moa', badge: 'FDA MoA' },
  { type: 'pe', badge: 'FDA PE' },
  { type: 'chem', badge: 'FDA Chem' },
  { type: 'curated', badge: 'Pharmacy Commons' },
  { type: 'community', badge: 'Contributors' },
  { type: 'chemont', badge: 'ChemOnt' },
]
const systemBadge = (type: string | null): string => SYSTEMS.find(s => s.type === type)?.badge ?? 'Other'

export const MIN_HIERARCHY = 1
export const MAX_HIERARCHY = 4

export type HierarchyClass = {
  pcid: number
  slug: string
  name: string
  class_type: string
  parent: number | null
  /** PCIDs of the compared concepts that sit at or beneath this class, ascending. */
  members: number[]
  meeting: boolean
}

export type HierarchyPayload = {
  pcids: number[]
  entities: NetworkNode[]
  /** Where each concept sits: one of its own classes, or itself when it is a class. */
  anchors: { concept: number; class: number }[]
  nodes: HierarchyClass[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isSafeInteger(n) ? n : null
}
const numList = (v: unknown): number[] => (Array.isArray(v) ? v.map(num).filter((n): n is number => n !== null) : [])

/** Reads the RPC result defensively; null when it is not a hierarchy document. */
export function parseHierarchy(raw: unknown): HierarchyPayload | null {
  if (!isRecord(raw)) return null
  const pcids = numList(raw.pcids)
  if (pcids.length < MIN_HIERARCHY || pcids.length > MAX_HIERARCHY) return null
  const entities = (Array.isArray(raw.entities) ? raw.entities : []).map(parseNodeValue).filter((n): n is NetworkNode => n !== null)
  const anchors = (Array.isArray(raw.anchors) ? raw.anchors : []).flatMap(a => {
    if (!isRecord(a)) return []
    const concept = num(a.concept)
    const cls = num(a.class)
    return concept !== null && cls !== null ? [{ concept, class: cls }] : []
  })
  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : []).flatMap((n): HierarchyClass[] => {
    if (!isRecord(n)) return []
    const pcid = num(n.pcid)
    const slug = typeof n.slug === 'string' ? n.slug : ''
    const name = typeof n.name === 'string' ? n.name : ''
    if (pcid === null || !slug || !name) return []
    return [
      {
        pcid,
        slug,
        name,
        class_type: typeof n.class_type === 'string' && n.class_type ? n.class_type : 'other',
        parent: num(n.parent),
        members: numList(n.members),
        meeting: n.meeting === true,
      },
    ]
  })
  return { pcids, entities, anchors, nodes }
}

// ─── Trees ───────────────────────────────────────────────────────────────────

export type TreeNode = {
  /** 'class' for a class on a path, 'concept' for a compared drug or topic hanging under its class. */
  kind: 'class' | 'concept'
  pcid: number
  slug: string
  name: string
  entityType: string
  /** Compared concepts at or beneath this node. */
  members: number[]
  meeting: boolean
  /** A compared concept that is itself this class. */
  isConcept: boolean
  children: TreeNode[]
}

export type SystemTree = {
  system: string
  badge: string
  roots: TreeNode[]
  /** Classes where the concepts meet, deepest first. */
  meetings: HierarchyClass[]
  /** Number of classes in this tree. */
  classes: number
}

const SYSTEM_RANK = new Map(SYSTEMS.map((s, i) => [s.type, i]))
const rank = (t: string): number => SYSTEM_RANK.get(t) ?? SYSTEMS.length

/** Shared first (more concepts beneath), then alphabetical, so the common clade reads before the branches. */
function byShared(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) return a.kind === 'class' ? -1 : 1
  if (a.members.length !== b.members.length) return b.members.length - a.members.length
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
}

/** Depth of a class below its root, guarding against a cycle in bad data. */
export function classDepth(node: HierarchyClass, byPcid: ReadonlyMap<number, HierarchyClass>): number {
  let d = 0
  const seen = new Set<number>([node.pcid])
  let p = node.parent !== null ? byPcid.get(node.parent) : undefined
  while (p && !seen.has(p.pcid)) {
    d++
    seen.add(p.pcid)
    p = p.parent !== null ? byPcid.get(p.parent) : undefined
  }
  return d
}

/**
 * One tree per classification system. Systems where the concepts meet come first, in the site's usual
 * system order; the rest follow in the same order.
 */
export function buildSystemTrees(payload: HierarchyPayload): SystemTree[] {
  const byPcid = new Map(payload.nodes.map(n => [n.pcid, n]))
  const entityOf = new Map(payload.entities.map(e => [e.pcid, e]))
  const conceptSet = new Set(payload.pcids)
  const treeNodes = new Map<number, TreeNode>()
  for (const n of payload.nodes) {
    treeNodes.set(n.pcid, {
      kind: 'class',
      pcid: n.pcid,
      slug: n.slug,
      name: n.name,
      entityType: 'class',
      members: n.members,
      meeting: n.meeting,
      isConcept: conceptSet.has(n.pcid),
      children: [],
    })
  }

  // Concepts hang under their own classes. A concept that is itself a class stays where it is.
  const seenLeaf = new Set<string>()
  for (const a of payload.anchors) {
    if (a.concept === a.class) continue
    const parent = treeNodes.get(a.class)
    const e = entityOf.get(a.concept)
    const k = `${a.class}:${a.concept}`
    if (!parent || !e || seenLeaf.has(k)) continue
    seenLeaf.add(k)
    parent.children.push({
      kind: 'concept',
      pcid: e.pcid,
      slug: e.slug,
      name: e.name,
      entityType: e.entity_type,
      members: [e.pcid],
      meeting: false,
      isConcept: true,
      children: [],
    })
  }

  const rootsBySystem = new Map<string, TreeNode[]>()
  for (const n of payload.nodes) {
    const tn = treeNodes.get(n.pcid)
    if (!tn) continue
    const parent = n.parent !== null && n.parent !== n.pcid ? treeNodes.get(n.parent) : undefined
    if (parent) parent.children.push(tn)
    else {
      const list = rootsBySystem.get(n.class_type) ?? []
      list.push(tn)
      rootsBySystem.set(n.class_type, list)
    }
  }

  const sortDeep = (t: TreeNode): void => {
    t.children.sort(byShared)
    t.children.forEach(sortDeep)
  }

  const out: SystemTree[] = []
  for (const [system, roots] of rootsBySystem) {
    roots.sort(byShared)
    roots.forEach(sortDeep)
    const inSystem = payload.nodes.filter(n => n.class_type === system)
    const meetings = inSystem.filter(n => n.meeting).sort((a, b) => classDepth(b, byPcid) - classDepth(a, byPcid) || a.name.localeCompare(b.name))
    out.push({ system, badge: systemBadge(system), roots, meetings, classes: inSystem.length })
  }
  out.sort((a, b) => Number(b.meetings.length > 0) - Number(a.meetings.length > 0) || rank(a.system) - rank(b.system) || a.system.localeCompare(b.system))
  return out
}

/** The path from a root down to a class, as names: "A › B › C". */
export function pathTo(pcid: number, payload: HierarchyPayload): HierarchyClass[] {
  const byPcid = new Map(payload.nodes.map(n => [n.pcid, n]))
  const path: HierarchyClass[] = []
  const seen = new Set<number>()
  let cur = byPcid.get(pcid)
  while (cur && !seen.has(cur.pcid)) {
    path.unshift(cur)
    seen.add(cur.pcid)
    cur = cur.parent !== null ? byPcid.get(cur.parent) : undefined
  }
  return path
}

/** One sentence per system for readers who do not use the drawing. */
export function systemSummary(tree: SystemTree, payload: HierarchyPayload): string {
  const names = (ids: number[]): string => {
    const list = ids.map(id => payload.entities.find(e => e.pcid === id)?.name ?? 'a concept')
    return list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
  }
  if (payload.pcids.length === 1) {
    return `${tree.classes} ${tree.classes === 1 ? 'class' : 'classes'} in ${tree.badge}.`
  }
  if (tree.meetings.length === 0) {
    return `No class in ${tree.badge} holds more than one of them.`
  }
  return tree.meetings
    .map(m => `${names(m.members)}: lowest class in common is ${m.name}`)
    .join('; ')
    .concat('.')
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export type Placed = {
  node: TreeNode
  depth: number
  x: number
  y: number
  /** The label broken into lines of at most LABEL_CHARS characters (a longer single word keeps its own line). */
  lines: string[]
  /** Width the longest line needs, in px, from a character estimate. */
  labelWidth: number
  /** Right edge of this node's column (labels are left-aligned), where its connectors start. */
  right: number
}

export type LayoutEdge = { from: Placed; to: Placed }

export type TreeLayout = { placed: Placed[]; edges: LayoutEdge[]; width: number; height: number }

export type LayoutOptions = {
  rowHeight?: number
  lineHeight?: number
  indent?: number
  charWidth?: number
  padding?: number
  dot?: number
}

/** Longest line of a label before it wraps. Keeps columns narrow so a deep ATC or ChemOnt tree fits a page. */
export const LABEL_CHARS = 26

/** Greedy word wrap. A word longer than the limit stays whole on its own line. */
export function wrapLabel(text: string, max: number = LABEL_CHARS): string[] {
  const lines: string[] = []
  let cur = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (cur && cur.length + 1 + word.length > max) {
      lines.push(cur)
      cur = word
    } else cur = cur ? `${cur} ${word}` : word
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

/** Rough label width. Exact metrics need a browser; this errs wide so labels do not run into a neighbor. */
export const labelPx = (text: string, charWidth: number): number => Math.ceil(text.length * charWidth)

/**
 * Left-to-right tree: the root at the left, one row per leaf, each parent centred on its children.
 * Columns are as wide as the longest label at that depth, so long ATC names do not push short ones apart.
 */
export function layoutTree(roots: readonly TreeNode[], opts: LayoutOptions = {}): TreeLayout {
  const rowHeight = opts.rowHeight ?? 26
  const lineHeight = opts.lineHeight ?? 15
  const gap = opts.indent ?? 22
  const cw = opts.charWidth ?? 6
  const pad = opts.padding ?? 12
  const dot = opts.dot ?? 5

  const placed: Placed[] = []
  const edges: LayoutEdge[] = []
  const widthAt: number[] = []
  let nextY = pad

  const visit = (node: TreeNode, depth: number, seen: Set<number>, need: number): Placed => {
    const lines = wrapLabel(node.name)
    const p: Placed = { node, depth, x: 0, y: 0, lines, labelWidth: labelPx(lines.reduce((a, l) => (l.length > a.length ? l : a), ''), cw), right: 0 }
    placed.push(p)
    widthAt[depth] = Math.max(widthAt[depth] ?? 0, p.labelWidth)
    const kids = node.kind === 'class' ? node.children.filter(c => c.kind === 'concept' || !seen.has(c.pcid)) : []
    if (kids.length === 0) {
      // A leaf row is as tall as the tallest label on its path to the root: a parent is centred on its
      // children, so a wrapped parent label needs that much room beside them too.
      const h = Math.max(rowHeight, need, lines.length * lineHeight + 10)
      p.y = nextY + h / 2
      nextY += h
      return p
    }
    const next = new Set(seen).add(node.pcid)
    const here = Math.max(need, lines.length * lineHeight + 10)
    const placedKids = kids.map(k => visit(k, depth + 1, next, here))
    p.y = (placedKids[0].y + placedKids[placedKids.length - 1].y) / 2
    for (const k of placedKids) edges.push({ from: p, to: k })
    return p
  }
  for (const r of roots) visit(r, 0, new Set(), 0)

  // x of a column = padding + the labels of every column to its left, plus a gap each.
  const xAt: number[] = []
  let x = pad + dot
  for (let d = 0; d < widthAt.length; d++) {
    xAt[d] = x
    x += dot * 2 + 6 + (widthAt[d] ?? 0) + gap
  }
  for (const p of placed) {
    p.x = xAt[p.depth]
    p.right = p.x + dot + 6 + (widthAt[p.depth] ?? 0)
  }
  const width = Math.max(x - gap + pad, pad * 2)
  const height = Math.max(nextY + pad, pad * 2)
  return { placed, edges, width, height }
}
