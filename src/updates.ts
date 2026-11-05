/**
 * "What's new" — one entry per thing we ship, shown on the home page beside
 * blog posts in a single dated feed.
 *
 * Adding a feature: add one markdown file to src/content/updates/, named
 * yyyy-mm-dd-id.md. The front matter holds the entry's fields and the body is
 * its summary (one or two sentences, written for someone who has never used the
 * feature). Blog posts join the feed automatically from src/content/posts/, so
 * don't add them here.
 *
 *   ---
 *   id: network-compare            # defaults to the file name after the date
 *   date: 2026-11-03               # yyyy-mm-dd, the day it went live
 *   kind: Feature                  # Tool or Feature
 *   title: "Network: compare two to four drugs or classes"
 *   to: "/network/compare"         # the page the entry opens (starts with /)
 *   cta: "Try a comparison"        # optional link text
 *   detail: "..."                  # optional, shown when there is no summary
 *   order: 0                       # optional, orders entries that share a date (lower first)
 *   ---
 *   Pick two to four drugs and see what they share.
 *
 * Files are parsed at build time (the `?fm` import, src/frontmatterParse.ts), so
 * no YAML library ships to the browser. An entry that cannot be read is left out
 * of the feed, and src/updates.test.ts fails so it gets fixed.
 */

import { readText, readIsoDate } from './frontmatter'
import type { FrontmatterResult } from './frontmatter'
import { listPosts } from './blog'

export type UpdateKind = 'Tool' | 'Feature' | 'Blog post'

export type Update = {
  id: string
  /** ISO yyyy-mm-dd — the day it went live. */
  date: string
  kind: UpdateKind
  title: string
  summary: string
  to: string
  /** Link text; defaults by kind ("Open the tool", "Take a look", "Read the post"). */
  cta?: string
  /** Shown when there is no summary (blog posts without a `summary:` line). */
  detail?: string
  /** Orders entries that share a date, lower first. */
  order?: number
}

const FILES = import.meta.glob<FrontmatterResult>('./content/updates/*.md', {
  query: '?fm',
  import: 'default',
  eager: true,
})

const FILE_KINDS: readonly UpdateKind[] = ['Tool', 'Feature']

function idFromPath(path: string): string {
  const base = path.split('/').pop() ?? ''
  return base.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '')
}

/** Why an entry file cannot be used, or null. Exported for tests. */
export function updateProblem({ meta, error }: FrontmatterResult): string | null {
  if (error) return `front matter could not be read: ${error}`
  if (!readIsoDate(meta, 'date')) return 'date must be yyyy-mm-dd'
  if (!FILE_KINDS.includes(readText(meta, 'kind') as UpdateKind)) return 'kind must be Tool or Feature'
  if (!readText(meta, 'title')) return 'title is missing'
  if (!readText(meta, 'to')?.startsWith('/')) return 'to must be a path starting with /'
  return null
}

/** Exported for tests. Returns null for an entry that cannot be used. */
export function buildUpdate(path: string, fm: FrontmatterResult): Update | null {
  if (updateProblem(fm)) return null
  const { meta, body } = fm
  const order = Number(readText(meta, 'order') ?? 0)
  return {
    id: readText(meta, 'id') ?? idFromPath(path),
    date: readIsoDate(meta, 'date') as string,
    kind: readText(meta, 'kind') as UpdateKind,
    title: readText(meta, 'title') as string,
    summary: body,
    to: readText(meta, 'to') as string,
    cta: readText(meta, 'cta'),
    detail: readText(meta, 'detail'),
    order: Number.isFinite(order) ? order : 0,
  }
}

/** Newest first; entries that share a date by `order`, then id. */
export function byNewest(a: Update, b: Update): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return (a.order ?? 0) - (b.order ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

export const UPDATES: Update[] = Object.entries(FILES)
  .map(([path, fm]) => {
    const built = buildUpdate(path, fm)
    if (!built) console.warn(`[updates] ${path}: ${updateProblem(fm)}`)
    return built
  })
  .filter((u): u is Update => u !== null)
  .sort(byNewest)

const DEFAULT_CTA: Record<UpdateKind, string> = {
  Tool: 'Open the tool',
  Feature: 'Take a look',
  'Blog post': 'Read the post',
}

export const ctaFor = (u: Update): string => u.cta ?? DEFAULT_CTA[u.kind]

/** Features and published blog posts together, newest first. */
export function whatsNew(limit?: number): Update[] {
  const posts: Update[] = listPosts().map(p => ({
    id: `post:${p.slug}`,
    date: p.date,
    kind: 'Blog post',
    title: p.title,
    summary: p.summary,
    detail: `${p.readingMinutes} minute read`,
    to: `/blog/${p.slug}`,
  }))
  const all = [...UPDATES, ...posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return limit == null ? all : all.slice(0, limit)
}
