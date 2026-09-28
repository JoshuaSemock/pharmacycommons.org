import { describe, expect, it } from 'vitest'
import { ENDPOINTS, ENDPOINT_BY_ID, buildUrl, exampleValues, llmsTxt, missingParams, openApiSpec, snippet } from './endpoints'
import { diffDocuments, jsonPath, schemaFields } from './client'

const BASE = 'https://example.test/api'
const ep = (id: Parameters<typeof ENDPOINT_BY_ID.get>[0]) => ENDPOINT_BY_ID.get(id)!

describe('endpoint registry', () => {
  it('has unique ids and paths, and every path parameter is declared', () => {
    expect(new Set(ENDPOINTS.map(e => e.id)).size).toBe(ENDPOINTS.length)
    expect(new Set(ENDPOINTS.map(e => e.path)).size).toBe(ENDPOINTS.length)
    for (const e of ENDPOINTS) {
      const inPath = [...e.path.matchAll(/\{(\w+)\}/g)].map(m => m[1])
      expect(e.params.filter(p => p.in === 'path').map(p => p.name)).toEqual(inPath)
    }
  })

  it('builds URLs, encoding path values and dropping blank or default query values', () => {
    expect(buildUrl(ep('search'), { q: 'ace inhibitor', limit: '20', type: '' }, BASE)).toBe(`${BASE}/v1/search?q=ace+inhibitor`)
    expect(buildUrl(ep('search'), { q: 'x', limit: '5', type: 'moiety,class' }, BASE)).toBe(`${BASE}/v1/search?q=x&limit=5&type=moiety,class`)
    expect(buildUrl(ep('entity'), { ref: 'pc:moiety:metformin' }, BASE)).toBe(`${BASE}/v1/entities/pc%3Amoiety%3Ametformin`)
    expect(buildUrl(ep('entity'), { ref: 'PCID-1001923' }, BASE, 'jsonld')).toBe(`${BASE}/v1/entities/PCID-1001923.jsonld`)
    expect(buildUrl(ep('version'), { ref: 'PCID-1001923', n: '1' }, BASE)).toBe(`${BASE}/v1/entities/PCID-1001923/versions/1`)
  })

  it('reports missing required parameters', () => {
    expect(missingParams(ep('search'), { q: ' ' }).map(p => p.name)).toEqual(['q'])
    expect(missingParams(ep('entity'), exampleValues(ep('entity')))).toEqual([])
  })
})

describe('code snippets', () => {
  const url = `${BASE}/v1/search?q=metformin`
  it('writes each language around the same URL', () => {
    for (const lang of ['curl', 'javascript', 'python', 'r', 'excel'] as const) expect(snippet(lang, url, ep('search'))).toContain(url)
  })
  it('turns list endpoints into a table in Excel and reads the list in Python', () => {
    expect(snippet('excel', url, ep('search'))).toContain('Table.FromRecords(Source[results]')
    expect(snippet('python', url, ep('search'))).toContain('data["results"]')
    expect(snippet('excel', `${BASE}/v1/entities/PCID-1001923`, ep('entity'))).not.toContain('Table.FromRecords')
  })
})

describe('OpenAPI and llms.txt', () => {
  const spec = openApiSpec(BASE)
  it('describes every endpoint once, with parameters and error responses', () => {
    expect(spec.openapi).toBe('3.1.0')
    expect(spec.servers[0].url).toBe(BASE)
    expect(Object.keys(spec.paths)).toEqual(ENDPOINTS.map(e => e.path))
    const search = spec.paths['/v1/search'].get as { parameters: { name: string; required: boolean }[]; responses: Record<string, unknown> }
    expect(search.parameters.find(p => p.name === 'q')?.required).toBe(true)
    expect(Object.keys(search.responses)).toEqual(expect.arrayContaining(['200', '400', '502']))
    const ids = Object.values(spec.paths).map(p => (p.get as { operationId: string }).operationId)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('is plain JSON', () => {
    expect(() => JSON.parse(JSON.stringify(spec))).not.toThrow()
  })
  it('lists every endpoint in llms.txt', () => {
    const txt = llmsTxt(BASE)
    expect(txt.startsWith('# Pharmacy Commons')).toBe(true)
    for (const e of ENDPOINTS) expect(txt).toContain(`${BASE}${e.path}`)
  })
})

describe('JSON paths', () => {
  it('writes dotted, indexed and quoted segments', () => {
    expect(jsonPath(['brands', 0, 'name'])).toBe('$.brands[0].name')
    expect(jsonPath(['@id'])).toBe('$["@id"]')
  })
})

describe('version diff', () => {
  const v1 = {
    '@id': 'x',
    name: 'metformin',
    version: { number: 1 },
    generated_at: 'a',
    identifiers: { unii: '9100L32L2N' },
    brands: [{ name: 'Glucophage', marketed: false }],
  }
  const v2 = {
    '@id': 'x',
    name: 'metformin',
    version: { number: 2 },
    generated_at: 'b',
    identifiers: { unii: '9100L32L2N', rxcui: '6809' },
    brands: [{ name: 'FORTAMET', marketed: false }, { name: 'Glucophage', marketed: true }],
  }
  it('ignores the envelope, keys list items by identity, and reports each field once', () => {
    const rows = diffDocuments(v1, v2)
    expect(rows).toEqual([
      { path: 'brands["FORTAMET"].marketed', kind: 'added', after: false },
      { path: 'brands["FORTAMET"].name', kind: 'added', after: 'FORTAMET' },
      { path: 'brands["Glucophage"].marketed', kind: 'changed', before: false, after: true },
      { path: 'identifiers.rxcui', kind: 'added', after: '6809' },
    ])
  })
  it('reports a list that gained its first item as that item only', () => {
    const rows = diffDocuments({ hierarchy: { combinations: [] } }, { hierarchy: { combinations: [{ pcid: 'PCID-2000958', name: 'X' }] } })
    expect(rows.map(r => `${r.kind} ${r.path}`)).toEqual(['added hierarchy.combinations["PCID-2000958"].name', 'added hierarchy.combinations["PCID-2000958"].pcid'])
  })
  it('finds nothing between identical documents', () => {
    expect(diffDocuments(v2, structuredClone(v2))).toEqual([])
  })
})

describe('schema fields', () => {
  const schema = {
    required: ['pcid'],
    $defs: { pcid: { type: 'string', pattern: '^PCID-' }, ref: { type: 'object', properties: { pcid: { type: 'string' } } } },
    properties: {
      pcid: { $ref: '#/$defs/pcid' },
      brands: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } },
      classification: { type: 'object', properties: { primary: { $ref: '#/$defs/ref', description: 'Main class' } } },
      license: { type: 'object', properties: { data: { type: ['string', 'null'] } } },
    },
  }
  it('flattens nested fields, resolves $defs and marks required ones', () => {
    const f = schemaFields(schema)
    expect(f.find(x => x.path === 'pcid')).toMatchObject({ type: 'PCID', required: true, depth: 0 })
    expect(f.find(x => x.path === 'brands[].name')).toMatchObject({ type: 'string', depth: 1 })
    expect(f.find(x => x.path === 'classification.primary')).toMatchObject({ type: 'record reference', description: 'Main class' })
    expect(f.find(x => x.path === 'license.data')?.type).toBe('string | null')
    expect(f.some(x => x.path === 'classification.primary.pcid')).toBe(false)
  })
})
