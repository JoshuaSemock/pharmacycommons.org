/**
 * Blog post loading.
 *
 * Posts are plain markdown files in src/content/posts/. Adding a post means
 * adding one file — no code change, no rebuild of any index. Vite globs them
 * at build time and inlines the raw text, so there is no runtime fetch and no
 * dependency on Supabase.
 *
 * Frontmatter is a small YAML subset: `key: value` pairs between --- fences.
 * Supported keys are listed in PostMeta below; anything else is ignored.
 */

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

const FILES = import.meta.glob('./content/posts/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = FRONTMATTER.exec(raw)
  if (!match) return { meta: {}, body: raw.trim() }

  const meta: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx < 1) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    // Strip a single layer of matching quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    meta[key] = value
  }

  return { meta, body: raw.slice(match[0].length).trim() }
}

function parseList(value: string | undefined): string[] {
  if (!value) return []
  const inner = value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value
  return inner
    .split(',')
    .map(t => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
}

function slugFromPath(path: string): string {
  const base = path.split('/').pop() ?? ''
  return base
    .replace(/\.md$/, '')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '') // drop the date prefix used for file ordering
}

function buildPost(path: string, raw: string): Post {
  const { meta, body } = parseFrontmatter(raw)
  const words = body.split(/\s+/).filter(Boolean).length

  return {
    slug: meta.slug || slugFromPath(path),
    title: meta.title || slugFromPath(path),
    date: meta.date || '',
    author: meta.author || 'Joshua Semock, PharmD',
    summary: meta.summary || '',
    tags: parseList(meta.tags),
    draft: meta.draft === 'true',
    body,
    readingMinutes: Math.max(1, Math.round(words / 220)),
    file: path,
  }
}

const ALL: Post[] = Object.entries(FILES)
  .map(([path, raw]) => buildPost(path, raw))
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
