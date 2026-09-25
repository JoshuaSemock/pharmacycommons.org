# Homepage performance, SEO and accessibility pass (2026-09-25)

Source: `db/Internet_Metrics_2026-09-25.txt` (PageSpeed Insights / Lighthouse 13.5,
Google Search Console, Palo Alto, Cisco Talos).

## Results

Live figures are from the PageSpeed report. "Local" figures are Lighthouse 13 run
against a production build served like GitHub Pages, with Google Fonts and Supabase
unreachable, so compare local before with local after, not with live.

| Homepage | Live before | Local before | Local after |
| --- | --- | --- | --- |
| Mobile performance | 48 | 59 | 89–90 |
| Desktop performance | 69 | 86 | 98 |
| Accessibility | 93 | 93 | 100 |
| Mobile LCP / TBT | 5.9 s / 790 ms | 8.7 s / 100 ms | 3.3 s / 20 ms |
| Entry JavaScript | 837 KB (242 KB gzip), one file | same | 45 KB app + 233 KB React + 215 KB Supabase, cached separately |

`/about` (lazy route): mobile 81, CLS 0.

## What changed and why

| Finding | Cause | Fix |
| --- | --- | --- |
| Render-blocking requests (2.1 s mobile) | Three Google Fonts `@import`s chained behind the main stylesheet | One combined request from `index.html`, preconnected, loaded as a non-blocking preload |
| Blank page until JS runs; crawlers see an empty `#root` | Client-only SPA | Static shell (hero + About summary) inside `#root`; React replaces it on mount |
| Unused JavaScript (165–576 KiB) | Every page compiled into one bundle | All routes except Home are `lazy()`; React and Supabase in their own vendor chunks |
| Total blocking time | Home fetched and indexed the ~15,600-row catalog on mount | Fetched when the visitor starts typing, like the header search |
| LCP 5.9 s | LCP element is the lichen background, found only after the CSS loads | WebP (85 KB mobile / 332 KB desktop, from 180 / 705 KB JPEG) in `public/textures/`, preloaded per breakpoint |
| Improve image delivery | 700 px logo shown at 20 px; 1 MB and 130 KB icons | `logo-40.png` in the nav; icons re-encoded (1,050 KB → 6 KB for 512 px) |
| 207 KB favicon | `favicon.svg` is a Canva export and browsers prefer SVG icons | Not linked; `favicon.ico` + 96 px PNG remain |
| Contrast (2.7:1) | `text-mint-600` on floral white | `text-mint-700` (5.0:1), per the "700+ for text" design rule |
| Touch target | Tools-menu chevron overlapped the Tools link (`-ml-2`) | Negative margin removed, 24 px minimum |
| Non-composited animation | `transition-all` on the autofocused search box | Transition removed |
| Missing source maps | — | `build.sourcemap: true` (the source is public anyway) |
| "No referring sitemaps" | No sitemap; `sitemap` script pointed at a missing file | `scripts/postbuild.mjs` writes `sitemap.xml`; `robots.txt` points to it |
| Deep links answered HTTP 404 with the homepage's title and canonical | GitHub Pages serves `404.html` for any path without a file | Postbuild writes `dist/<route>.html` per known route with its own head tags |
| Structured data | None | JSON-LD Organization, Person (founder), WebSite with SearchAction |
| Agentic browsing: llms.txt N/A | None | `public/llms.txt` |

## Not fixable on GitHub Pages

- **Cache lifetimes (883 KiB):** Pages sends `Cache-Control: max-age=600` for every
  file, including hashed assets. Only a CDN or host in front of the site (Cloudflare,
  Netlify) can set long `immutable` lifetimes.
- **Security headers (CSP, HSTS, COOP, XFO):** Pages cannot set response headers.
  A `<meta>` CSP is possible but would need testing against Supabase, Google Fonts
  and the inline scripts.

## Manual follow-ups

- Search Console: submit `https://pharmacycommons.org/sitemap.xml`.
- Cisco Talos: submit a content-categorization ticket for *Health and Medicine*.
- Palo Alto's "Newly-Registered-Domain" category clears itself 32 days after registration.
