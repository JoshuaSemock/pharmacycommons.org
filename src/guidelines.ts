/**
 * Pharmacy Commons — clinical practice guidelines linked to a drug
 *
 * Reads `entity_guidelines` (pcid → guideline, with a per-drug `context`
 * line and `sort_order`) joined to `guidelines` (title, organization, year,
 * URL, citation, `superseded_by`). Both tables are public-read under RLS.
 *
 * Guidelines are many-to-many with drugs: one guideline (e.g. ADA Standards
 * of Care) can be linked to every drug it covers, each with its own context
 * line ("Glycemic treatment of type 2 diabetes").
 */

import { supabase } from './supabaseClient'

export interface Guideline {
  guideline_id: number
  title: string
  short_title: string
  organization: string
  pub_year: number
  url: string
  citation: string | null
  /** Why this guideline matters for this drug, e.g. "Stroke prevention in atrial fibrillation". */
  context: string | null
  /** True when a newer guideline replaces this one (`superseded_by` is set). */
  superseded: boolean
}

type Row = {
  context: string | null
  sort_order: number
  guideline: {
    guideline_id: number
    title: string
    short_title: string
    organization: string
    pub_year: number
    url: string
    citation: string | null
    superseded_by: number | null
  } | null
}

/** Guidelines for a drug page, current ones first, then by sort_order and newest year. */
export async function getGuidelines(pcidCode: string): Promise<Guideline[]> {
  const m = /^PCID-(\d+)$/.exec(pcidCode)
  if (!m) return []

  const { data, error } = await supabase
    .from('entity_guidelines')
    .select(
      'context, sort_order, guideline:guidelines(guideline_id, title, short_title, organization, pub_year, url, citation, superseded_by)',
    )
    .eq('pcid', Number(m[1]))
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Failed to load guidelines for ${pcidCode}: ${error.message}`)

  // The untyped client can't infer the embed's shape; assert what the query returns.
  const rows = (data ?? []) as unknown as Row[]

  return rows
    .filter((r): r is Row & { guideline: NonNullable<Row['guideline']> } => r.guideline !== null)
    .map(r => ({
      guideline_id: r.guideline.guideline_id,
      title: r.guideline.title,
      short_title: r.guideline.short_title,
      organization: r.guideline.organization,
      pub_year: r.guideline.pub_year,
      url: r.guideline.url,
      citation: r.guideline.citation,
      context: r.context,
      superseded: r.guideline.superseded_by !== null,
      _sort: r.sort_order,
    }))
    .sort((a, b) => Number(a.superseded) - Number(b.superseded) || a._sort - b._sort || b.pub_year - a.pub_year)
    .map(({ _sort: _unused, ...g }) => g)
}
