/**
 * Pharmacy Commons — post-build route pages, sitemap.xml
 *
 * Runs after `vite build` (see package.json "build"). GitHub Pages has no
 * server-side rewrites, so before this step every deep link (/about,
 * /drugs/metformin) was served by 404.html with HTTP status 404, carried the
 * homepage's <title> and canonical, and could not be indexed.
 *
 * For each known route this writes a copy of dist/index.html as
 * dist/<route>.html (and dist/<route>/index.html for routes with children),
 * with its own <title>, description, canonical and Open Graph tags, and a
 * small static shell showing the page heading. Pages serves /about from
 * about.html with status 200. React then boots and renders the real page.
 *
 * Then it writes dist/sitemap.xml listing those routes.
 *
 * Route sources:
 *   always   static routes below, blog posts (src/content/posts), lists (Supabase)
 *   opt-in   PRERENDER_ALL=1 adds every class (~4,900) and moiety (~15,600) page
 *
 * Network failures never fail the build: routes that need Supabase are
 * skipped with a warning and the rest still ship.
 *
 * Run with: node --experimental-strip-types scripts/postbuild.mjs
 * (the flag lets it import src/names.ts, so drug names display exactly as the app shows them)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatBrandName, formatDrugName } from '../src/names.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const SITE = 'https://pharmacycommons.org'
const SUPABASE_URL = 'https://nenwovhyrdcdkhxzjiiv.supabase.co'
// Public, RLS-scoped key; the same one shipped in src/supabaseClient.ts.
const SUPABASE_KEY = 'sb_publishable_n2bmQaOdwbOvqO1QhSuAgw_RxO-mLYQ'
const PRERENDER_ALL = process.env.PRERENDER_ALL === '1'

/** @typedef {{ path: string, title: string, description: string, heading?: string, lastmod?: string, index?: boolean, sitemap?: boolean }} Route */

/** @type {Route[]} */
const STATIC_ROUTES = [
  {
    path: '/browse',
    title: 'Browse the catalog',
    description: 'Browse every active ingredient in Pharmacy Commons from A to Z, with brand names, controlled-substance schedules and stable PCID identifiers.',
  },
  {
    path: '/classes',
    title: 'Drug classes',
    description: 'Pharmacologic, therapeutic and chemical drug classes from RxClass, ClassyFire and other public classification systems, each linked to its member drugs.',
  },
  {
    path: '/lists',
    title: 'Lists',
    description: 'Compendium lists of drugs, such as the most-used drugs in the US, MPJE testable drugs and do-not-crush lists, linked to Pharmacy Commons records.',
  },
  {
    path: '/lists/compare',
    title: 'Compare lists',
    description: 'Compare two drug lists side by side on Pharmacy Commons.',
    sitemap: false,
  },
  {
    path: '/about',
    title: 'About',
    heading: 'About Pharmacy Commons',
    description: 'Pharmacy Commons manages drug knowledge as a public commons: structured records from public and federal sources, each fact traceable to its source, free for people and machines to use.',
  },
  {
    path: '/tools',
    title: 'Tools',
    description: 'Free clinical calculators from Pharmacy Commons, starting with a creatinine clearance calculator.',
  },
  {
    path: '/tools/creatinine-clearance',
    title: 'Creatinine clearance calculator',
    description: 'Estimate creatinine clearance with the Cockcroft-Gault equation, with weight adjustments and medication dosing references.',
  },
  {
    path: '/resources',
    title: 'Resources',
    description: 'Public pharmacology and drug-information resources recommended by Pharmacy Commons.',
  },
  {
    path: '/citations',
    title: 'Citations',
    description: 'How to cite Pharmacy Commons records, and the public sources its data comes from.',
  },
  {
    path: '/blog',
    title: 'Community Commons Blog',
    description: 'Decisions, commentary and methodology from Pharmacy Commons, written down as the work happens.',
  },
  {
    path: '/account',
    title: 'Account',
    description: 'Sign in to Pharmacy Commons to save drugs and verify your provider status.',
    index: false,
    sitemap: false,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Route sources
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors src/blog.ts: frontmatter between --- fences, slug from the file name. */
function blogRoutes() {
  const dir = path.join(ROOT, 'src/content/posts')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(file => {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8')
      const meta = {}
      const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
      if (m) {
        for (const line of m[1].split(/\r?\n/)) {
          const i = line.indexOf(':')
          if (i < 1) continue
          meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, '$2')
        }
      }
      if (meta.draft === 'true') return null
      const slug = meta.slug || file.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '')
      const title = meta.title || slug
      return {
        path: `/blog/${slug}`,
        title,
        heading: title,
        description: meta.summary || `${title}, from the Pharmacy Commons blog.`,
        lastmod: /^\d{4}-\d{2}-\d{2}$/.test(meta.date ?? '') ? meta.date : undefined,
      }
    })
    .filter(Boolean)
}

/** PostgREST GET, paged 1,000 rows at a time. */
async function rest(pathAndQuery) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Range: `${from}-${from + 999}`,
      },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${pathAndQuery}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

async function listRoutes() {
  const rows = await rest('lists?select=slug,title,description,updated_at&order=slug')
  return rows.map(r => ({
    path: `/lists/${r.slug}`,
    title: r.title,
    heading: r.title,
    description: r.description || `${r.title}: a drug list on Pharmacy Commons, with each entry linked to its record.`,
    lastmod: r.updated_at ? String(r.updated_at).slice(0, 10) : undefined,
  }))
}

