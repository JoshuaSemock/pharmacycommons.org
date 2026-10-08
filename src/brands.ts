/**
 * Community brand names (phase 15h, db/phase15h_brand_edits.sql).
 *
 * The source list (Drugs@FDA + RxNorm + workbook, via entity_brand_names) is
 * never changed. Contributors add a brand the sources lack, hide one that is
 * wrong for the page, or clear an earlier change. A hidden source brand stays
 * on the page under "Removed by contributors" with its reason, so the
 * disagreement is visible.
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { ContributeError } from './contribute'
import type { BrandName } from './api.generated'
import { isAbort } from './drugPageData'

export type BrandAction = 'add' | 'hide' | 'clear'

export type BrandEdit = {
  id: number
  pcid: number
  slug: string
  name: string
  entity_type: string
  brand_key: string
  brand_display: string
  action: BrandAction
  citation: string
  summary: string
  is_current: boolean
  created_at: string
  patrol_status: 'unpatrolled' | 'patrolled' | 'reverted' | 'pending' | 'rejected'
  review_note: string | null
  handle: string
  credential: string | null
}

/** Matches pc_brand_key() in the database. */
export function brandKey(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toUpperCase()
}

export type ShownBrand = BrandName & { added: BrandEdit | null }
export type BrandView = {
  /** Source brands not hidden, plus community additions, alphabetical. */
  shown: ShownBrand[]
  /** Source brands contributors hid, with the edit that hid them. */
  removed: { brand: BrandName; edit: BrandEdit }[]
  /** Changes waiting for a reviewer on this page. */
  pending: BrandEdit[]
}

/** Applies the current community decisions to the source list. */
export function applyBrandEdits(source: BrandName[], edits: BrandEdit[]): BrandView {
  const current = new Map<string, BrandEdit>()
  for (const e of edits) if (e.is_current && !current.has(e.brand_key)) current.set(e.brand_key, e)

  const shown: ShownBrand[] = []
  const removed: BrandView['removed'] = []
  const sourceKeys = new Set<string>()
  for (const b of source) {
    const key = brandKey(b.name)
    sourceKeys.add(key)
    const e = current.get(key)
    if (e?.action === 'hide') removed.push({ brand: b, edit: e })
    else shown.push({ ...b, added: null })
  }
  for (const e of current.values()) {
    if (e.action !== 'add' || sourceKeys.has(e.brand_key)) continue
    shown.push({ name: e.brand_display, marketed: null, appl_nos: [], rxcui: null, sources: [], added: e })
  }
  shown.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return { shown, removed, pending: edits.filter(e => e.patrol_status === 'pending') }
}

export async function getBrandEdits(pcid: number, signal?: AbortSignal): Promise<BrandEdit[]> {
  const q = supabase.rpc('brand_history', { p_pcid: pcid, p_queue_only: false, p_limit: 500 })
  const { data, error } = await (signal ? q.abortSignal(signal) : q)
  if (error) throw new Error(error.message)
  return (data ?? []) as BrandEdit[]
}

/** Community brand changes for a page; `reload` after an edit. Failure leaves the source list alone. */
export function useBrandEdits(pcidCode: string): { edits: BrandEdit[]; reload: () => void } {
  const [edits, setEdits] = useState<BrandEdit[]>([])
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion(v => v + 1), [])

  useEffect(() => {
    const m = /^PCID-(\d+)$/.exec(pcidCode)
    if (!m) return
    const controller = new AbortController()
    getBrandEdits(Number(m[1]), controller.signal)
      .then(setEdits)
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return
        console.error(`Failed to load community brand names for ${pcidCode}`, err)
        setEdits([])
      })
    return () => controller.abort()
  }, [pcidCode, version])

  return { edits, reload }
}

async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new ContributeError(error.message, error.code)
  return data
}

export async function editBrand(input: {
  pcid: number
  brand: string
  action: BrandAction
  citation: string
  summary: string
}): Promise<number> {
  return Number(
    await call('edit_brand', {
      p_pcid: input.pcid,
      p_brand: input.brand,
      p_action: input.action,
      p_citation: input.citation,
      p_summary: input.summary,
    }),
  )
}

export async function patrolBrandEdit(id: number): Promise<void> {
  await call('patrol_brand_edit', { p_edit_id: id })
}

export async function reviewBrandEdit(id: number, accept: boolean, note: string): Promise<void> {
  await call('review_brand_edit', { p_edit_id: id, p_accept: accept, p_note: note || null })
}

/** Brand changes waiting for a reviewer across all pages: held first. */
export async function getBrandQueue(limit = 200): Promise<BrandEdit[]> {
  const { data, error } = await supabase.rpc('brand_history', { p_pcid: null, p_queue_only: true, p_limit: limit })
  if (error) throw new Error(error.message)
  return (data ?? []) as BrandEdit[]
}

/** "added Glumetza" / "removed Fortamet" / "undid a change to Glumetza". */
export function brandActionText(action: BrandAction, brand: string): string {
  return action === 'add' ? `added ${brand}` : action === 'hide' ? `removed ${brand}` : `undid a change to ${brand}`
}

/** Messages for edit_brand refusals that aren't shared with other editors. */
export function brandErrorMessage(err: unknown): string {
  if (err instanceof ContributeError) {
    switch (err.reason) {
      case 'already_listed':
        return 'That brand is already listed for this page.'
      case 'not_a_source_brand':
        return 'Only brands from the listed sources can be removed. Use “Undo a change” for community additions.'
      case 'citation_required':
        return 'Give a source for the change (a Drugs@FDA or DailyMed link, a label, a reference).'
      case 'bad_name':
        return 'Brand names are 1–120 characters.'
    }
    return err.message
  }
  return 'The change couldn’t be saved. Please try again.'
}
