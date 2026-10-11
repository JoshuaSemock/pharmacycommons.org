// GENERATED from src/wiki.ts by scripts/sync-page-source.mjs — do not edit here.
/**
 * Pharmacy Commons — wiki syntax inside community page text
 *
 * Contributors write markdown plus two extras (docs/user-edits.md §4 and §6):
 *
 *   [[metformin]]              link to another page (slug, name or PCID-n)
 *   [[metformin|Glucophage]]   same, with different link text
 *   {{acb_score}}              a property of this page, live from the database
 *   {{acb_score:amitriptyline}} a property of another page
 *
 * The database parses the same patterns on every save (refresh_page_links in
 * db/phase15_community_editing.sql) and stores what each link and property
 * points at, so the page never resolves names itself: it looks the key up in
 * what the database stored. `linkKey` and `propertyKey` must stay in step
 * with that SQL: lower-cased, trimmed, text before the first `|`.
 *
 * `remarkWiki` turns the patterns into inline nodes that render as <span>s
 * carrying data attributes; WikiMarkdown.tsx maps those spans to links and
 * value chips. Text inside code spans and code blocks is left alone, so
 * `[[x]]` can be shown literally in a code span.
 */

/** Same patterns as refresh_page_links(): link body up to 200 chars, no brackets or newlines. */
const WIKI_PATTERN = /\[\[([^[\]\n]{1,200})\]\]|\{\{([A-Za-z][A-Za-z0-9_]*)(?::([^{}\n]{1,200}))?\}\}/g

export type WikiToken =
  | { kind: 'text'; value: string }
  | { kind: 'link'; target: string; label: string }
  | { kind: 'property'; key: string; target: string }

/** The key the database stores a link under (page_links.target_text). */
export function linkKey(target: string): string {
  return target.split('|')[0].trim().toLowerCase()
}

/** The key the database stores a property reference under: `key|target`, target '' for this page. */
export function propertyKey(key: string, target: string): string {
  return `${key.toLowerCase()}|${target.trim().toLowerCase()}`
}

/** Splits plain text into text, link and property tokens. */
export function tokenizeWiki(text: string): WikiToken[] {
  const out: WikiToken[] = []
  let last = 0
  for (const m of text.matchAll(WIKI_PATTERN)) {
    const at = m.index ?? 0
    if (at > last) out.push({ kind: 'text', value: text.slice(last, at) })
    if (m[1] !== undefined) {
      const [rawTarget, ...rest] = m[1].split('|')
      const target = rawTarget.trim()
      const label = rest.join('|').trim() || target
      if (target) out.push({ kind: 'link', target, label })
      else out.push({ kind: 'text', value: m[0] })
    } else {
      out.push({ kind: 'property', key: m[2].toLowerCase(), target: (m[3] ?? '').trim() })
    }
    last = at + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) })
  return out
}

// ─── remark plugin ────────────────────────────────────────────────────────────
//
// Minimal local mdast shapes: mdast/unist types are only transitive
// dependencies here, so they are described structurally instead of imported.

type MdNode = {
  type: string
  value?: string
  children?: MdNode[]
  data?: { hName?: string; hProperties?: Record<string, string>; [key: string]: unknown }
}

/** Node types whose text must not be touched. */
const SKIP = new Set(['code', 'inlineCode', 'html', 'math', 'inlineMath'])

function toNodes(tokens: WikiToken[]): MdNode[] {
  return tokens.map((t): MdNode => {
    if (t.kind === 'text') return { type: 'text', value: t.value }
    if (t.kind === 'link') {
      return {
        type: 'wikiLink',
        data: { hName: 'span', hProperties: { 'data-pc-link': t.target } },
        children: [{ type: 'text', value: t.label }],
      }
    }
    return {
      type: 'wikiProperty',
      data: { hName: 'span', hProperties: { 'data-pc-prop': t.key, 'data-pc-target': t.target } },
      children: [{ type: 'text', value: `{{${t.key}${t.target ? `:${t.target}` : ''}}}` }],
    }
  })
}

function walk(node: MdNode): void {
  if (!node.children || SKIP.has(node.type)) return
  const next: MdNode[] = []
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string' && /\[\[|\{\{/.test(child.value)) {
      next.push(...toNodes(tokenizeWiki(child.value)))
    } else {
      walk(child)
      next.push(child)
    }
  }
  node.children = next
}

/** remark plugin: `[[…]]` and `{{…}}` in text become link / property spans. */
export function remarkWiki() {
  return (tree: MdNode) => {
    walk(tree)
  }
}

// ─── Where a page lives ───────────────────────────────────────────────────────

/** Route for an entity. Classes and lists have their own pages; everything else uses the drug page. */
export function entityHref(entityType: string | null | undefined, slug: string): string {
  if (entityType === 'class') return `/classifications/${slug}`
  if (entityType === 'list') return `/lists/${slug}`
  return `/drugs/${slug}`
}

/** The create-page form, prefilled with a red link's target (the part before any `|`). */
export function newPageHref(target: string): string {
  let name = target.split('|')[0].trim()
  // A slug-style target ("lactic-acidosis") reads better as words.
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(name)) name = name.replace(/-/g, ' ')
  return name ? `/new?name=${encodeURIComponent(name)}` : '/new'
}
