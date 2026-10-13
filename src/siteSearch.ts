/**
 * Site-wide search for the header box: every page a visitor might want, not
 * just drugs.
 *
 * Drugs, brands and concept pages are still found by `searchCatalog`
 * (src/catalog.ts). This module covers everything else, as a flat list of
 * entries (title, a hint line, where it goes, other names for it):
 *
 *   tools      from TOOLS in src/tools.ts, so a new tool turns up here the
 *              day it is live. Give it `keywords` for the other names people
 *              use ("dosing calculator" finds Days supply and quantity).
 *   pages      SITE_PAGES below: Browse, Topics, Blog, References, the legal
 *              pages and so on. A new page worth finding is one more line.
 *   lists      every published list (list_lists), by title and description
 *   classes    every classification with members (list_classes), by name and code
 *   blog       every published post, by title, tag and summary
 *
 * The heavy sources (the post files, the lists and classes RPCs) are imported
 * lazily by `loadSiteEntries`, so none of it is in the first-load bundle; the
 * search itself is pure and tested without a network.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { TOOLS, isActive } from './tools'

export type SiteKind = 'tool' | 'page' | 'list' | 'class' | 'blog'

export type SiteEntry = {
  id: string
  kind: SiteKind
  title: string
  /** The line under the title in the results. */
  hint: string
  to: string
  /** Other names for it, matched like the title but a little lower. */
  keywords: string[]
  /** Extra text matched only when nothing else does (a list's description). */
  body?: string
}

export type SiteHit = SiteEntry & { score: number }

export const KIND_LABEL: Record<SiteKind, string> = {
  tool: 'Tools',
  page: 'Pages',
  list: 'Lists',
  class: 'Classifications',
  blog: 'Blog',
}

/** Tie-break when scores match: tools and pages before the long tails. */
const KIND_ORDER: Record<SiteKind, number> = { tool: 0, page: 1, list: 2, blog: 3, class: 4 }

// ─────────────────────────────────────────────────────────────────────────────
// Static entries
// ─────────────────────────────────────────────────────────────────────────────

/** Pages that are not tools. Add a line here when a page is worth finding by search. */
export const SITE_PAGES: SiteEntry[] = [
  { id: 'page-browse', kind: 'page', title: 'Drugs A to Z', hint: 'Browse every drug by name', to: '/browse', keywords: ['browse', 'drug index', 'all drugs', 'alphabetical', 'monographs'] },
  { id: 'page-topics', kind: 'page', title: 'Topics', hint: 'Conditions, labs, targets and herbals', to: '/topics', keywords: ['conditions', 'diseases', 'adverse reactions', 'lab tests', 'labs', 'targets', 'herbals', 'botanicals', 'supplements', 'concepts'] },
  { id: 'page-lists', kind: 'page', title: 'Lists', hint: 'Curated and authority drug lists', to: '/lists', keywords: ['drug lists', 'compare lists'] },
  { id: 'page-classifications', kind: 'page', title: 'Classifications', hint: 'ATC, FDA, VA, ChemOnt and contributor classes', to: '/classifications', keywords: ['classes', 'drug classes', 'categories', 'atc', 'pharmacologic class', 'mechanism of action', 'compare classes'] },
  { id: 'page-tools', kind: 'page', title: 'All tools', hint: 'Calculators, lists and reference tools', to: '/tools', keywords: ['calculators', 'tools'] },
  { id: 'page-blog', kind: 'page', title: 'Blog', hint: 'Posts from the Commons', to: '/blog', keywords: ['posts', 'news', 'articles', 'updates', 'whats new'] },
  { id: 'page-about', kind: 'page', title: 'About', hint: 'What Pharmacy Commons is', to: '/about', keywords: ['about us', 'mission', 'who we are', 'contact'] },
  { id: 'page-references', kind: 'page', title: 'References', hint: 'Every source and citation', to: '/references', keywords: ['sources', 'citations', 'source datasets', 'bibliography', 'guidelines'] },
  { id: 'page-resources', kind: 'page', title: 'Resources', hint: 'Outside links worth knowing', to: '/resources', keywords: ['links', 'external resources', 'outside links'] },
  { id: 'page-new', kind: 'page', title: 'Create a page', hint: 'Start a page for a topic, class or herbal', to: '/new', keywords: ['new page', 'add a page', 'contribute', 'write a page', 'start a page'] },
  { id: 'page-account', kind: 'page', title: 'Account', hint: 'Sign in, saved items and your contributions', to: '/account', keywords: ['sign in', 'log in', 'login', 'register', 'sign up', 'profile', 'saved drugs', 'bookmarks', 'my contributions', 'npi', 'verify'] },
  { id: 'page-terms', kind: 'page', title: 'Terms of use', hint: 'The rules for using the site', to: '/terms', keywords: ['terms and conditions', 'tos', 'legal'] },
  { id: 'page-disclaimer', kind: 'page', title: 'Medical disclaimer', hint: 'What the site is and is not for', to: '/disclaimer', keywords: ['disclaimer', 'medical advice', 'legal'] },
  { id: 'page-privacy', kind: 'page', title: 'Privacy', hint: 'What we collect and what we do not', to: '/privacy', keywords: ['privacy policy', 'data protection', 'cookies', 'legal'] },
  { id: 'page-licensing', kind: 'page', title: 'Data licensing', hint: 'How the data may be reused', to: '/licensing', keywords: ['license', 'licence', 'cc0', 'gpl', 'open data', 'provenance', 'legal'] },
]

