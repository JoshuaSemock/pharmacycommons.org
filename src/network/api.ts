/**
 * Network page data access: the two read-only RPCs from db/phase19_network.sql
 * plus concept search. Everything goes through the public (publishable-key)
 * client, so Row Level Security applies exactly as it does for any visitor.
 * Loaded through getSupabase() so the SDK stays out of the first-load bundle.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getSupabase } from '../db'
import { loadCatalog, searchCatalog } from '../catalog'
import { loadAllClasses, searchClasses } from '../classifications'
import { parseNodeValue, parsePayload, parseRelations } from './model'
import type { NetworkNode, NetworkPayload, RelationsPage } from './model'
import { MAX_COMPARE, MIN_COMPARE, parseCompare } from './compare'
import type { ComparePayload } from './compare'
import type { NetworkGroup } from './predicates'

export const PAGE_SIZE = 40
export const MAX_PAGE_SIZE = 200
export const RELATIONS_PAGE = 25

export class NetworkUnavailable extends Error {
  /** True when the RPC does not exist yet (migration 19 not applied), as opposed to a transient failure. */
  readonly notDeployed: boolean
  constructor(message: string, notDeployed: boolean) {
    super(message)
    this.notDeployed = notDeployed
  }
}

export type NeighborhoodOptions = {
  groups?: NetworkGroup[]
  includeCommunity?: boolean
  limit?: number
  offset?: number
  signal?: AbortSignal
}

export async function fetchNeighborhood(pcid: number, opts: NeighborhoodOptions = {}): Promise<NetworkPayload> {
  if (!Number.isSafeInteger(pcid) || pcid <= 0) throw new NetworkUnavailable('Not a valid PCID.', false)
  const supabase = await getSupabase()
  const limit = Math.min(Math.max(opts.limit ?? PAGE_SIZE, 1), MAX_PAGE_SIZE)
  let q = supabase.rpc('network_neighborhood', {
    p_pcid: pcid,
    p_groups: opts.groups && opts.groups.length ? opts.groups : null,
    p_include_community: opts.includeCommunity ?? false,
    p_limit: limit,
    p_offset: Math.max(opts.offset ?? 0, 0),
  })
  if (opts.signal) q = q.abortSignal(opts.signal)
  const { data, error } = await q
  if (error) {
    // PostgREST reports a missing function as PGRST202 / 42883; keep details out of the UI.
    const missing = error.code === 'PGRST202' || error.code === '42883'
    throw new NetworkUnavailable(missing ? 'The network service is not available yet.' : 'The network could not be loaded.', missing)
  }
  return parsePayload(data)
}

export type RelationsOptions = {
  groups?: NetworkGroup[]
  query?: string
  includeCommunity?: boolean
  limit?: number
  offset?: number
  signal?: AbortSignal
}

/** One page of a concept's relations, alphabetical by the other concept's name, for the hub browser. */
export async function fetchRelations(pcid: number, opts: RelationsOptions = {}): Promise<RelationsPage> {
  if (!Number.isSafeInteger(pcid) || pcid <= 0) throw new NetworkUnavailable('Not a valid PCID.', false)
  const supabase = await getSupabase()
  const limit = Math.min(Math.max(opts.limit ?? RELATIONS_PAGE, 1), MAX_PAGE_SIZE)
  let q = supabase.rpc('network_relations', {
    p_pcid: pcid,
    p_groups: opts.groups && opts.groups.length ? opts.groups : null,
    p_include_community: opts.includeCommunity ?? false,
    p_query: opts.query?.trim() ? opts.query.trim() : null,
    p_limit: limit,
    p_offset: Math.max(opts.offset ?? 0, 0),
  })
  if (opts.signal) q = q.abortSignal(opts.signal)
  const { data, error } = await q
  if (error) {
    const missing = error.code === 'PGRST202' || error.code === '42883'
    throw new NetworkUnavailable(missing ? 'The network service is not available yet.' : 'The relationships could not be loaded.', missing)
  }
  return parseRelations(data)
}

export type CompareOptions = {
  includeCommunity?: boolean
  /** One set's sorted PCIDs: page through just that set. Without it, the first rows of every set. */
  members?: number[]
  limit?: number
  offset?: number
  signal?: AbortSignal
}

export const COMPARE_PAGE = 30

