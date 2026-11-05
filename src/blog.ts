/**
 * Blog post loading.
 *
 * Posts are plain markdown files in src/content/posts/. Adding a post means
 * adding one file — no code change, no rebuild of any index. Vite globs them
 * at build time and inlines the raw text, so there is no runtime fetch and no
 * dependency on Supabase.
 *
 * Front matter is YAML between --- fences. It is parsed at build time (the
 * `?fm` import, src/frontmatterParse.ts: the same parser the legal pages and the
 * sitemap script use), so no YAML library ships to the browser. Keys read: title, slug,
 * date (yyyy-mm-dd), author, summary, tags (a list, or "a, b"), draft.
 * Anything else is ignored.
 */

import { readFlag, readIsoDate, readList, readText } from './frontmatter'
import type { FrontmatterResult } from './frontmatter'

export type Post = {
  slug: string
  title: string
  date: string // ISO yyyy-mm-dd
  author: string
  summary: string
  tags: string[]
  draft: boolean
  body: string
  readingMinutes: number
  file: string
}

const FILES = import.meta.glob<FrontmatterResult>('./content/posts/*.md', {
  query: '?fm',
  import: 'default',
  eager: true,
})

function slugFromPath(path: string): string {
  const base = path.split('/').pop() ?? ''
  return base
    .replace(/\.md$/, '')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '') // drop the date prefix used for file ordering
}

/** Exported for tests. */
export function buildPost(path: string, { meta, body }: FrontmatterResult): Post {
  const words = body.split(/\s+/).filter(Boolean).length

  return {
    slug: readText(meta, 'slug') ?? slugFromPath(path),
    title: readText(meta, 'title') ?? slugFromPath(path),
    date: readIsoDate(meta, 'date') ?? '',
    author: readText(meta, 'author') ?? 'Joshua Semock, PharmD',
    summary: readText(meta, 'summary') ?? '',
    tags: readList(meta, 'tags'),
    draft: readFlag(meta, 'draft'),
    body,
    readingMinutes: Math.max(1, Math.round(words / 220)),
    file: path,
  }
}

const ALL: Post[] = Object.entries(FILES)
  .map(([path, fm]) => buildPost(path, fm))
  .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

/** Published posts, newest first. Drafts are visible in dev only. */
export function listPosts(): Post[] {
  return import.meta.env.DEV ? ALL : ALL.filter(p => !p.draft)
}

export function getPost(slug: string): Post | undefined {
  return listPosts().find(p => p.slug === slug)
}

export function allTags(): string[] {
  const seen = new Set<string>()
  for (const post of listPosts()) for (const tag of post.tags) seen.add(tag)
  return [...seen].sort()
}

/** "September 14, 2026" from an ISO date, parsed as local to avoid UTC drift. */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}
