// GENERATED from src/pageSource/prose.ts by scripts/sync-page-source.mjs — do not edit here.
/**
 * Checks one stretch of prose (the lead, or text inside a section) and pulls out
 * what it links to, the values it pulls in, and what it cites.
 *
 * Uses the CommonMark parser itself (mdast-util-from-markdown), so "is this raw
 * HTML?" means exactly what the renderer would treat as HTML: `<b>` and
 * `<!-- -->` are HTML, `eGFR <30`, `a < b` and `<https://…>` autolinks are not.
 * Text inside code spans and code blocks is ignored, so `<b>` or `[[x]]` can be
 * shown literally.
 */

import { fromMarkdown } from 'npm:mdast-util-from-markdown@2.0.3'
import { findCitations } from './citations.ts'
import { tokenizeWiki } from './wiki.ts'
import type { Diagnostic, Extracted, Location } from './types.ts'

/** Minimal structural mdast shape (mdast types are a transitive dependency only). */
type MdNode = {
  type: string
  value?: string
  children?: MdNode[]
  position?: { start: { line: number; column: number } }
}

const SKIP = new Set(['code', 'inlineCode'])

/** Markdown equivalents for the HTML people paste most. */
const HTML_HINTS: { test: RegExp; message: string }[] = [
  { test: /^<\/?(b|strong)\b/i, message: 'Use **bold** instead of <b> or <strong>.' },
  { test: /^<\/?(i|em)\b/i, message: 'Use *italic* instead of <i> or <em>.' },
  { test: /^<br\b/i, message: 'Leave a blank line for a new paragraph instead of <br>.' },
  { test: /^<\/?a\b/i, message: 'Use [text](https://…) for a web link or [[page]] for a page here, instead of <a>.' },
  { test: /^<\/?(table|tr|td|th|thead|tbody)\b/i, message: 'Use a Markdown table (| a | b |) instead of HTML table tags.' },
  { test: /^<\/?(sup|sub)\b/i, message: 'Write it plainly (mg/m2, CO2) instead of <sup>/<sub>. Citations use [@key].' },
  { test: /^<\/?(ul|ol|li)\b/i, message: 'Use - or 1. at the start of a line for lists instead of HTML list tags.' },
  { test: /^<\/?(h[1-6])\b/i, message: 'Use ## Heading instead of HTML heading tags.' },
  { test: /^<\/?(p|div|span)\b/i, message: 'Leave a blank line between paragraphs; HTML layout tags aren’t needed.' },
  { test: /^<!--/, message: 'HTML comments aren’t allowed. Put notes for other editors in the edit summary.' },
]

export function htmlMessage(html: string): string {
  const trimmed = html.trim()
  const hint = HTML_HINTS.find(h => h.test.test(trimmed))
  return hint ? `Raw HTML isn't allowed. ${hint.message}` : "Raw HTML isn't allowed. Use Markdown instead."
}

function firstTag(html: string): string {
  const m = /<!--|<\/?[A-Za-z][A-Za-z0-9-]*/.exec(html)
  return m ? m[0] : html.trim().slice(0, 20)
}

export type ProseResult = { diagnostics: Diagnostic[]; extracted: Extracted }

/**
 * @param markdown  the prose
 * @param lineOfRel maps a 1-based line within the prose to its source line
 * @param location  where it sits on the page ('lead' or a section id/heading)
 */
export function analyzeProse(markdown: string, lineOfRel: (rel: number) => number, location: Location): ProseResult {
  const diagnostics: Diagnostic[] = []
  const extracted: Extracted = { links: [], properties: [], citations: [] }
  if (!markdown.trim()) return { diagnostics, extracted }

  const tree = fromMarkdown(markdown) as MdNode
  const lineOf = (node: MdNode) => lineOfRel(node.position?.start.line ?? 1)
  const htmlLines = new Set<number>()

  const walk = (node: MdNode) => {
    if (SKIP.has(node.type)) return
    if (node.type === 'html') {
      // One error per line: <b>x</b> is two HTML nodes but one mistake.
      const line = lineOf(node)
      if (!htmlLines.has(line)) {
        htmlLines.add(line)
        diagnostics.push({ severity: 'error', code: 'raw_html', message: htmlMessage(firstTag(node.value ?? '')), line })
      }
      return
    }
    if (node.type === 'heading' && (node as MdNode & { depth?: number }).depth === 1) {
      diagnostics.push({
        severity: 'error',
        code: 'h1_not_allowed',
        message: 'The page title is the only # heading. Use ## for a section or ### inside one.',
        line: lineOf(node),
      })
    }
    if (node.type === 'text' && typeof node.value === 'string') {
      const text = node.value
      const line = lineOf(node)
      if (text.includes('[[') || text.includes('{{')) {
        for (const t of tokenizeWiki(text)) {
          if (t.kind === 'link') extracted.links.push({ target: t.target, location })
          if (t.kind === 'property') extracted.properties.push({ key: t.key, target: t.target, location })
        }
      }
      if (text.includes('[@')) {
        for (const found of findCitations(text)) {
          for (const c of found.citations) extracted.citations.push({ ...c, location })
          for (const p of found.problems) {
            diagnostics.push({ severity: 'error', code: 'bad_citation', message: p.message, line })
          }
        }
      }
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  return { diagnostics, extracted }
}

/** Checks a single block value (one line) for HTML, the same way prose is checked. */
export function htmlInValue(value: string): string | null {
  if (!value.includes('<')) return null
  const tree = fromMarkdown(value) as MdNode
  let found: string | null = null
  const walk = (node: MdNode) => {
    if (found || SKIP.has(node.type)) return
    if (node.type === 'html') {
      found = htmlMessage(firstTag(node.value ?? ''))
      return
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  return found
}
