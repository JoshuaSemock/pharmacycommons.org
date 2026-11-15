/**
 * Static mode for pharmacycommons-api (docs/static-export.md): answers /api/* from the
 * files scripts/static/export-api.mjs writes to the site's /api-static/ folder on GitHub
 * Pages, instead of forwarding to the Supabase Edge Function.
 *
 * Covered: /v1, schema, context, /v1/(entities|drugs)/{PCID|n|slug}[.json|.jsonld],
 * its /versions, /changes (first page), /members (class, default page), and the latest
 * numbered version. Retired PCIDs 301 to their replacement (410 when there is none).
 * Not covered (no database): /v1/search, older numbered versions, other pages of
 * changes/members. Those return 404/501 with code `static_unavailable`.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const FILES = 'https://pharmacycommons.org/api-static'
const PUBLIC = 'https://pharmacycommons.org/api'
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'ETag, Link, Location' }

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300', ...CORS, ...extra },
  })
}

function unavailable(status: number, what: string): Response {
  return json(status, {
    error: true,
    status,
    code: 'static_unavailable',
    message: `${what} is not available in the static edition of Pharmacy Commons. Every record's current document, versions list and change history are; see ${PUBLIC}/v1.`,
  })
}

async function file(path: string): Promise<Response | null> {
  const r = await fetch(FILES + path, { cf: { cacheEverything: true, cacheTtl: 3600 } } as RequestInit)
  return r.ok ? r : null
}

let slugs: Promise<Record<string, number>> | null = null
let retired: Promise<Record<string, number | null>> | null = null
const loadMap = <T>(path: string): Promise<T> => file(path).then(r => (r ? (r.json() as Promise<T>) : ({} as T)))

/** PCID number for "PCID-n", "n", a slug, or a slug URI ("pc:moiety:metformin"). */
async function resolve(ref: string): Promise<number | null> {
  const m = ref.match(/^(?:pcid-)?(\d{7,8})$/i)
  if (m) return Number(m[1])
  slugs ??= loadMap<Record<string, number>>('/v1/slugs.json')
  const map = await slugs
  const slug = ref.toLowerCase().replace(/^pc:[a-z_]+:/, '')
  return map[slug] ?? null
}

async function serve(path: string, ld: boolean): Promise<Response> {
  const r = await file(path)
  if (!r) return unavailable(404, 'This document')
  const type = path.endsWith('.jsonld') || ld ? 'application/ld+json' : path.includes('/schema/') ? 'application/schema+json' : 'application/json'
  return new Response(r.body, {
    status: 200,
    headers: { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'public, max-age=300', ...CORS },
  })
}

export async function handleStatic(request: Request, url: URL): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS, 'access-control-allow-methods': 'GET, HEAD, OPTIONS', 'access-control-allow-headers': '*' } })
  }
  const parts = url.pathname.slice('/api'.length).split('/').filter(Boolean)
  const q = url.searchParams
  const ld = (request.headers.get('accept') ?? '').includes('application/ld+json')

  if (parts.length === 0) return new Response(null, { status: 302, headers: { ...CORS, location: `${PUBLIC}/v1` } })
  if (parts[0] !== 'v1') return json(404, { error: true, status: 404, code: 'unknown_version', message: 'Only /v1 exists.' })
  if (parts.length === 1) return serve('/v1.json', false)
  if (parts[1] === 'search') return unavailable(501, 'Search (/v1/search)')
  if (parts[1] === 'schema' && parts[2] === 'entity.json' && parts.length === 3) return serve('/v1/schema/entity.json', false)
  if (parts[1] === 'context.jsonld' && parts.length === 2) return serve('/v1/context.jsonld', true)

  if ((parts[1] === 'entities' || parts[1] === 'drugs') && parts.length >= 3) {
    const rawRef = decodeURIComponent(parts[2])
    const wantLd = ld || /\.jsonld$/i.test(rawRef)
    const pcid = await resolve(rawRef.replace(/\.(jsonld|json)$/i, ''))
    if (pcid === null) return json(404, { error: true, status: 404, code: 'not_found', message: `No record matches ${rawRef}.` })
    const sub = parts[3]
    const id = `PCID-${pcid}`

    retired ??= loadMap<Record<string, number | null>>('/v1/retired.json')
    const gone = (await retired)[String(pcid)]
    if (gone !== undefined) {
      if (!sub && gone) {
        const ext = rawRef.match(/\.(jsonld|json)$/i)?.[0] ?? ''
        return new Response(null, { status: 301, headers: { ...CORS, location: `${PUBLIC}/v1/${parts[1]}/PCID-${gone}${ext}` } })
      }
      return json(410, { error: true, status: 410, code: 'retired', message: `${id} was retired.`, replaced_by_pcid: gone ? `PCID-${gone}` : null })
    }

    if (!sub) return serve(`/v1/entities/${id}.json`, wantLd)
    if (sub === 'versions' && parts.length === 4) return serve(`/v1/entities/${id}/versions.json`, false)
    if (sub === 'versions' && parts.length === 5) {
      const n = Number(parts[4].replace(/\.(jsonld|json)$/i, ''))
      const list = await file(`/v1/entities/${id}/versions.json`)
      const versions = list ? (((await list.json()) as { versions?: { number: number }[] }).versions ?? []) : []
      const latest = versions.length ? Math.max(...versions.map(v => v.number)) : null
      if (latest !== null && n === latest) return serve(`/v1/entities/${id}.json`, wantLd || /\.jsonld$/i.test(parts[4]))
      return unavailable(404, `Version ${n} of ${id}`)
    }
    if (sub === 'changes' && parts.length === 4) {
      if (q.has('before') || (q.has('limit') && q.get('limit') !== '50')) return unavailable(404, 'That page of changes')
      return serve(`/v1/entities/${id}/changes.json`, false)
    }
    if (sub === 'members' && parts.length === 4) {
      const nonDefault = (q.get('offset') ?? '0') !== '0' || (q.get('limit') ?? '100') !== '100' || ['true', '1'].includes(q.get('direct') ?? '')
      if (nonDefault) return unavailable(404, 'That page of class members')
      return serve(`/v1/entities/${id}/members.json`, false)
    }
  }
  return json(404, { error: true, status: 404, code: 'unknown_route', message: `No endpoint at ${url.pathname}. See ${PUBLIC}/v1 for the list.` })
}
