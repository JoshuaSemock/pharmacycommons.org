/**
 * Developers page — logic with no React: running a request, comparing two
 * versions of a record, and flattening the JSON Schema into a field list.
 * Tested in developers.test.ts.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// ─────────────────────────────────────────────────────────────────────────────
// Requests
// ─────────────────────────────────────────────────────────────────────────────

/** Headers the API exposes to browsers (Access-Control-Expose-Headers) plus the CORS-safelisted ones worth showing. */
export const SHOWN_HEADERS = ['content-type', 'cache-control', 'etag', 'x-pcid', 'x-version', 'link'] as const

export type ApiResult = {
  url: string
  status: number
  ok: boolean
  /** Milliseconds from sending to having the whole body. */
  ms: number
  bytes: number
  headers: [string, string][]
  /** Parsed JSON, or null for an empty body (304) or text that is not JSON. */
  json: unknown
  text: string
  /** Set when the request never got an answer (network, CORS, timeout). */
  networkError?: string
}

export async function runRequest(url: string, opts: { etag?: string; signal?: AbortSignal } = {}): Promise<ApiResult> {
  const started = performance.now()
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', ...(opts.etag ? { 'If-None-Match': opts.etag } : {}) },
      // The console shows what the server says, not a browser-cache copy.
      cache: 'no-store',
      signal: opts.signal,
    })
    const text = await res.text()
    const ms = Math.round(performance.now() - started)
    let json: unknown = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = null
      }
    }
    const headers: [string, string][] = []
    for (const h of SHOWN_HEADERS) {
      const v = res.headers.get(h)
      if (v) headers.push([h, v])
    }
    return { url, status: res.status, ok: res.ok, ms, bytes: new TextEncoder().encode(text).length, headers, json, text }
  } catch (e) {
    return {
      url,
      status: 0,
      ok: false,
      ms: Math.round(performance.now() - started),
      bytes: 0,
      headers: [],
      json: null,
      text: '',
      networkError: e instanceof Error ? e.message : 'The request did not complete.',
    }
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

/** "$.brands[0].name" — a JSONPath for a location in a response. */
export function jsonPath(path: (string | number)[]): string {
  return (
    '$' +
    path
      .map(p => (typeof p === 'number' ? `[${p}]` : /^[A-Za-z_$][\w$]*$/.test(p) ? `.${p}` : `[${JSON.stringify(p)}]`))
      .join('')
  )
}

export const PCID_RE = /^PCID-\d{7,8}$/

// ─────────────────────────────────────────────────────────────────────────────
// Version diff
// ─────────────────────────────────────────────────────────────────────────────

export type DiffRow = { path: string; kind: 'added' | 'removed' | 'changed'; before?: unknown; after?: unknown }

/** Envelope fields that change on every response and say nothing about the content. */
const DIFF_IGNORE = new Set(['generated_at', 'version', 'links', 'api_version', 'schema_version', '@context'])

/**
 * An array element's stable identity, so a reordered or inserted brand or
 * relationship is reported as one change rather than a cascade of index shifts.
 */
function itemKey(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  for (const k of ['@id', 'pcid', 'statement_id', 'setid', 'name', 'key']) {
    const x = o[k]
    if (typeof x === 'string' || typeof x === 'number') return String(x)
  }
  if (o.class && typeof o.class === 'object') {
    const c = (o.class as Record<string, unknown>)['@id']
    if (typeof c === 'string') return c
  }
  return null
}

function flatten(v: unknown, path: string, out: Map<string, unknown>, top = false) {
  if (Array.isArray(v)) {
    const keyed = v.length > 0 && v.every(x => itemKey(x) != null)
    if (v.length === 0) out.set(path, [])
    v.forEach((x, i) => flatten(x, keyed ? `${path}[${JSON.stringify(itemKey(x))}]` : `${path}[${i}]`, out))
    return
  }
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
    if (entries.length === 0 && !top) out.set(path, {})
    for (const [k, x] of entries) {
      if (top && DIFF_IGNORE.has(k)) continue
      flatten(x, path ? `${path}.${k}` : k, out)
    }
    return
  }
  out.set(path, v)
}

