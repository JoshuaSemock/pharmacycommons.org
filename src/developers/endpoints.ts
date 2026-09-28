/**
 * Pharmacy Commons API — the one list of endpoints.
 *
 * The Developers page console, its endpoint reference, the code snippets, the
 * OpenAPI spec (dist/openapi.json) and llms.txt are all generated from ENDPOINTS
 * below, so documentation cannot drift from what the console actually sends.
 * When the API gains or changes an endpoint (supabase/functions/api/index.ts),
 * change it here too.
 *
 * No React, no import.meta.env: scripts/postbuild.mjs imports this file under
 * plain Node to write dist/openapi.json and dist/llms.txt. Local imports keep
 * their .ts extension for the same reason.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** Where the API lives. Switch CURRENT_API_BASE to API_BASES.site once the
 *  Cloudflare Worker serves pharmacycommons.org/api (see docs/machine-readable-api.md). */
export const API_BASES = {
  site: 'https://pharmacycommons.org/api',
  supabase: 'https://nenwovhyrdcdkhxzjiiv.supabase.co/functions/v1/api',
} as const
export const CURRENT_API_BASE: string = API_BASES.supabase

export const SITE_BASE = 'https://pharmacycommons.org'

export type ParamType = 'string' | 'integer' | 'boolean' | 'ref' | 'types'

export type Param = {
  name: string
  in: 'path' | 'query'
  type: ParamType
  required?: boolean
  description: string
  /** Pre-filled in the console and used in examples. */
  example?: string
  default?: string
  min?: number
  max?: number
  /** For type 'types' (a comma-separated list). */
  options?: readonly string[]
}

export type EndpointId =
  | 'index'
  | 'search'
  | 'entity'
  | 'versions'
  | 'version'
  | 'changes'
  | 'members'
  | 'schema'
  | 'context'

export type Endpoint = {
  id: EndpointId
  /** Short name for menus. */
  label: string
  /** Path template, with {param} placeholders, relative to the API base. */
  path: string
  summary: string
  description: string
  params: Param[]
  /** Offer JSON-LD as well as JSON (adds .jsonld to the last path segment). */
  jsonld?: boolean
  /** Cache-Control max-age the API sends on success, in seconds. */
  cacheSeconds: number
  /** Top-level key holding the list, for spreadsheet imports ("results", "versions"…). */
  listKey?: string
  /** Possible non-200 answers, in addition to 502 upstream_error. */
  errors: { status: number; code: string; when: string }[]
}

export const SEARCH_TYPES = ['moiety', 'combination', 'class', 'precise_form', 'formulation'] as const

const REF: Param = {
  name: 'ref',
  in: 'path',
  type: 'ref',
  required: true,
  description:
    'Which record: a PCID (PCID-1001923), the bare number (1001923), a slug (metformin) or a slug URI (pc:moiety:metformin). All resolve to the same record.',
  example: 'PCID-1001923',
}

const NOT_FOUND = { status: 404, code: 'not_found', when: 'No record has that PCID or slug.' }
const GONE = { status: 410, code: 'retired', when: 'The PCID was retired. The body names its replacement.' }

