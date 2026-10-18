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
import { parsePayload } from './model'
import type { NetworkPayload } from './model'
import type { NetworkGroup } from './predicates'

export const PAGE_SIZE = 40
export const MAX_PAGE_SIZE = 200

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
  return hits.slice(0, limit + 3)
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
