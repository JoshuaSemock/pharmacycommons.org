import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('../db', () => ({ getSupabase: async () => ({ rpc: (...a: unknown[]) => ({ ...rpcResult(...a), abortSignal: () => rpcResult(...a) }) }) }))
vi.mock('../catalog', () => ({ loadCatalog: async () => [], searchCatalog: () => [] }))
vi.mock('../classifications', () => ({ loadAllClasses: async () => [], searchClasses: () => [] }))

function rpcResult(...args: unknown[]) {
  const p = Promise.resolve(rpc(...args))
  return { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) }
}

const { NetworkUnavailable, fetchEvidence, fetchNeighborhood } = await import('./api')

beforeEach(() => rpc.mockReset())

describe('fetchNeighborhood', () => {
  it('rejects a PCID that is not a positive integer without calling the database', async () => {
    for (const bad of [0, -3, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      await expect(fetchNeighborhood(bad)).rejects.toBeInstanceOf(NetworkUnavailable)
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('clamps the page size and sends validated arguments', async () => {
    rpc.mockReturnValue({ data: { center: null, nodes: [], edges: [] }, error: null })
    await fetchNeighborhood(1001923, { limit: 99999, offset: -5, groups: ['safety'] })
    expect(rpc).toHaveBeenCalledWith('network_neighborhood', {
      p_pcid: 1001923,
      p_groups: ['safety'],
      p_include_community: false,
      p_limit: 200,
      p_offset: 0,
    })
  })

  it('reports a missing function as "not deployed", other failures as transient', async () => {
    rpc.mockReturnValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    await expect(fetchNeighborhood(1001923)).rejects.toMatchObject({ notDeployed: true })
    rpc.mockReturnValue({ data: null, error: { code: '57014', message: 'timeout: secret internals' } })
    const err = await fetchNeighborhood(1001923).catch(e => e)
    expect(err).toBeInstanceOf(NetworkUnavailable)
    expect(err.notDeployed).toBe(false)
    expect(err.message).not.toMatch(/secret|timeout/)
  })

  it('parses a result through the defensive reader', async () => {
    rpc.mockReturnValue({
      data: { center: { pcid: 1, slug: 'a', name: 'A', entity_type: 'moiety' }, nodes: [{ nope: 1 }], edges: [{ bad: true }], total: 0 },
      error: null,
    })
    const p = await fetchNeighborhood(1)
    expect(p.center?.name).toBe('A')
    expect(p.nodes).toEqual([])
    expect(p.edges).toEqual([])
  })
})

describe('fetchEvidence', () => {
  it('returns null for an unknown edge, an error, or a malformed answer', async () => {
    rpc.mockReturnValue({ data: null, error: null })
    expect(await fetchEvidence('cs:1')).toBeNull()
    rpc.mockReturnValue({ data: null, error: { message: 'boom' } })
    expect(await fetchEvidence('cs:1')).toBeNull()
    rpc.mockReturnValue({ data: ['x'], error: null })
    expect(await fetchEvidence('cs:1')).toBeNull()
    rpc.mockReturnValue({ data: { no_kind: true }, error: null })
    expect(await fetchEvidence('cs:1')).toBeNull()
  })

  it('returns the record when it has a kind', async () => {
    rpc.mockReturnValue({ data: { kind: 'clinical_statement', evidence_level: 'curator_assertion' }, error: null })
    expect(await fetchEvidence('cs:1')).toMatchObject({ kind: 'clinical_statement' })
  })
})
