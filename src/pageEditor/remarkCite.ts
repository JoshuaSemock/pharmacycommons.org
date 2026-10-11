/**
 * remark plugin: `[@key]` / `[@a; @b]` in page text become spans that
 * WikiMarkdown renders as numbered reference marks (docs/page-editor.md §6).
 * Text inside code spans and code blocks is left alone. Keys are normalised
 * the same way the parser stores them (lower-case DOIs and set ids), so they
 * match the numbers in the reference list.
 */

import { CITATION_PATTERN, isProblem, parseCitationKey } from '../pageSource/citations'

type MdNode = {
  type: string
  value?: string
  children?: MdNode[]
  data?: { hName?: string; hProperties?: Record<string, string>; [key: string]: unknown }
}

const SKIP = new Set(['code', 'inlineCode', 'html'])

export function citeKeys(body: string): string[] {
  return body
    .split(';')
    .map(p => p.trim().replace(/^@/, ''))
    .filter(Boolean)
    .map(raw => {
      const c = parseCitationKey(raw)
      return isProblem(c) ? raw : c.key
    })
}

function split(text: string): MdNode[] {
  const out: MdNode[] = []
  let last = 0
  for (const m of text.matchAll(CITATION_PATTERN)) {
    const at = m.index ?? 0
    if (at > last) out.push({ type: 'text', value: text.slice(last, at) })
    out.push({
      type: 'wikiCite',
      data: { hName: 'span', hProperties: { 'data-pc-cite': citeKeys(m[1]).join(' ') } },
      children: [{ type: 'text', value: m[0] }],
    })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) })
  return out
}

function walk(node: MdNode): void {
  if (!node.children || SKIP.has(node.type)) return
  const next: MdNode[] = []
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('[@')) next.push(...split(child.value))
    else {
      walk(child)
      next.push(child)
    }
  }
  node.children = next
}

export function remarkCite() {
  return (tree: MdNode) => {
    walk(tree)
  }
}
