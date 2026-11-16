/**
 * Static edition (`vite build --mode static`, docs/static-export.md).
 *
 * The public site has no database behind it. Every request the app would send to
 * Supabase (`<origin>/supabase/...`: PostgREST, RPCs, Edge Functions) is answered
 * from files recorded in advance from the local stack by scripts/static/record.mjs:
 *
 *   /data/p/<xx>/<hash>.json   the answers one route needs, keyed by its pathname
 *   /data/s/<requestKey>.json  one answer that several routes (or the header
 *                              search, on any page) need: catalog, list index, ...
 *
 * A route bundle is `{ v: 1, r: { [requestKey]: answer } }`; a shared file is one answer.
 * An answer is `[status, headers, body]`, or `[status, headers, null, json]` for a JSON
 * body stored unescaped (pack.mjs does that to save space). The request
 * key is `requestKey()` below; scripts/static/key.mjs must compute the same value.
 * A request nobody recorded gets a 404 with code `static_miss`, so the page shows
 * its normal error state instead of hanging.
 *
 * Record documents from the public API (`<API_BASE>/v1/entities/PCID-n[/versions|/changes]`,
 * used by the Machine-readable panel) are not in the bundles: they are read from the same
 * `/api-static/` files the Cloudflare Worker serves (scripts/static/export-api.mjs).
 *
 * Destination: src/staticData.ts
 */

export const STATIC_PREFIX = '/supabase'
const DATA_BASE = '/data'

type Recorded = [number, Record<string, string>, string] | [number, Record<string, string>, null, unknown]
interface Bundle { v: number; r: Record<string, Recorded> }

const answers = new Map<string, Recorded>()
const loading = new Map<string, Promise<void>>()

async function sha(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('').slice(0, 20)
}

/** METHOD, the path after /supabase (with its query string), and the body. */
export function requestKey(method: string, path: string, body: string): Promise<string> {
  return sha(`${method.toUpperCase()}\n${path}\n${body}`)
}

/** Pathname without a trailing slash ("/" stays "/"). */
export function routeOf(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : '/'
}

export function routeFile(route: string): Promise<string> {
  return sha(route).then(h => `${DATA_BASE}/p/${h.slice(0, 2)}/${h}.json`)
}

function load(url: string, realFetch: typeof fetch): Promise<void> {
  let p = loading.get(url)
  if (!p) {
    p = realFetch(url)
      .then(r => (r.ok ? (r.json() as Promise<Bundle>) : null))
      .then(b => { if (b) for (const [k, v] of Object.entries(b.r)) answers.set(k, v) })
      .catch(() => undefined)
    loading.set(url, p)
  }
  return p
}

async function loadShared(key: string, realFetch: typeof fetch): Promise<void> {
  const r = await realFetch(`${DATA_BASE}/s/${key}.json`).catch(() => null)
  if (r?.ok) answers.set(key, (await r.json()) as Recorded)
}

function miss(method: string): Response {
  const headers = { 'content-type': 'application/json', 'content-range': '*/0' }
  const body = method === 'HEAD' ? null
    : JSON.stringify({ code: 'static_miss', message: 'Not available in the static edition of Pharmacy Commons.' })
  return new Response(body, { status: 404, headers })
}

const API_DOC = /^\/v1\/entities\/(PCID-\d{7,8})(?:\.json)?(\/versions|\/changes)?(?:\?.*)?$/

/** `${apiBase}/v1/entities/PCID-n[/versions|/changes]` → its /api-static file, else null. */
export function apiStaticFile(url: string, apiBase: string): string | null {
  if (!apiBase || !url.startsWith(apiBase + '/')) return null
  const m = url.slice(apiBase.length).match(API_DOC)
  return m ? `/api-static/v1/entities/${m[1]}${m[2] ?? ''}.json` : null
}

export function installStaticFetch(apiBase = ''): void {
  const realFetch = window.fetch.bind(window)
  const prefix = window.location.origin + STATIC_PREFIX + '/'
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = input instanceof Request ? input : null
    const url = req ? req.url : new URL(String(input), window.location.href).href
    const method = (init?.method ?? req?.method ?? 'GET').toUpperCase()
    const apiFile = method === 'GET' ? apiStaticFile(url, apiBase) : null
    if (apiFile) {
      const r = await realFetch(apiFile).catch(() => null)
      if (r?.ok) return new Response(await r.text(), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } })
      return miss('GET')
    }
    if (!url.startsWith(prefix)) return realFetch(input, init)
    let body = ''
    if (typeof init?.body === 'string') body = init.body
    else if (req && method !== 'GET' && method !== 'HEAD') body = await req.clone().text()
    const key = await requestKey(method, url.slice(prefix.length - 1), body)
    if (!answers.has(key)) await routeFile(routeOf(window.location.pathname)).then(f => load(f, realFetch))
    if (!answers.has(key)) await loadShared(key, realFetch)
    const hit = answers.get(key)
    if (!hit) {
      console.warn('[static] miss', method, url.slice(prefix.length - 1).slice(0, 160))
      return miss(method)
    }
    const [status, headers, text] = hit
    const answer = hit.length === 4 ? JSON.stringify(hit[3]) : text
    return new Response(method === 'HEAD' || status === 204 ? null : answer, { status, headers })
  }
}
