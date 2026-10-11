// GENERATED from src/pageSource/publish.ts by scripts/sync-page-source.mjs — do not edit here.
/**
 * What publish-page sends to publish_page() (db/phase16b_publish.sql), built
 * from a merged, validated page model. Also used by the page renderer, so the
 * reference numbers readers see are the ones the database stores.
 */

import { analyzeProse } from './prose.ts'
import { serializeMain } from './serialize.ts'
import { formatCitations, parseCitationKey, isProblem, findCitations } from './citations.ts'
import type { BrandLine, Citation, Extracted, InfoboxLine, PageModel, ThresholdLine } from './types.ts'
import type { SourceMeta } from './resolve.ts'

/** Every distinct citation, in the order a reader meets it: brands, Quick Facts, lead, then the main column. */
export function citationOrder(model: PageModel): Citation[] {
  const seen = new Map<string, Citation>()
  const add = (cs: Citation[]) => cs.forEach(c => seen.has(c.key) || seen.set(c.key, c))
  for (const l of model.brands?.lines ?? []) if (l.action !== 'source') add(l.citations)
  for (const l of model.infobox?.lines ?? []) add(l.citations)
  for (const item of model.main) {
    if (item.kind === 'lead') add(analyzeProse(item.markdown, n => n, 'lead').extracted.citations)
    if (item.kind !== 'section') continue
    for (const part of item.parts) {
      if (part.kind === 'prose') add(analyzeProse(part.markdown, n => n, item.id ?? '').extracted.citations)
      else for (const l of part.block.lines) add(l.citations)
    }
  }
  return [...seen.values()]
}

/**
 * The community layer as text, for history diffs: Quick Facts overrides, brand
 * changes, the lead and the main column. No ingested values, so an FDA reload
 * never shows up as a change.
 */
export function serializeCommunity(model: PageModel): string {
  const out: string[] = []
  const brandLines = (model.brands?.lines ?? []).filter(l => l.action !== 'source')
  if (brandLines.length) {
    out.push(
      [
        ':::brands',
        ...brandLines.map(l =>
          l.action === 'hide' ? `~~${l.brand}~~ ${formatCitations(l.citations)} ${l.reason}` : `${l.brand} ${formatCitations(l.action === 'add' ? l.citations : [])}`,
        ),
        ':::',
      ].join('\n'),
    )
  }
  if (model.infobox?.lines.length) {
    out.push(
      [':::infobox', ...model.infobox.lines.map(l => `${l.key}: ${l.isNull ? '[NONE]' : (l.value ?? '')} ${formatCitations(l.citations)}`), ':::'].join('\n'),
    )
  }
  for (const item of model.main) {
    const s = serializeMain(item)
    if (s !== null) out.push(s)
  }
  return `${out.join('\n\n')}\n`
}

/** Everything after the lead, for readers that still use page_content.body_md. */
export function bodyMarkdown(model: PageModel): string {
  return model.main
    .filter(m => m.kind !== 'lead')
    .map(serializeMain)
    .filter((s): s is string => s !== null)
    .join('\n\n')
}

export type PublishPayload = {
  summary: string
  kind: 'edit' | 'create' | 'revert'
  model: PageModel
  source_md: string
  description: string
  body_md: string
  extracted: { links: { target: string }[]; properties: { key: string; target: string }[]; citations: { key: string; location: string }[] }
  changed_sections: string[]
  citations: SourceMeta[]
}

