/**
 * Concept pages (phase 15, docs/user-edits.md §7): indications, symptoms,
 * adverse effects, labs, targets, herbals. They share the drug route
 * (/drugs/:slug) but have no label, Quick Facts or hierarchy, so DrugDetail
 * renders a simpler layout for them, keyed on `block_kind`.
 */

import { supabase } from './supabaseClient'

/** Blocks that get the concept layout rather than the drug layout. */
export const CONCEPT_KINDS = ['clinical', 'measurement', 'target', 'functional'] as const

export function isConceptKind(blockKind: string | null | undefined): boolean {
  return (CONCEPT_KINDS as readonly string[]).includes(blockKind ?? '')
}

const KIND_TITLE: Record<string, string> = {
  clinical: 'Clinical concept',
  measurement: 'Lab test or measurement',
  target: 'Biological target',
  functional: 'Herbal or biological source',
}

/** Where the subtype lives in the record's humanized attributes. */
const SUBTYPE_ATTR: Record<string, string> = {
  clinical: 'Concept type',
  measurement: 'Measurement type',
  target: 'Target type',
  functional: 'Group type',
}

/**
 * The line under a concept's name: the subtype when recorded ("Indication",
 * "Serum Lab Panel"), else the block's title. 'Botanical source' reads as herbal.
 */
export function conceptKindLine(blockKind: string, attributes: Record<string, unknown> | undefined): string {
  const raw = attributes?.[SUBTYPE_ATTR[blockKind] ?? '']
  const sub = typeof raw === 'string' ? raw.trim() : ''
  if (blockKind === 'functional' && /^botanical/i.test(sub)) return 'Herbal or botanical source'
  if (sub) return sub.charAt(0).toUpperCase() + sub.slice(1)
  return KIND_TITLE[blockKind] ?? 'Page'
}

/** Attributes shown on a concept page, in order (labels from HUMANIZED_FIELDS in api.ts). */
export const CONCEPT_ATTRS = ['Units', 'Family', 'Genus', 'Species', 'Part used', 'Traditional use'] as const

/** "has_pgx_association" → "PGx association"; "treats" → "treats". */
export function predicateLabel(predicate: string): string {
  return predicate
    .replace(/^has_/, '')
    .replace(/_/g, ' ')
    .replace(/\bpgx\b/gi, 'PGx')
    .trim()
}

export type ConceptStatement = {
  id: number
  predicate: string
  qualifier: string | null
  source: string | null
  subject: { slug: string; name: string; entityType: string } | null
}

/** Statements whose object is this page ("metformin — side effect — lactic acidosis"), grouped by predicate later. */
export async function getStatementsAbout(pcid: number, signal?: AbortSignal): Promise<ConceptStatement[]> {
  const q = supabase
    .from('clinical_statements')
    .select(
      'statement_id, predicate, qualifier_value, source_agency, ' +
        'subject:entities!clinical_statements_subject_pcid_fkey(slug, name, entity_type)',
    )
    .eq('object_pcid', pcid)
    .order('predicate')
    .limit(500)
  const { data, error } = await (signal ? q.abortSignal(signal) : q)
  if (error) throw new Error(error.message)
  type Row = {
    statement_id: number
    predicate: string
    qualifier_value: string | null
    source_agency: string | null
    subject: { slug: string; name: string; entity_type: string } | null
  }
  return ((data ?? []) as unknown as Row[]).map(r => ({
    id: r.statement_id,
    predicate: r.predicate,
    qualifier: r.qualifier_value,
    source: r.source_agency,
    subject: r.subject ? { slug: r.subject.slug, name: r.subject.name, entityType: r.subject.entity_type } : null,
  }))
}

/** Groups statements by predicate, keeping first-seen order. */
export function groupByPredicate(rows: ConceptStatement[]): { predicate: string; rows: ConceptStatement[] }[] {
  const map = new Map<string, ConceptStatement[]>()
  for (const r of rows) {
    const list = map.get(r.predicate)
    if (list) list.push(r)
    else map.set(r.predicate, [r])
  }
  return [...map].map(([predicate, list]) => ({ predicate, rows: list }))
}
