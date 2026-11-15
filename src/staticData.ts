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
 * A route bundle is `{ v: 1, r: { [requestKey]: [status, headers, body] } }`; a shared
 * file is one `[status, headers, body]`. The request
 * key is `requestKey()` below; scripts/static/key.mjs must compute the same value.
 * A request nobody recorded gets a 404 with code `static_miss`, so the page shows
 * its normal error state instead of hanging.
 *
 * Destination: src/staticData.ts
 */

export const STATIC_PREFIX = '/supabase'
const DATA_BASE = '/data'

type Recorded = [number, Record<string, string>, string]
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

export function installStaticFetch(): void {
  const realFetch = window.fetch.bind(window)
  const prefix = window.location.origin + STATIC_PREFIX + '/'
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = input instanceof Request ? input : null
    const url = req ? req.url : new URL(String(input), window.location.href).href
    if (!url.startsWith(prefix)) return realFetch(input, init)
    const method = (init?.method ?? req?.method ?? 'GET').toUpperCase()
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
    return new Response(method === 'HEAD' || status === 204 ? null : text, { status, headers })
  }
}
