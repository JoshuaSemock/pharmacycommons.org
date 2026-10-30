/**
 * pharmacycommons-api: Cloudflare Worker on pharmacycommons.org/api/*
 *
 * Forwards GET/HEAD/OPTIONS to the Supabase Edge Function `api` and caches at
 * the edge. Every other path on pharmacycommons.org still comes from GitHub
 * Pages, because the Worker route is only /api/*.
 *
 * Design and switch-over steps: docs/machine-readable-api.md, "Serving from
 * pharmacycommons.org". Deploy notes: workers/api-proxy/README.md.
 *
 * Plain types on purpose: this folder is outside the site's tsconfig, so it does
 * not need @cloudflare/workers-types to deploy.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const ORIGIN = 'https://nenwovhyrdcdkhxzjiiv.supabase.co/functions/v1/api'

// Headers worth forwarding to the function. Nothing else leaves the edge:
// no cookies, no Authorization, no client IP headers.
const FORWARD_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'if-none-match',
  'if-modified-since',
  'origin',
  'access-control-request-method',
  'access-control-request-headers',
]

// Edge cache lifetime in seconds by status. -1 means do not cache.
const CACHE_TTL_BY_STATUS: Record<string, number> = {
  '200-299': 300, // 5 minutes
  '404': 60, // 1 minute
  '410': 3600, // 1 hour
  '500-599': -1, // never cache server errors
}

const ALLOWED_METHODS = 'GET, HEAD, OPTIONS'

function methodNotAllowed(): Response {
  return new Response(JSON.stringify({ error: 'method_not_allowed', allowed: ALLOWED_METHODS }), {
    status: 405,
    headers: {
      allow: ALLOWED_METHODS,
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    },
  })
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
      return methodNotAllowed()
    }

    // /api, /api/, /api/v1/... -> <ORIGIN>, <ORIGIN>/, <ORIGIN>/v1/...
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 })
    }
    const rest = url.pathname.slice('/api'.length)
    const target = ORIGIN + rest + url.search

    const headers = new Headers()
    for (const name of FORWARD_REQUEST_HEADERS) {
      const value = request.headers.get(name)
      if (value) headers.set(name, value)
    }

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      redirect: 'manual',
      // Cloudflare-specific fetch options. Preflight responses are not cached.
      cf:
        request.method === 'OPTIONS'
          ? { cacheTtl: -1 }
          : { cacheEverything: true, cacheTtlByStatus: CACHE_TTL_BY_STATUS },
    } as RequestInit)

    // Pass the function's response through unchanged (body, ETag, Link, CORS,
    // Cache-Control); a Response copy makes the headers mutable if ever needed.
    return new Response(upstream.body, upstream)
  },
}
