# pharmacycommons-api (Cloudflare Worker)

Serves `https://pharmacycommons.org/api/*` by forwarding to the Supabase Edge
Function `api` and caching at the edge. Decision: Joshua, 2026-09-28; design in
`docs/machine-readable-api.md` ("Serving from pharmacycommons.org").

| Request | Behaviour |
| --- | --- |
| GET / HEAD | Forwarded to `https://nenwovhyrdcdkhxzjiiv.supabase.co/functions/v1/api` + the path after `/api`; `Accept`, `If-None-Match`, `If-Modified-Since`, `Accept-Language` pass through |
| OPTIONS | Forwarded with the CORS preflight headers; never cached |
| anything else | `405` with `Allow: GET, HEAD, OPTIONS` |
| Edge cache | 2xx 5 min, 404 1 min, 410 1 hour, 5xx not cached |

No cookies, `Authorization` or client IP headers are forwarded; the function runs
with `verify_jwt = false`.

## Deploy (needs Joshua's Cloudflare login; not done from this repo)

1. `cd workers/api-proxy && npx wrangler login && npx wrangler deploy`
   (or paste `src/index.ts` into a Worker named `pharmacycommons-api` in the
   dashboard and add the two routes from `wrangler.toml`).
2. Check, before switching anything over:
   - `curl -i https://pharmacycommons.org/api/v1/search?q=metformin` returns JSON with `access-control-allow-origin`.
   - A record request returns an `etag`; repeating it with `If-None-Match: <etag>` returns `304`.
   - A retired PCID returns `410`.
   - `curl -i -H "Origin: https://example.com" -X OPTIONS https://pharmacycommons.org/api/v1/search` returns the CORS headers.
   - `https://pharmacycommons.org/` and `/browse` are still served by GitHub Pages.
3. Switch over (only after step 2 passes):
   - `update api_meta set value = 'https://pharmacycommons.org/api' where key = 'api_base';`
   - Supabase, Edge Functions, Secrets: `PC_API_BASE = https://pharmacycommons.org/api`
   - `src/developers/endpoints.ts`: `CURRENT_API_BASE = API_BASES.site`

`CURRENT_API_BASE` is deliberately **still** `API_BASES.supabase`: flipping it before
the Worker is live would break the Developers page console.
