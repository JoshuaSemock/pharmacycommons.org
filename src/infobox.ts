/**
 * Community Quick Facts values (phase 15, docs/user-edits.md §5).
 *
 * A community value sits beside the source value (FDA label, list, record
 * attribute); it never replaces it in the database, and ingests never touch
 * it. Reads go through infobox_history() (handles, never author ids); writes
 * through edit_infobox / patrol_infobox_edit / review_infobox_edit.
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { ContributeError } from './contribute'
import { isAbort } from './drugPageData'

export type InfoboxKey =
  | 'indications'
  | 'dosing'
  | 'contraindications'
  | 'boxed_warning'
  | 'epc_class'
  | 'legal_status'
  | 'most_used'
  | 'do_not_crush'
  | 'acb_score'
  | 'qtc_risk'

/** Row names for Quick Facts keys, as shown in queues and contribution lists. */
export const INFOBOX_KEY_LABEL: Record<string, string> = {
  indications: 'Indications',
  dosing: 'Dosing',
  contraindications: 'Contraindications',
  boxed_warning: 'Boxed warning',
  epc_class: 'Pharmacologic class (FDA)',
  legal_status: 'Legal status',
  most_used: 'Most used',
  do_not_crush: 'Do not crush',
  acb_score: 'ACB score',
  qtc_risk: 'QTc risk',
}

export type InfoboxEdit = {
  id: number
  property_key: string
  value: string | null
  citation: string
  summary: string
  is_current: boolean
  created_at: string
  patrol_status: 'unpatrolled' | 'patrolled' | 'reverted' | 'pending' | 'rejected'
  review_note: string | null
  handle: string
  credential: string | null
}

export type InfoboxState = {
  /** All community edits for the page, newest first. */
  edits: InfoboxEdit[]
  /** The live community value for a key (null value = cleared, so not returned). */
  current: (key: string) => InfoboxEdit | null
  /** Edits waiting for review for a key. */
  pending: (key: string) => InfoboxEdit[]
  history: (key: string) => InfoboxEdit[]
}

export function toInfoboxState(edits: InfoboxEdit[]): InfoboxState {
  return {
    edits,
    current: key => edits.find(e => e.property_key === key && e.is_current && e.value !== null) ?? null,
    pending: key => edits.filter(e => e.property_key === key && e.patrol_status === 'pending'),
    history: key => edits.filter(e => e.property_key === key),
  }
}

export async function getInfobox(pcid: number, signal?: AbortSignal): Promise<InfoboxState> {
  const q = supabase.rpc('infobox_history', { p_pcid: pcid, p_key: null, p_limit: 500 })
  const { data, error } = await (signal ? q.abortSignal(signal) : q)
  if (error) throw new Error(error.message)
  return toInfoboxState((data ?? []) as InfoboxEdit[])
}

export type Protection = 'open' | 'reviewed' | 'patrollers'

export async function getProtection(pcid: number, signal?: AbortSignal): Promise<Protection> {
  const q = supabase.from('page_content').select('protection').eq('pcid', pcid)
  const { data, error } = await (signal ? q.abortSignal(signal) : q).maybeSingle()
  if (error) throw new Error(error.message)
  return ((data as { protection: Protection } | null)?.protection ?? 'open')
}

/** Community values and the page's protection level; `reload` refetches after an edit. */
export function useInfobox(pcidCode: string): { data: InfoboxState | null; protection: Protection; reload: () => void } {
  const [data, setData] = useState<InfoboxState | null>(null)
  const [protection, setProtection] = useState<Protection>('open')
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion(v => v + 1), [])

  useEffect(() => {
    const m = /^PCID-(\d+)$/.exec(pcidCode)
    if (!m) return
    const controller = new AbortController()
    getProtection(Number(m[1]), controller.signal)
      .then(setProtection)
      .catch(() => {})
    getInfobox(Number(m[1]), controller.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return
        // Community values are an overlay; if they fail to load, the source values still show.
        console.error(`Failed to load community Quick Facts for ${pcidCode}`, err)
        setData(toInfoboxState([]))
      })
    return () => controller.abort()
  }, [pcidCode, version])

  return { data, protection, reload }
}

async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new ContributeError(error.message, error.code)
  return data
}

/** Saves a community value. An empty `value` clears it, so the source value shows again. */
export async function editInfobox(input: {
  pcid: number
  key: string
  value: string
  citation: string
  summary: string
}): Promise<number> {
  return Number(
    await call('edit_infobox', {
      p_pcid: input.pcid,
      p_key: input.key,
      p_value: input.value,
      p_citation: input.citation,
      p_summary: input.summary,
    }),
  )
}

export async function patrolInfoboxEdit(id: number): Promise<void> {
  await call('patrol_infobox_edit', { p_edit_id: id })
}

export async function reviewInfoboxEdit(id: number, accept: boolean, note: string): Promise<void> {
  await call('review_infobox_edit', { p_edit_id: id, p_accept: accept, p_note: note || null })
}

/** True when a citation looks like a link we can open. */
export function citationHref(citation: string): string | null {
  const t = citation.trim()
  if (/^https?:\/\/\S+$/i.test(t)) return t
  const doi = /^(?:doi:\s*)?(10\.\d{4,9}\/\S+)$/i.exec(t)
  if (doi) return `https://doi.org/${doi[1]}`
  const pmid = /^PMID:?\s*(\d{4,9})$/i.exec(t)
  if (pmid) return `https://pubmed.ncbi.nlm.nih.gov/${pmid[1]}/`
  return null
}

/**
 * Drops values already contained in another, case-insensitively, so legal
 * status reads "Rx only (Legend)" rather than "Rx only (Legend); Legend".
 */
export function dedupeContained(values: string[]): string[] {
  const unique = values.filter((v, i) => values.findIndex(w => w.toLowerCase() === v.toLowerCase()) === i)
  return unique.filter(v => !unique.some(w => w !== v && w.toLowerCase().includes(v.toLowerCase())))
}

export type InfoboxQueueItem = InfoboxEdit & {
  pcid: number
  page: { slug: string; name: string; entityType: string } | null
}

/** Quick Facts changes waiting for a reviewer: held ones first, then unreviewed live ones. */
export async function getInfoboxQueue(limit = 100): Promise<InfoboxQueueItem[]> {
  const { data, error } = await supabase
    .from('infobox_edits')
    .select('id, pcid, page:entities!infobox_edits_pcid_fkey(slug, name, entity_type)')
    .in('patrol_status', ['pending', 'unpatrolled'])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  type Row = { id: number; pcid: number; page: { slug: string; name: string; entity_type: string } | null }
  const rows = (data ?? []) as unknown as Row[]

  // Full rows with handles come from infobox_history, one call per page.
  const byId = new Map<number, InfoboxEdit>()
  await Promise.all(
    [...new Set(rows.map(r => r.pcid))].map(async pcid => {
      for (const e of (await getInfobox(pcid)).edits) byId.set(e.id, e)
    }),
  )
  const items: InfoboxQueueItem[] = []
  for (const r of rows) {
    const e = byId.get(r.id)
    if (e)
      items.push({
        ...e,
        pcid: r.pcid,
        page: r.page ? { slug: r.page.slug, name: r.page.name, entityType: r.page.entity_type } : null,
      })
  }
  const rank = (s: string) => (s === 'pending' ? 0 : 1)
  return items.sort((a, b) => rank(a.patrol_status) - rank(b.patrol_status))
}
