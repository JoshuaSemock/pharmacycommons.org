/**
 * Requests the static edition answers by computing, not from recordings
 * (docs/static-export.md, "Live queries without a database"). Their answers depend on
 * what the visitor types or picks, so they can't be recorded in advance:
 *
 *   POST /rest/v1/rpc/search_all              typo-tolerant search   → src/staticSearch.ts
 *   POST /rest/v1/rpc/network_neighborhood    \
 *   POST /rest/v1/rpc/network_relations        |
 *   POST /rest/v1/rpc/network_compare          |  Network pages       → src/staticNetwork.ts
 *   POST /rest/v1/rpc/network_hierarchy        |  over network.sqlite
 *   POST /rest/v1/rpc/network_edge_evidence   /
 *   GET  /rest/v1/entities?select=pcid,slug,name,entity_type&pcid=in.(…)   (concept chips)
 *
 * Anything else returns null and goes on to the recorded answers in src/staticData.ts.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Destination: src/staticComputed.ts
 */

import type { Db } from './staticNetwork'

const RPC = /^\/rest\/v1\/rpc\/([a-z_]+)(?:\?.*)?$/
const NETWORK = new Set(['network_neighborhood', 'network_relations', 'network_compare', 'network_hierarchy', 'network_edge_evidence'])
const CHIPS = /^\/rest\/v1\/entities\?select=pcid(?:%2C|,)slug(?:%2C|,)name(?:%2C|,)entity_type&pcid=in\.(?:%28|\()([0-9%2C,]+)(?:%29|\))$/

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}

function failed(err: unknown): Response {
  console.warn('[static] computed answer failed:', err)
  return json({ code: 'static_unavailable', message: 'This part of the static edition could not load.' }, 503)
}

/** True when `path` (after /supabase) is computed here, so no recorded answer is looked up. */
export function isComputed(method: string, path: string): boolean {
  if (method === 'POST') {
    const m = path.match(RPC)
    return !!m && (m[1] === 'search_all' || NETWORK.has(m[1]))
  }
  return method === 'GET' && CHIPS.test(path)
}

async function networkDb(realFetch: typeof fetch): Promise<Db> {
  const { openStaticDb } = await import('./staticDb')
  return openStaticDb('network', realFetch)
}

export async function computedAnswer(method: string, path: string, body: string, realFetch: typeof fetch): Promise<Response> {
  try {
    const chips = method === 'GET' ? path.match(CHIPS) : null
    if (chips) {
      const ids = decodeURIComponent(chips[1]).split(',').map(Number).filter(n => Number.isSafeInteger(n) && n > 0)
      const [db, { nodeRows }] = await Promise.all([networkDb(realFetch), import('./staticNetwork')])
      const rows = [...nodeRows(db, ids).values()].map(({ pcid, slug, name, entity_type }) => ({ pcid, slug, name, entity_type }))
      return json(rows)
    }
    const fn = path.match(RPC)?.[1] ?? ''
    const args = (body ? JSON.parse(body) : {}) as Record<string, unknown>
    if (fn === 'search_all') {
      const { loadSearchIndex, searchAllLocal } = await import('./staticSearch')
      const index = await loadSearchIndex(realFetch)
      const types = Array.isArray(args.p_types) ? (args.p_types as string[]) : null
      return json(searchAllLocal(index, String(args.p_q ?? ''), Number(args.p_limit ?? 20), types))
    }
    const [db, net] = await Promise.all([networkDb(realFetch), import('./staticNetwork')])
    switch (fn) {
      case 'network_neighborhood':
        return json(net.networkNeighborhood(db, args as unknown as Parameters<typeof net.networkNeighborhood>[1]))
      case 'network_relations':
        return json(net.networkRelations(db, args as unknown as Parameters<typeof net.networkRelations>[1]))
      case 'network_compare':
        return json(net.networkCompare(db, args as unknown as Parameters<typeof net.networkCompare>[1]))
      case 'network_hierarchy':
        return json(net.networkHierarchy(db, args as unknown as Parameters<typeof net.networkHierarchy>[1]))
      case 'network_edge_evidence':
        return json(net.networkEdgeEvidence(db, args as unknown as Parameters<typeof net.networkEdgeEvidence>[1]))
    }
    return json({ code: 'static_miss', message: 'Not available in the static edition of Pharmacy Commons.' }, 404)
  } catch (err) {
    return failed(err)
  }
}
