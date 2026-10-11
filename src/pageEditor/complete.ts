/**
 * Autocomplete for the page editor (docs/page-editor.md §4a). Given the text
 * and caret, says what is being typed and what can complete it:
 *
 *   [[met…        pages (looked up by the editor; see contribute.suggestPages)
 *   {{acb…        Quick Facts keys
 *   [@pm…         citation kinds, and sources already cited on this page
 *   :::ren…       structured blocks for this page type (line start)
 *   ::hie…        locked sections for this page type (line start)
 *   acb… inside :::infobox   Quick Facts keys at the start of a line
 */

import { findCitations, infoboxKeysFor, templateFor } from '../pageSource'
import type { PageContext } from '../pageSource'

export type Completion = {
  kind: 'page' | 'key' | 'cite' | 'block' | 'embed'
  /** Where the replaced text starts (the trigger, e.g. `[[`). */
  start: number
  query: string
  options: { label: string; insert: string; hint: string }[]
}

const CITE_KINDS = [
  { label: 'pmid:', hint: 'PubMed article by PMID' },
  { label: 'doi:', hint: 'Any article with a DOI' },
  { label: 'dailymed:', hint: 'FDA label by DailyMed set id' },
  { label: 'url:https://', hint: 'Any web page' },
]

function lineStart(text: string, caret: number): number {
  return text.lastIndexOf('\n', caret - 1) + 1
}

/** Name of the :::block the caret is inside, if any. */
function blockAt(text: string, caret: number): string | null {
  const before = text.slice(0, lineStart(text, caret)).split('\n')
  for (let i = before.length - 1; i >= 0; i--) {
    if (/^:::\s*$/.test(before[i])) return null
    const m = /^:::\s*([a-z][a-z0-9-]*)\s*$/i.exec(before[i])
    if (m) return m[1].toLowerCase()
  }
  return null
}

export function completionAt(text: string, caret: number, ctx: PageContext): Completion | null {
  const before = text.slice(0, caret)
  const lineFrom = lineStart(text, caret)
  const line = before.slice(lineFrom)

  let m = /\[\[([^\]\n|[]{0,60})$/.exec(before)
  if (m) return { kind: 'page', start: caret - m[0].length, query: m[1], options: [] }

  m = /\{\{([A-Za-z_]{0,40})$/.exec(before)
  if (m) {
    const q = m[1].toLowerCase()
    const options = infoboxKeysFor(ctx)
      .filter(k => k.key.startsWith(q))
      .map(k => ({ label: k.key, insert: `{{${k.key}}}`, hint: k.label }))
    return { kind: 'key', start: caret - m[0].length, query: m[1], options }
  }

  m = /\[@([^\]\n;]{0,80})$/.exec(before)
  if (m) {
    const q = m[1].toLowerCase()
    const used = [...new Set(findCitations(text).flatMap(f => f.citations.map(c => c.key)))]
    const options = [
      ...used.filter(k => k.toLowerCase().startsWith(q) && k.toLowerCase() !== q).map(k => ({ label: k, insert: `[@${k}]`, hint: 'Cited on this page' })),
      ...CITE_KINDS.filter(k => k.label.startsWith(q) || q === '').map(k => ({ label: k.label, insert: `[@${k.label}`, hint: k.hint })),
    ]
    return { kind: 'cite', start: caret - m[0].length, query: m[1], options }
  }

  // At least one letter: a bare ::: closes a block, and Enter there must start a new line.
  m = /^:::([a-z-]{1,30})$/i.exec(line)
  if (m) {
    const q = m[1].toLowerCase()
    const options = ctx.registry.blocks
      .filter(b => b.enabled && b.page_types.includes(ctx.pageType) && b.name.startsWith(q))
      .map(b => ({ label: `:::${b.name}`, insert: `:::${b.name}\n\n:::`, hint: b.label }))
    return { kind: 'block', start: lineFrom, query: m[1], options }
  }

  m = /^::([a-z-]{1,30})$/i.exec(line)
  if (m) {
    const q = m[1].toLowerCase()
    const t = templateFor(ctx)
    const names = [...t.rail, ...t.main.flatMap(i => (i.kind === 'embed' ? [i.name] : []))]
    const options = ctx.registry.embeds
      .filter(e => names.includes(e.name) && e.name.startsWith(q))
      .map(e => ({ label: `::${e.name}`, insert: `::${e.name}`, hint: e.label }))
    return { kind: 'embed', start: lineFrom, query: m[1], options }
  }

  if (blockAt(text, caret) === 'infobox') {
    m = /^([a-z_]{1,30})$/.exec(line)
    if (m) {
      const q = m[1]
      const options = infoboxKeysFor(ctx)
        .filter(k => k.key.startsWith(q) && k.key !== q)
        .map(k => ({ label: k.key, insert: `${k.key}: `, hint: `${k.label}${ctx.sourceValues[k.key] ? ` (source: ${ctx.sourceValues[k.key]})` : ''}` }))
      return { kind: 'key', start: lineFrom, query: q, options }
    }
  }
  return null
}

/** Applies a chosen option: returns the new text and caret. */
export function applyCompletion(text: string, caret: number, c: Completion, insert: string): { text: string; caret: number } {
  const next = text.slice(0, c.start) + insert + text.slice(caret)
  // Block skeletons put the caret on the empty line inside.
  const inside = insert.endsWith('\n\n:::') ? c.start + insert.length - 4 : c.start + insert.length
  return { text: next, caret: inside }
}
