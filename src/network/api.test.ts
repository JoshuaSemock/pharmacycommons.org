import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('../db', () => ({ getSupabase: async () => ({ rpc: (...a: unknown[]) => ({ ...rpcResult(...a), abortSignal: () => rpcResult(...a) }) }) }))
vi.mock('../catalog', () => ({ loadCatalog: async () => [], searchCatalog: () => [] }))
vi.mock('../classifications', () => ({ loadAllClasses: async () => [], searchClasses: () => [] }))
const listLists = vi.fn()
vi.mock('../api', () => ({ listLists: () => listLists() }))

function rpcResult(...args: unknown[]) {
  const p = Promise.resolve(rpc(...args))
  return { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) }
}

const { NetworkUnavailable, fetchEvidence, fetchNeighborhood, fetchRelations, searchConcepts } = await import('./api')

beforeEach(() => {
  rpc.mockReset()
  listLists.mockReset()
})

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

describe('searchConcepts with lists', () => {
  it('offers a matching published list as a start point, with its PCID', async () => {
    listLists.mockResolvedValue([
      { pcid: 10000034, slug: 'anticholinergic-burden', title: 'Anticholinergic Burden', item_count: 214 },
      { pcid: 10000023, slug: 'do-not-crush', title: 'Do Not Crush', item_count: 226 },
    ])
    const hits = await searchConcepts('anticholinergic')
    expect(hits).toEqual([{ key: 'lanticholinergic-burden', name: 'Anticholinergic Burden', hint: 'List \u00b7 214 entries', pcid: 10000034, slug: 'anticholinergic-burden' }])
  })

  it('still searches when the lists cannot be loaded', async () => {
    listLists.mockRejectedValue(new Error('offline'))
    await expect(searchConcepts('metformin')).resolves.toEqual([])
  })
})

describe('fetchRelations', () => {
  it('sends validated, clamped arguments', async () => {
    rpc.mockReturnValue({ data: { rows: [], total: 0 }, error: null })
    await fetchRelations(1000577, { groups: ['classification'], query: '  carbon  ', limit: 99999, offset: -4 })
    expect(rpc).toHaveBeenCalledWith('network_relations', {
      p_pcid: 1000577,
      p_groups: ['classification'],
      p_include_community: false,
      p_query: 'carbon',
      p_limit: 200,
      p_offset: 0,
    })
    await fetchRelations(1000577)
    expect(rpc).toHaveBeenLastCalledWith('network_relations', expect.objectContaining({ p_groups: null, p_query: null, p_limit: 25 }))
  })

  it('rejects a bad PCID without calling the database, and maps errors', async () => {
    await expect(fetchRelations(0)).rejects.toBeInstanceOf(NetworkUnavailable)
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockReturnValue({ data: null, error: { code: 'PGRST202' } })
    await expect(fetchRelations(1000577)).rejects.toMatchObject({ notDeployed: true })
    rpc.mockReturnValue({ data: null, error: { code: '57014', message: 'internals' } })
    const err = await fetchRelations(1000577).catch(e => e)
    expect(err.notDeployed).toBe(false)
    expect(err.message).not.toMatch(/internals/)
  })
})