export const ENDPOINTS: readonly Endpoint[] = [
  {
    id: 'search',
    label: 'Search',
    path: '/v1/search',
    summary: 'Find records by name, brand or class',
    description:
      'Finds records by generic name, brand name, slug or class abbreviation ("ssri", "ace inhibitor"). Multi-word queries match every word in any order. Each result says how it matched and links to its full record.',
    params: [
      { name: 'q', in: 'query', type: 'string', required: true, description: 'What to look for. At least 2 characters.', example: 'glucophage' },
      { name: 'limit', in: 'query', type: 'integer', description: 'How many results to return.', default: '20', min: 1, max: 100 },
      {
        name: 'type',
        in: 'query',
        type: 'types',
        description: 'Which kinds of record to search, comma-separated. Precise forms and formulations are off by default, as on the website.',
        default: 'moiety,combination,class',
        options: SEARCH_TYPES,
      },
    ],
    cacheSeconds: 300,
    listKey: 'results',
    errors: [
      { status: 400, code: 'bad_query', when: '?q= is missing, shorter than 2 characters or longer than 200.' },
      { status: 400, code: 'bad_limit', when: '?limit= is not a whole number from 1 to 100.' },
      { status: 400, code: 'bad_type', when: '?type= names a kind of record that cannot be searched.' },
    ],
  },
  {
    id: 'entity',
    label: 'Record',
    path: '/v1/entities/{ref}',
    summary: 'One record, in full',
    description:
      'The canonical document for one record: identity, identifiers, classification, hierarchy, relationships, brands, labels, provenance and version. Every record in every block has this shape; sections with no data are left out. /v1/drugs/{ref} is an alias.',
    params: [REF],
    jsonld: true,
    cacheSeconds: 300,
    errors: [NOT_FOUND, GONE],
  },
  {
    id: 'versions',
    label: 'Versions',
    path: '/v1/entities/{ref}/versions',
    summary: 'Every version of a record',
    description:
      'A new version is recorded whenever the content of the record changes, identified by a SHA-256 hash of that content. Newest first.',
    params: [REF],
    cacheSeconds: 60,
    listKey: 'versions',
    errors: [NOT_FOUND, GONE],
  },
  {
    id: 'version',
    label: 'One version',
    path: '/v1/entities/{ref}/versions/{n}',
    summary: 'A record exactly as it was',
    description: 'A past version of the record. A numbered version never changes, so it is cached for a year.',
    params: [REF, { name: 'n', in: 'path', type: 'integer', required: true, description: 'Version number, from 1.', example: '1', min: 1 }],
    jsonld: true,
    cacheSeconds: 31536000,
    errors: [NOT_FOUND, GONE, { status: 400, code: 'bad_version', when: 'The version is not a positive whole number.' }],
  },
  {
    id: 'changes',
    label: 'Changes',
    path: '/v1/entities/{ref}/changes',
    summary: 'Field-level change log',
    description:
      'Each change to the record, or to a relationship it takes part in, with the old and new value of every field and the run that made it. Newest first. Follow "next" for older changes.',
    params: [
      REF,
      { name: 'limit', in: 'query', type: 'integer', description: 'How many changes per page.', default: '50', min: 1, max: 200 },
      { name: 'before', in: 'query', type: 'integer', description: 'Only changes older than this change_id (from "next").' },
    ],
    cacheSeconds: 60,
    listKey: 'changes',
    errors: [NOT_FOUND, GONE],
  },
  {
    id: 'members',
    label: 'Class members',
    path: '/v1/entities/{ref}/members',
    summary: 'Drugs in a class',
    description: 'The records that belong to a pharmacologic class, directly or through a sub-class.',
    params: [
      { ...REF, description: 'A class record: its PCID or slug.', example: 'PCID-5001822' },
      { name: 'limit', in: 'query', type: 'integer', description: 'How many members per page.', default: '100', min: 1, max: 500 },
      { name: 'offset', in: 'query', type: 'integer', description: 'How many to skip, for paging.', default: '0', min: 0 },
      { name: 'direct', in: 'query', type: 'boolean', description: 'Only members assigned to this class itself, not to its sub-classes.', default: 'false' },
    ],
    cacheSeconds: 3600,
    listKey: 'members',
    errors: [NOT_FOUND, GONE],
  },
  {
    id: 'index',
    label: 'Index',
    path: '/v1',
    summary: 'What the API holds',
    description: 'Record types with their PCID ranges and counts, the data sources, the license, and the list of endpoints.',
    params: [],
    cacheSeconds: 300,
    errors: [],
  },
  {
    id: 'schema',
    label: 'Schema',
    path: '/v1/schema/entity.json',
    summary: 'JSON Schema for a record',
    description: 'The contract every record document follows (JSON Schema 2020-12). Validate against it, or generate types from it.',
    params: [],
    cacheSeconds: 3600,
    errors: [],
  },
  {
    id: 'context',
    label: 'JSON-LD context',
    path: '/v1/context.jsonld',
    summary: 'Linked-data vocabulary',
    description: 'Maps the document fields to schema.org and the Pharmacy Commons vocabulary, so the .jsonld form reads as linked data.',
    params: [],
    cacheSeconds: 3600,
    errors: [],
  },
]

export const ENDPOINT_BY_ID: ReadonlyMap<EndpointId, Endpoint> = new Map(ENDPOINTS.map(e => [e.id, e]))
export const isEndpointId = (s: string): s is EndpointId => ENDPOINT_BY_ID.has(s as EndpointId)

export type ParamValues = Record<string, string>
export type Format = 'json' | 'jsonld'