export function buildPayload(args: {
  model: PageModel
  extracted: Extracted
  changed: string[]
  summary: string
  kind?: 'edit' | 'create' | 'revert'
  sources: Map<string, SourceMeta>
}): PublishPayload {
  const lead = args.model.main.find(m => m.kind === 'lead')
  const order = citationOrder(args.model)
  const missing = order.filter(c => !args.sources.has(c.key))
  if (missing.length) throw new Error(`No source metadata for ${missing.map(c => c.key).join(', ')}`)
  return {
    summary: args.summary.trim(),
    kind: args.kind ?? 'edit',
    model: args.model,
    source_md: serializeCommunity(args.model),
    description: lead && lead.kind === 'lead' ? lead.markdown : '',
    body_md: bodyMarkdown(args.model),
    extracted: {
      links: args.extracted.links.map(l => ({ target: l.target })),
      properties: args.extracted.properties.map(p => ({ key: p.key, target: p.target })),
      citations: args.extracted.citations.map(c => ({ key: c.key, location: c.location })),
    },
    changed_sections: args.changed,
    citations: order.map(c => args.sources.get(c.key) as SourceMeta),
  }
}

// ─── Current structured state from the database ───────────────────────────────

/** A citation column as stored ("[@pmid:1][@doi:…]", or free text from the phase-15 editors). */
export function citationsFromText(text: string): Citation[] {
  const found = findCitations(text).flatMap(f => f.citations)
  if (found.length) return found
  // Phase-15 rows hold free text ("Boustani 2008"). Kept as written so the editor
  // shows it and asks for a proper key on the next edit of that line.
  const raw = text.trim()
  const parsed = parseCitationKey(raw)
  return [isProblem(parsed) ? { kind: 'ref', id: raw, key: raw } : parsed]
}

export type InfoboxRow = { property_key: string; value: string | null; is_null_override: boolean; citation: string }
export type BrandRow = { brand_key: string; brand_display: string; action: 'add' | 'hide' | 'clear'; citation: string; summary: string }
export type ThresholdRow = {
  block_name: string
  measure: string
  comparator: ThresholdLine['comparator']
  low: number | null
  high: number | null
  action: string
  citations: string[]
}

/**
 * Lays the live community rows over a revision's model, so the editor opens on
 * what readers see even if a phase-15 per-row editor changed something since.
 */
export function overlayStructured(
  model: PageModel,
  rows: { infobox: InfoboxRow[]; brands: BrandRow[]; thresholds: ThresholdRow[] },
  sourceBrands: string[],
  infoboxOrder: string[],
): PageModel {
  const infobox: InfoboxLine[] = rows.infobox
    .filter(r => r.value !== null || r.is_null_override)
    .map(r => ({ key: r.property_key, value: r.is_null_override ? null : r.value, isNull: r.is_null_override, citations: citationsFromText(r.citation) }))
    .sort((a, b) => infoboxOrder.indexOf(a.key) - infoboxOrder.indexOf(b.key))

  const byKey = new Map(rows.brands.filter(r => r.action !== 'clear').map(r => [r.brand_key.toUpperCase(), r]))
  const brands: BrandLine[] = sourceBrands.map(name => {
    const r = byKey.get(name.toUpperCase())
    return r && r.action === 'hide'
      ? { action: 'hide' as const, brand: name, reason: r.summary, citations: citationsFromText(r.citation) }
      : { action: 'source' as const, brand: name }
  })
  for (const r of rows.brands) {
    if (r.action === 'add') brands.push({ action: 'add', brand: r.brand_display, citations: citationsFromText(r.citation) })
  }

  const main = model.main.map(item => {
    if (item.kind !== 'section') return item
    return {
      ...item,
      parts: item.parts.map(p => {
        if (p.kind !== 'block') return p
        const lines = rows.thresholds
          .filter(t => t.block_name === p.block.name)
          .map(t => ({
            measure: t.measure,
            comparator: t.comparator,
            low: t.low === null ? null : Number(t.low),
            high: t.high === null ? null : Number(t.high),
            action: t.action,
            citations: t.citations.flatMap(citationsFromText),
          }))
        return { ...p, block: { ...p.block, lines } }
      }),
    }
  })
  return {
    ...model,
    brands: model.brands || sourceBrands.length ? { name: 'brands', lines: brands } : null,
    infobox: model.infobox ? { name: 'infobox', lines: infobox } : model.infobox,
    main,
  }
}