/** Two to four concepts side by side: what they share and what only one of them has. */
export async function fetchCompare(pcids: number[], opts: CompareOptions = {}): Promise<ComparePayload> {
  const ids = [...new Set(pcids)]
  if (ids.length < MIN_COMPARE || ids.length > MAX_COMPARE || ids.some(p => !Number.isSafeInteger(p) || p <= 0)) {
    throw new NetworkUnavailable(`Compare ${MIN_COMPARE} to ${MAX_COMPARE} concepts.`, false)
  }
  const supabase = await getSupabase()
  let q = supabase.rpc('network_compare', {
    p_pcids: ids,
    p_include_community: opts.includeCommunity ?? false,
    p_members: opts.members && opts.members.length ? opts.members : null,
    p_limit: Math.min(Math.max(opts.limit ?? COMPARE_PAGE, 1), MAX_PAGE_SIZE),
    p_offset: Math.max(opts.offset ?? 0, 0),
  })
  if (opts.signal) q = q.abortSignal(opts.signal)
  const { data, error } = await q
  if (error) {
    const missing = error.code === 'PGRST202' || error.code === '42883'
    throw new NetworkUnavailable(missing ? 'The network service is not available yet.' : 'The comparison could not be loaded.', missing)
  }
  const parsed = parseCompare(data)
  if (!parsed) throw new NetworkUnavailable('The comparison could not be read.', false)
  return parsed
}

/** Names for PCIDs, in the order given, so the picker can show chips before (or without) a comparison. */
export async function fetchConcepts(pcids: number[], signal?: AbortSignal): Promise<NetworkNode[]> {
  if (pcids.length === 0) return []
  const supabase = await getSupabase()
  let q = supabase.from('entities').select('pcid, slug, name, entity_type').in('pcid', pcids)
  if (signal) q = q.abortSignal(signal)
  const { data, error } = await q
  if (error || !Array.isArray(data)) return []
  const found = data.map(parseNodeValue).filter((n): n is NetworkNode => n !== null)
  return pcids.map(p => found.find(n => n.pcid === p)).filter((n): n is NetworkNode => n !== undefined)
}

export type EvidenceRecord = Record<string, unknown> & { kind: string }

export async function fetchEvidence(edgeId: string, signal?: AbortSignal): Promise<EvidenceRecord | null> {
  const supabase = await getSupabase()
  let q = supabase.rpc('network_edge_evidence', { p_edge_id: edgeId })
  if (signal) q = q.abortSignal(signal)
  const { data, error } = await q
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null
  const rec = data as Record<string, unknown>
  return typeof rec.kind === 'string' ? (rec as EvidenceRecord) : null
}

// ─── Search ──────────────────────────────────────────────────────────────────

export type SearchHit = {
  key: string
  name: string
  hint: string
  /** Known for catalog records; classes are resolved from their slug on pick. */
  pcid: number | null
  slug: string
}

/** Drugs, brands and topic pages from the catalog, then classifications. Ambiguity is shown, never resolved silently. */
export async function searchConcepts(query: string, limit = 10): Promise<SearchHit[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const [, classes] = await Promise.all([loadCatalog(), loadAllClasses().catch(() => [])])
  const hits: SearchHit[] = searchCatalog(q, limit).map(e => ({
    key: `p${e.n}`,
    name: e.name,
    hint: e.matchedBrand ? `Brand: ${e.matchedBrand}` : e.kind ?? ENTRY_KIND[e.type],
    pcid: e.n,
    slug: e.slug,
  }))
  for (const c of searchClasses(classes, q).slice(0, Math.max(3, Math.floor(limit / 2)))) {
    hits.push({ key: `c${c.slug}`, name: c.name, hint: `${c.class_type_label} class · ${c.member_count} members`, pcid: null, slug: c.slug })
  }
  // Published lists are start points too: a list opens as a graph of its entries.
  const needle = q.toLowerCase()
  const lists = await import('../api').then(m => m.listLists()).catch(() => [])
  for (const l of lists.filter(l => l.title.toLowerCase().includes(needle)).slice(0, 3)) {
    hits.push({ key: `l${l.slug}`, name: l.title, hint: `List · ${l.item_count} entries`, pcid: l.pcid, slug: l.slug })
  }
  return hits.slice(0, limit + 6)
}

const ENTRY_KIND = ['Drug', 'Combination product', 'Salt or ester', 'Brand product', 'Topic'] as const

/** PCID for a slug (classes come from search without one). */
export async function resolveSlug(slug: string): Promise<number | null> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.from('entities').select('pcid').eq('slug', slug).maybeSingle()
  if (error || !data) return null
  const pcid = (data as { pcid: unknown }).pcid
  return typeof pcid === 'number' ? pcid : null
}
