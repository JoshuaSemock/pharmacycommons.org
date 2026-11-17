import { describe, expect, it, vi } from 'vitest'
import { computedAnswer, isComputed } from './staticComputed'
import type { SearchIndexFile } from './staticSearch'

describe('isComputed', () => {
  it('claims only the search and Network requests', () => {
    expect(isComputed('POST', '/rest/v1/rpc/search_all')).toBe(true)
    expect(isComputed('POST', '/rest/v1/rpc/network_neighborhood')).toBe(true)
    expect(isComputed('POST', '/rest/v1/rpc/network_edge_evidence')).toBe(true)
    expect(isComputed('POST', '/rest/v1/rpc/get_list')).toBe(false)
    expect(isComputed('GET', '/rest/v1/rpc/search_all')).toBe(false)
    expect(isComputed('GET', '/rest/v1/entities?select=pcid%2Cslug%2Cname%2Centity_type&pcid=in.%281001923%2C1002962%29')).toBe(true)
    expect(isComputed('GET', '/rest/v1/entities?select=pcid,slug,name,entity_type&pcid=in.(1001923)')).toBe(true)
    expect(isComputed('GET', '/rest/v1/entities?select=*&slug=eq.metformin')).toBe(false)
  })
})

describe('computedAnswer', () => {
  it('answers search_all from the search index file', async () => {
    const file: SearchIndexFile = { v: 1, types: ['moiety'], srcs: ['name', 'brand', 'alias', 'code'],
      groups: [[1001923, 0, 'metformin', 'metformin', 1, [[0, 'metformin']]]] }
    const realFetch = vi.fn(async () => new Response(JSON.stringify(file), { headers: { 'content-type': 'application/json' } }))
    const res = await computedAnswer('POST', '/rest/v1/rpc/search_all', JSON.stringify({ p_q: 'metfromin', p_limit: 6 }), realFetch)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ fuzzy: true, did_you_mean: 'metformin' })
    expect(realFetch).toHaveBeenCalledWith('/data/search-index.json')
  })

  it('reports a missing data file as 503 rather than throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const realFetch = vi.fn(async () => new Response('nope', { status: 404 }))
    const res = await computedAnswer('POST', '/rest/v1/rpc/network_neighborhood', JSON.stringify({ p_pcid: 1 }), realFetch)
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'static_unavailable' })
  })
})