/** Values for a fresh console: each parameter's example, else blank. */
export function exampleValues(e: Endpoint): ParamValues {
  const v: ParamValues = {}
  for (const p of e.params) v[p.name] = p.example ?? ''
  return v
}

/** Required parameters that are still blank. */
export function missingParams(e: Endpoint, values: ParamValues): Param[] {
  return e.params.filter(p => p.required && !(values[p.name] ?? '').trim())
}

/**
 * The full request URL. Path values are URI-encoded; query values left blank or
 * equal to the documented default are omitted, so shared URLs stay short.
 */
export function buildUrl(e: Endpoint, values: ParamValues, base: string, format: Format = 'json'): string {
  let path = e.path.replace(/\{(\w+)\}/g, (_, name: string) => encodeURIComponent((values[name] ?? '').trim()))
  if (format === 'jsonld' && e.jsonld) path += '.jsonld'
  const qs = new URLSearchParams()
  for (const p of e.params) {
    if (p.in !== 'query') continue
    const v = (values[p.name] ?? '').trim()
    if (!v || v === p.default) continue
    qs.set(p.name, v)
  }
  const query = qs.toString().replace(/%2C/gi, ',')
  return `${base}${path}${query ? `?${query}` : ''}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Code snippets
// ─────────────────────────────────────────────────────────────────────────────

export type SnippetLang = 'curl' | 'javascript' | 'python' | 'r' | 'excel'

export const SNIPPET_LANGS: readonly [SnippetLang, string][] = [
  ['curl', 'curl'],
  ['javascript', 'JavaScript'],
  ['python', 'Python'],
  ['r', 'R'],
  ['excel', 'Excel'],
]

/** The same request, ready to paste, in each language. */
export function snippet(lang: SnippetLang, url: string, e: Endpoint): string {
  const listKey = e.listKey
  switch (lang) {
    case 'curl':
      return `curl -s "${url}" \\\n  -H "Accept: application/json"`
    case 'javascript':
      return [
        `const res = await fetch("${url}")`,
        'if (!res.ok) throw new Error(`HTTP ${res.status}`)',
        'const data = await res.json()',
        listKey ? `console.table(data.${listKey})` : 'console.log(data)',
      ].join('\n')
    case 'python':
      return [
        'import requests',
        '',
        `r = requests.get("${url}", timeout=30)`,
        'r.raise_for_status()',
        'data = r.json()',
        listKey ? `for item in data["${listKey}"]:\n    print(item)` : 'print(data)',
      ].join('\n')
    case 'r':
      return [
        'library(jsonlite)',
        '',
        `data <- fromJSON("${url}")`,
        listKey ? `head(data$${listKey})` : 'str(data, max.level = 1)',
      ].join('\n')
    case 'excel':
      return [
        '// Excel: Data → Get Data → From Other Sources → Blank Query → Advanced Editor, then paste.',
        'let',
        `    Source = Json.Document(Web.Contents("${url}"))${listKey ? ',' : ''}`,
        ...(listKey ? [`    Rows = Table.FromRecords(Source[${listKey}], null, MissingField.UseNull)`] : []),
        'in',
        listKey ? '    Rows' : '    Source',
      ].join('\n')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Machine-readable descriptions of the API itself
// ─────────────────────────────────────────────────────────────────────────────

function openApiParam(p: Param) {
  const schema: Record<string, unknown> =
    p.type === 'integer'
      ? { type: 'integer', ...(p.min != null ? { minimum: p.min } : {}), ...(p.max != null ? { maximum: p.max } : {}) }
      : p.type === 'boolean'
        ? { type: 'boolean' }
        : p.type === 'types'
          ? { type: 'array', items: { type: 'string', enum: p.options }, default: p.default?.split(',') }
          : { type: 'string' }
  if (p.default != null && p.type !== 'types') schema.default = p.type === 'integer' ? Number(p.default) : p.type === 'boolean' ? p.default === 'true' : p.default
  return {
    name: p.name,
    in: p.in,
    required: p.in === 'path' || Boolean(p.required),
    description: p.description,
    schema,
    ...(p.type === 'types' ? { style: 'form', explode: false } : {}),
    ...(p.example ? { example: p.type === 'integer' ? Number(p.example) : p.example } : {}),
  }
}

/** OpenAPI 3.1 description of the API, for Postman, Swagger UI and code generators. */
export function openApiSpec(base: string = CURRENT_API_BASE) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const e of ENDPOINTS) {
    const responses: Record<string, unknown> = {
      200: {
        description: 'OK',
        headers: {
          'Cache-Control': { description: `public, max-age=${e.cacheSeconds}`, schema: { type: 'string' } },
          ...(e.id === 'entity' || e.id === 'version'
            ? {
                ETag: { description: 'W/"sha256:…" — the version hash. Send it back in If-None-Match to get 304.', schema: { type: 'string' } },
                'X-PCID': { description: 'The resolved PCID.', schema: { type: 'string' } },
                'X-Version': { description: 'The version number served.', schema: { type: 'string' } },
                Link: { description: 'canonical, alternate (HTML page), describedby (schema), version-history.', schema: { type: 'string' } },
              }
            : {}),
        },
        content: {
          'application/json': {
            schema: e.id === 'entity' || e.id === 'version' ? { $ref: '#/components/schemas/Entity' } : { type: 'object' },
          },
          ...(e.jsonld ? { 'application/ld+json': { schema: { $ref: '#/components/schemas/Entity' } } } : {}),
        },
      },
      ...(e.id === 'entity' ? { 304: { description: 'Not modified: the If-None-Match ETag is still current.' } } : {}),
      502: { description: 'upstream_error: the database did not answer.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    }
    // Every route can answer 404 unknown_route for a mistyped path.
    const errors = e.errors.length ? e.errors : [{ status: 404, code: 'unknown_route', when: 'The path does not match an endpoint.' }]
    for (const err of errors) {
      responses[err.status] = {
        description: `${err.code}: ${err.when}`,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      }
    }
    paths[e.path] = {
      get: {
        operationId: e.id,
        summary: e.summary,
        description: e.description,
        parameters: e.params.map(openApiParam),
        responses,
      },
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Pharmacy Commons API',
      version: '1',
      summary: 'Open, read-only drug knowledge: every Pharmacy Commons record as JSON and JSON-LD, with versions and field-level change history.',
      description:
        'No key and no sign-up. Responses are cached (see Cache-Control) and record documents carry an ETag for conditional requests. PCID is the only native key; permanent IRIs are https://pharmacycommons.org/id/PCID-n. Documentation and an interactive console: https://pharmacycommons.org/developers',
      contact: { name: 'Pharmacy Commons', email: 'contact@pharmacycommons.org', url: `${SITE_BASE}/developers` },
      license: { name: 'CC0-1.0 for Pharmacy Commons–authored content; third-party fields keep their source terms', identifier: 'CC0-1.0' },
    },
    externalDocs: { description: 'Developers page', url: `${SITE_BASE}/developers` },
    servers: [{ url: base }],
    // Public API: no authentication on any operation.
    security: [],
    paths,
    components: {
      schemas: {
        Entity: { $ref: `${base}/v1/schema/entity.json` },
        Error: {
          type: 'object',
          required: ['error', 'status', 'code', 'message'],
          properties: {
            error: { const: true },
            status: { type: 'integer' },
            code: { type: 'string' },
            message: { type: 'string' },
            docs: { type: 'string', format: 'uri' },
          },
        },
      },
    },
  }
}

/** llms.txt (llmstxt.org): a short guide for AI agents that use the API. */
export function llmsTxt(base: string = CURRENT_API_BASE): string {
  const lines = [
    '# Pharmacy Commons',
    '',
    '> Open, source-traced drug knowledge. Every record has a permanent identifier (PCID), a human page and a public, read-only JSON/JSON-LD API with version and change history. No key needed.',
    '',
    `API base: ${base}`,
    'PCIDs look like PCID-1001923. Permanent IRI: https://pharmacycommons.org/id/PCID-n. Slugs (metformin) also resolve.',
    'To look something up by name, call /v1/search?q= first, then fetch the record at results[].links.json.',
    'Every fact in a record traces to provenance.sources[]; cite the PCID and version.number when you use it.',
    'Third-party fields keep their source license; Pharmacy Commons–authored content is CC0 1.0.',
    '',
    '## Endpoints',
    '',
    ...ENDPOINTS.map(e => `- [${e.summary}](${base}${e.path}): ${e.description}`),
    '',
    '## Docs',
    '',
    `- [Developers page and console](${SITE_BASE}/developers)`,
    `- [OpenAPI spec](${SITE_BASE}/openapi.json)`,
    `- [JSON Schema for a record](${base}/v1/schema/entity.json)`,
  ]
  return lines.join('\n') + '\n'
}