/** Live tools with a page on this site. Tools that open off the site (the raw API) are left to the Developers page. */
function toolEntries(): SiteEntry[] {
  return TOOLS.filter(t => isActive(t) && t.to).map(t => ({
    id: `tool-${t.id}`,
    kind: 'tool' as const,
    title: t.name,
    hint: t.summary ?? 'Tool',
    to: t.to as string,
    keywords: t.keywords ?? [],
    body: t.blurb,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching
// ─────────────────────────────────────────────────────────────────────────────

/** Lowercase words; "days" and "day" are the same word. */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
}

/** 3 = same words, 2 = starts with the query, 1 = every query word starts a word, 0 = no. */
function tier(field: string[], q: string[]): 0 | 1 | 2 | 3 {
  if (field.length === 0 || q.length === 0) return 0
  const fj = field.join(' ')
  const qj = q.join(' ')
  if (fj === qj) return 3
  if (fj.startsWith(qj)) return 2
  return q.every(w => field.some(f => f.startsWith(w))) ? 1 : 0
}

/** Scores 0–100: title > keyword > description. Exact title 100, exact keyword 92. */
export function scoreEntry(entry: SiteEntry, query: string): number {
  const q = tokens(query)
  if (q.length === 0) return 0
  let best = 0
  const t = tier(tokens(entry.title), q)
  if (t) best = [0, 70, 90, 100][t]
  for (const k of entry.keywords) {
    const kt = tier(tokens(k), q)
    if (kt) best = Math.max(best, [0, 60, 80, 92][kt])
  }
  if (best === 0 && q.join('').length >= 3) {
    const hint = tier(tokens(entry.hint), q)
    if (hint) best = 30
    else if (entry.body && q.every(w => tokens(entry.body as string).some(f => f.startsWith(w)))) best = 20
  }
  return best
}

/** Best entries first. Ties go to tools and pages, then the shorter title. */
export function searchSite(entries: SiteEntry[], query: string, limit = 12): SiteHit[] {
  if (tokens(query).join('').length < 2) return []
  const hits: SiteHit[] = []
  for (const e of entries) {
    const score = scoreEntry(e, query)
    if (score > 0) hits.push({ ...e, score })
  }
  return hits
    .sort((a, b) => b.score - a.score || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.length - b.title.length)
    .slice(0, limit)
}

/** An exact title or keyword (or a title that starts with the query): safe to jump straight to on Enter. */
export const STRONG_SCORE = 90

// ─────────────────────────────────────────────────────────────────────────────
// Grouping for the dropdown
// ─────────────────────────────────────────────────────────────────────────────

export type ResultGroup<T> = { key: string; label: string; best: number; items: T[] }

/**
 * Groups site hits by kind, with the drug results as one more group, ordered
 * by the best score in each group. `drugBest` is how well the top drug matched
 * (0 when there are none); `perGroup` caps the site groups.
 */
export function groupHits(hits: SiteHit[], drugBest: number, perGroup = 3): { site: ResultGroup<SiteHit>[]; drugsFirst: boolean } {
  const byKind = new Map<SiteKind, SiteHit[]>()
  for (const h of hits) {
    const list = byKind.get(h.kind) ?? []
    if (list.length < perGroup) list.push(h)
    byKind.set(h.kind, list)
  }
  const site = [...byKind.entries()]
    .map(([kind, items]) => ({ key: kind, label: KIND_LABEL[kind], best: items[0].score, items }))
    .sort((a, b) => b.best - a.best || KIND_ORDER[a.key as SiteKind] - KIND_ORDER[b.key as SiteKind])
  return { site, drugsFirst: drugBest >= (site[0]?.best ?? 0) }
}

/** How well the top drug result matches what was typed: 100 exact, 85 starts with it, 50 otherwise. */
export function drugScore(name: string, brand: string | undefined, query: string): number {
  const q = tokens(query).join(' ')
  if (!q) return 0
  let best = 50
  for (const n of [name, brand]) {
    if (!n) continue
    const t = tokens(n).join(' ')
    if (t === q) return 100
    if (t.startsWith(q)) best = Math.max(best, 85)
  }
  return best
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

let pending: Promise<SiteEntry[]> | null = null

const settle = async <T>(p: Promise<T[]>, label: string): Promise<T[]> => {
  try {
    return await p
  } catch (err) {
    console.warn(`[site search] ${label} unavailable`, err)
    return []
  }
}

/**
 * Every entry, fetched once per visit. Lists, classes and posts that fail to
 * load are left out; the tools and pages are always there.
 */
export function loadSiteEntries(): Promise<SiteEntry[]> {
  if (!pending) {
    const lists = settle(
      import('./api').then(async ({ listLists }) =>
        (await listLists()).map(l => ({
          id: `list-${l.slug}`,
          kind: 'list' as const,
          title: l.title,
          hint: l.parent_slug ? 'List (part of a larger list)' : `List · ${l.item_count.toLocaleString('en-US')} ${l.term_count ? 'entries' : 'drugs'}`,
          to: `/lists/${l.slug}`,
          keywords: [],
          body: l.description ?? undefined,
        })),
      ),
      'lists',
    )
    const classes = settle(
      import('./classifications').then(async ({ loadAllClasses, systemBadge }) =>
        (await loadAllClasses()).map(c => ({
          id: `class-${c.slug}`,
          kind: 'class' as const,
          title: c.name,
          hint: `${systemBadge(c.class_type)}${c.source_code ? ` · ${c.source_code}` : ''} · ${c.member_count.toLocaleString('en-US')} drugs`,
          to: `/classifications/${c.slug}`,
          keywords: c.source_code ? [c.source_code] : [],
        })),
      ),
      'classes',
    )
    const posts = settle(
      import('./blog').then(({ listPosts }) =>
        listPosts()
          .filter(p => !p.draft)
          .map(p => ({
            id: `blog-${p.slug}`,
            kind: 'blog' as const,
            title: p.title,
            hint: p.summary || 'Blog post',
            to: `/blog/${p.slug}`,
            keywords: p.tags,
          })),
      ),
      'blog',
    )
    pending = Promise.all([lists, classes, posts]).then(([l, c, b]) => [...toolEntries(), ...SITE_PAGES, ...l, ...b, ...c])
  }
  return pending
}

/** The entries that need no network, for the first keystroke before the rest arrive. */
export const staticEntries = (): SiteEntry[] => [...toolEntries(), ...SITE_PAGES]