async function classRoutes() {
  const rows = await rest('rpc/list_classes?select=slug,name,class_type_label,member_count')
  return rows.map(r => ({
    path: `/classes/${r.slug}`,
    title: r.name,
    heading: r.name,
    description: `${r.name}${r.class_type_label ? ` (${r.class_type_label})` : ''}: ${r.member_count} member drug${r.member_count === 1 ? '' : 's'} on Pharmacy Commons, with links to the source classification.`,
  }))
}

async function drugRoutes() {
  const rows = await rest('catalog_entries?select=slug,name,primary_brand&entity_type=eq.moiety&order=pcid')
  return rows.map(r => {
    const name = formatDrugName(r.name)
    const brand = r.primary_brand ? formatBrandName(r.primary_brand) : ''
    return {
      path: `/drugs/${r.slug}`,
      title: brand ? `${name} (${brand})` : name,
      heading: name,
      description: `${name}${brand ? ` (${brand})` : ''}: identifiers, drug classes, FDA labeling and sources on Pharmacy Commons, a free, open pharmacology reference.`,
    }
  })
}

/** Runs a Supabase-backed source; on failure, warns and returns nothing. */
async function soft(label, fn) {
  try {
    const routes = await fn()
    console.log(`[postbuild] ${label}: ${routes.length}`)
    return routes
  } catch (err) {
    console.warn(`[postbuild] ${label} skipped: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML
// ─────────────────────────────────────────────────────────────────────────────

const esc = s =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function metaBlock(route) {
  const url = SITE + route.path
  const title = `${route.title} · Pharmacy Commons`
  return [
    '<!-- pc:meta -->',
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(route.description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(route.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    route.index === false ? '<meta name="robots" content="noindex" />' : '',
    '<!-- /pc:meta -->',
  ]
    .filter(Boolean)
    .join('\n    ')
}

/** Same header as the homepage shell; the body is just the page heading and summary. */
function shellBlock(route, homeShell) {
  const header = /<header[\s\S]*?<\/header>/.exec(homeShell)?.[0] ?? ''
  return `<!-- pc:shell -->
      <div id="pc-shell" class="page-background min-h-full">
        <div class="page-content flex min-h-screen flex-col">
          ${header}
          <main class="mx-auto max-w-page px-4 pt-10 pb-24 sm:px-6">
            <h1 class="max-w-4xl font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.015em] text-balance text-sage-900 sm:text-[2.618rem]">${esc(route.heading ?? route.title)}</h1>
            <p class="mt-5 max-w-[42rem] font-sans text-[17px] leading-relaxed text-pretty text-sage-600">${esc(route.description)}</p>
          </main>
        </div>
      </div>
      <!-- /pc:shell -->`
}

function between(html, name) {
  const re = new RegExp(`<!-- ${name} -->[\\s\\S]*?<!-- /${name} -->`)
  if (!re.test(html)) throw new Error(`index.html is missing the <!-- ${name} --> markers`)
  return re
}

function writeRoute(template, route, homeShell, parents) {
  const html = template
    .replace(between(template, 'pc:meta'), metaBlock(route))
    .replace(between(template, 'pc:shell'), shellBlock(route, homeShell))
  const rel = route.path.replace(/^\//, '')
  // Pages serves /about from about.html. A route that also has children
  // (/blog and /blog/x) gets blog/index.html as well, so it resolves whichever
  // way Pages treats the directory.
  const targets = [`${rel}.html`]
  if (parents.has(route.path)) targets.push(`${rel}/index.html`)
  for (const t of targets) {
    const file = path.join(DIST, t)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, html)
  }
}

function sitemap(routes) {
  const today = new Date().toISOString().slice(0, 10)
  const urls = [{ path: '/', lastmod: today }, ...routes.filter(r => r.sitemap !== false && r.index !== false)]
  const body = urls
    .map(
      r =>
        `  <url><loc>${esc(SITE + (r.path === '/' ? '/' : r.path))}</loc>${r.lastmod ? `<lastmod>${r.lastmod}</lastmod>` : ''}</url>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

// ─────────────────────────────────────────────────────────────────────────────

const indexFile = path.join(DIST, 'index.html')
if (!fs.existsSync(indexFile)) {
  console.error('[postbuild] dist/index.html not found. Run `vite build` first.')
  process.exit(1)
}
const template = fs.readFileSync(indexFile, 'utf8')
const homeShell = between(template, 'pc:shell').exec(template)[0]

const routes = [
  ...STATIC_ROUTES,
  ...blogRoutes(),
  ...(await soft('lists', listRoutes)),
  ...(PRERENDER_ALL ? await soft('classes', classRoutes) : []),
  ...(PRERENDER_ALL ? await soft('drugs', drugRoutes) : []),
]

// Never overwrite a real static page shipped from public/ (404.html, drug.html…).
const emitted = new Set(fs.readdirSync(path.join(ROOT, 'public')))
const seen = new Set()
const unique = routes.filter(r => {
  if (seen.has(r.path) || emitted.has(`${r.path.slice(1)}.html`)) return false
  seen.add(r.path)
  return true
})

const parents = new Set(unique.map(r => r.path.split('/').slice(0, -1).join('/')).filter(Boolean))
for (const route of unique) writeRoute(template, route, homeShell, parents)
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap(unique))

console.log(`[postbuild] wrote ${unique.length} route pages and sitemap.xml (${unique.filter(r => r.sitemap !== false && r.index !== false).length + 1} URLs)`)