/** Field-by-field differences between two record documents. */
export function diffDocuments(before: unknown, after: unknown): DiffRow[] {
  const a = new Map<string, unknown>()
  const b = new Map<string, unknown>()
  flatten(before, '', a, true)
  flatten(after, '', b, true)
  const rows: DiffRow[] = []
  for (const [k, v] of a) {
    if (!b.has(k)) rows.push({ path: k, kind: 'removed', before: v })
    else if (JSON.stringify(b.get(k)) !== JSON.stringify(v)) rows.push({ path: k, kind: 'changed', before: v, after: b.get(k) })
  }
  for (const [k, v] of b) if (!a.has(k)) rows.push({ path: k, kind: 'added', after: v })
  // An empty list or object that gained (or lost) its contents is reported by
  // those contents alone, not also as a removed (or added) "[]".
  const isEmpty = (v: unknown) => (Array.isArray(v) ? v.length === 0 : !!v && typeof v === 'object' && Object.keys(v).length === 0)
  const hasChildren = (m: Map<string, unknown>, path: string) => [...m.keys()].some(k => k.startsWith(`${path}[`) || k.startsWith(`${path}.`))
  return rows
    .filter(r => !(r.kind === 'removed' && isEmpty(r.before) && hasChildren(b, r.path)) && !(r.kind === 'added' && isEmpty(r.after) && hasChildren(a, r.path)))
    .sort((x, y) => x.path.localeCompare(y.path))
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema browser
// ─────────────────────────────────────────────────────────────────────────────

export type SchemaField = { path: string; type: string; description?: string; required: boolean; depth: number }

type SchemaNode = {
  type?: string | string[]
  description?: string
  properties?: Record<string, SchemaNode>
  required?: string[]
  items?: SchemaNode
  $ref?: string
  enum?: unknown[]
  const?: unknown
  pattern?: string
  format?: string
  allOf?: SchemaNode[]
}

/** The JSON Schema as a flat, readable list of fields, resolving local $defs. */
export function schemaFields(schema: unknown, maxDepth = 3): SchemaField[] {
  const root = schema as SchemaNode & { $defs?: Record<string, SchemaNode> }
  const defs = root.$defs ?? {}
  const resolve = (n: SchemaNode): SchemaNode => {
    if (n.$ref?.startsWith('#/$defs/')) return { ...defs[n.$ref.slice(8)], description: n.description ?? defs[n.$ref.slice(8)]?.description }
    if (n.allOf?.length) return n.allOf.map(resolve).reduce((acc, x) => ({ ...acc, ...x, properties: { ...acc.properties, ...x.properties } }), {} as SchemaNode)
    return n
  }
  const typeOf = (n: SchemaNode, ref?: string): string => {
    if (ref?.startsWith('#/$defs/')) {
      const name = ref.slice(8)
      if (name === 'ref') return 'record reference'
      if (name === 'pcid') return 'PCID'
    }
    if (n.const !== undefined) return JSON.stringify(n.const)
    if (n.enum) return n.enum.map(x => JSON.stringify(x)).join(' | ')
    if (n.type === 'array' && n.items) return `array of ${typeOf(resolve(n.items), n.items.$ref)}`
    const t = Array.isArray(n.type) ? n.type.join(' | ') : (n.type ?? (n.properties ? 'object' : 'any'))
    return n.format ? `${t} (${n.format})` : t
  }
  const out: SchemaField[] = []
  const walk = (n: SchemaNode, prefix: string, depth: number) => {
    const req = new Set(n.required ?? [])
    for (const [name, raw] of Object.entries(n.properties ?? {})) {
      const node = resolve(raw)
      const path = prefix ? `${prefix}.${name}` : name
      out.push({ path, type: typeOf(node, raw.$ref), description: node.description, required: req.has(name), depth })
      if (depth + 1 >= maxDepth) continue
      if (node.properties && raw.$ref !== '#/$defs/ref') walk(node, path, depth + 1)
      else if (node.items) {
        const item = resolve(node.items)
        if (item.properties && node.items.$ref !== '#/$defs/ref') walk(item, `${path}[]`, depth + 1)
      }
    }
  }
  walk(root, '', 0)
  return out
}
