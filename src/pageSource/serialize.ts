/**
 * PageModel → page source (docs/page-editor.md §4).
 *
 * This is what the editor opens. A page nobody has edited is serialized from
 * its type's template (templateModel), so every page starts from the same
 * layout. Source data never enters the model: Quick Facts source values and
 * source brands are written as `# source:` comments, which the parser ignores.
 *
 * parse(serialize(model)) gives back the same model (tested), so opening the
 * editor and publishing without changes is a no-op.
 */

import { formatCitations } from './citations'
import { infoboxKeysFor } from './blocks'
import { templateFor } from './parse'
import type { BrandsBlock, InfoboxBlock, MainItem, PageContext, PageModel, SectionPart, ThresholdLine } from './types'

const COMMENT_COL = 24
const MAX_COMMENT = 90

function comment(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > MAX_COMMENT ? `${one.slice(0, MAX_COMMENT - 1)}…` : one
}

function pad(left: string): string {
  return left.length >= COMMENT_COL ? `${left}  ` : left.padEnd(COMMENT_COL, ' ')
}

export function serializeBrands(block: BrandsBlock | null, ctx: PageContext): string[] {
  const lines = block?.lines ?? ctx.sourceBrands.map(b => ({ action: 'source' as const, brand: b }))
  const out = [':::brands']
  for (const l of lines) {
    if (l.action === 'source') out.push(`${pad(l.brand)}# source`)
    else if (l.action === 'hide') out.push(`~~${l.brand}~~ ${formatCitations(l.citations)} ${l.reason}`)
    else out.push(`${l.brand} ${formatCitations(l.citations)}`)
  }
  out.push(':::')
  return out
}

export function serializeInfobox(block: InfoboxBlock | null, ctx: PageContext): string[] {
  const byKey = new Map((block?.lines ?? []).map(l => [l.key, l]))
  const out = [':::infobox']
  for (const k of infoboxKeysFor(ctx)) {
    const l = byKey.get(k.key)
    const source = ctx.sourceValues[k.key]
    const note = `# source: ${comment(source ?? 'none')}`
    if (!l) {
      out.push(`${pad(`${k.key}:`)}${note}`)
    } else if (l.isNull) {
      out.push(`${k.key}: [NONE] ${formatCitations(l.citations)}  ${note}`)
    } else {
      out.push(`${k.key}: ${l.value ?? ''} ${formatCitations(l.citations)}  ${note}`)
    }
  }
  out.push(':::')
  return out
}

export function formatThreshold(l: ThresholdLine): string {
  let cond = ''
  if (l.comparator === 'range') cond = ` ${l.low}-${l.high}`
  else if (l.comparator !== 'any') cond = ` ${l.comparator} ${l.low}`
  return `${l.measure}${cond}: ${l.action} ${formatCitations(l.citations)}`
}

function serializePart(part: SectionPart): string {
  if (part.kind === 'prose') return part.markdown
  return [`:::${part.block.name}`, ...part.block.lines.map(formatThreshold), ':::'].join('\n')
}

function serializeMain(item: MainItem): string | null {
  if (item.kind === 'lead') return item.markdown || null
  if (item.kind === 'embed') return `::${item.name}`
  return [`## ${item.heading}`, ...item.parts.map(serializePart)].join('\n\n')
}

/** The whole page. */
export function serializePage(model: PageModel, ctx: PageContext): string {
  const template = templateFor(ctx)
  const chunks: string[] = [`# ${ctx.title}`]
  const railEmbeds: string[] = []
  for (const name of template.rail) {
    if (name === 'brands') chunks.push(serializeBrands(model.brands, ctx).join('\n'))
    else if (name === 'infobox') chunks.push(serializeInfobox(model.infobox, ctx).join('\n'))
    else railEmbeds.push(`::${name}`)
  }
  if (railEmbeds.length) chunks.push(railEmbeds.join('\n'))
  for (const item of model.main) {
    const s = serializeMain(item)
    if (s !== null) chunks.push(s)
  }
  return `${chunks.join('\n\n')}\n`
}

/** One section, as its [edit] link opens it. */
export function serializeFragment(model: PageModel, ctx: PageContext, target: { kind: 'lead' } | { kind: 'section'; heading: string } | { kind: 'rail'; name: 'infobox' | 'brands' }): string {
  if (target.kind === 'lead') {
    const lead = model.main.find(m => m.kind === 'lead')
    return `${lead && lead.kind === 'lead' ? lead.markdown : ''}\n`
  }
  if (target.kind === 'rail') {
    return `${(target.name === 'infobox' ? serializeInfobox(model.infobox, ctx) : serializeBrands(model.brands, ctx)).join('\n')}\n`
  }
  const section = model.main.find(m => m.kind === 'section' && m.heading.toLowerCase() === target.heading.toLowerCase())
  return `${section ? serializeMain(section) : `## ${target.heading}`}\n`
}

/** The model of a page nobody has edited: the type's template, empty. */
export function templateModel(ctx: PageContext): PageModel {
  const template = templateFor(ctx)
  const main: MainItem[] = template.main.map((t): MainItem => {
    if (t.kind === 'lead') return { kind: 'lead', id: 'lead', markdown: '' }
    if (t.kind === 'embed') return { kind: 'embed', id: t.name, name: t.name }
    const parts: SectionPart[] = t.block ? [{ kind: 'block', block: { name: t.block, grammar: 'threshold', lines: [] } }] : []
    return { kind: 'section', id: t.id, heading: t.heading, template: true, parts }
  })
  return {
    title: ctx.title,
    brands: template.rail.includes('brands') ? { name: 'brands', lines: ctx.sourceBrands.map(b => ({ action: 'source' as const, brand: b })) } : null,
    infobox: template.rail.includes('infobox') ? { name: 'infobox', lines: [] } : null,
    main,
  }
}
