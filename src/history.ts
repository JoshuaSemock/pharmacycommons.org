/**
 * Page history and review (phase 15, docs/user-edits.md §3 and §9).
 *
 * Reads: page_history() (handles and credential badges, never author ids)
 * and page_revisions' public columns. Writes: revert_page, patrol_revision,
 * accept_revision, reject_revision. The RPCs enforce who may do what; the
 * pages only decide which buttons to show.
 */

import { supabase } from './supabaseClient'
import { ContributeError } from './contribute'

export type HistoryEntry = {
  id: number
  created_at: string
  handle: string
  credential: string | null
  summary: string
  size_delta: number
  kind: 'create' | 'edit' | 'revert' | 'seed'
  patrol_status: 'unpatrolled' | 'patrolled' | 'reverted' | 'pending' | 'rejected'
}

export type Revision = {
  id: number
  pcid: number
  parent_id: number | null
  description: string
  body_md: string
  summary: string
  kind: HistoryEntry['kind']
  created_at: string
  patrol_status: HistoryEntry['patrol_status']
  patrolled_at: string | null
  review_note: string | null
}

const REVISION_COLUMNS =
  'id, pcid, parent_id, description, body_md, summary, kind, created_at, patrol_status, patrolled_at, review_note'

export type PageRef = { pcid: number; slug: string; name: string; entityType: string }

export async function getPageBySlug(slug: string): Promise<PageRef | null> {
  const { data, error } = await supabase.from('entities').select('pcid, slug, name, entity_type').eq('slug', slug).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? { pcid: data.pcid, slug: data.slug, name: data.name, entityType: data.entity_type } : null
}

export async function getHistory(pcid: number, limit = 200): Promise<HistoryEntry[]> {
  const { data, error } = await supabase.rpc('page_history', { p_pcid: pcid, p_limit: limit })
  if (error) throw new Error(error.message)
  return (data ?? []) as HistoryEntry[]
}

export async function getCurrentRevisionId(pcid: number): Promise<number | null> {
  const { data, error } = await supabase.from('page_content').select('current_revision_id').eq('pcid', pcid).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as { current_revision_id: number | null } | null)?.current_revision_id ?? null
}

export async function getRevision(id: number): Promise<Revision | null> {
  const { data, error } = await supabase.from('page_revisions').select(REVISION_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Revision | null) ?? null
}

export type QueueItem = Revision & { page: PageRef | null; handle: string; credential: string | null }

/**
 * Everything waiting for a reviewer: edits held on 'reviewed' pages first,
 * then live edits nobody has checked yet, newest first within each.
 */
export async function getReviewQueue(limit = 100): Promise<QueueItem[]> {
  const { data, error } = await supabase
    .from('page_revisions')
    .select(`${REVISION_COLUMNS}, page:entities!page_revisions_pcid_fkey(pcid, slug, name, entity_type)`)
    .in('patrol_status', ['pending', 'unpatrolled'])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)

  type Row = Revision & { page: { pcid: number; slug: string; name: string; entity_type: string } | null }
  const rows = (data ?? []) as unknown as Row[]

  // Authors come from page_history (handles only), one call per page in the queue.
  const authors = new Map<number, { handle: string; credential: string | null }>()
  await Promise.all(
    [...new Set(rows.map(r => r.pcid))].map(async pcid => {
      for (const h of await getHistory(pcid, 500)) authors.set(h.id, { handle: h.handle, credential: h.credential })
    }),
  )

  const items = rows.map(r => ({
    ...r,
    page: r.page ? { pcid: r.page.pcid, slug: r.page.slug, name: r.page.name, entityType: r.page.entity_type } : null,
    handle: authors.get(r.id)?.handle ?? 'unknown',
    credential: authors.get(r.id)?.credential ?? null,
  }))
  const rank = (s: string) => (s === 'pending' ? 0 : 1)
  return items.sort((a, b) => rank(a.patrol_status) - rank(b.patrol_status))
}

async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new ContributeError(error.message, error.code)
  return data
}

export async function revertPage(pcid: number, toRevisionId: number, summary: string): Promise<number> {
  return Number(await call('revert_page', { p_pcid: pcid, p_to_revision_id: toRevisionId, p_summary: summary || null }))
}

export async function patrolRevision(id: number): Promise<void> {
  await call('patrol_revision', { p_revision_id: id })
}

export async function acceptRevision(id: number, note: string): Promise<void> {
  await call('accept_revision', { p_revision_id: id, p_note: note || null })
}

export async function rejectRevision(id: number, note: string): Promise<void> {
  await call('reject_revision', { p_revision_id: id, p_note: note })
}

/** Plain-language messages for the review RPCs' exceptions. */
export function reviewErrorMessage(err: unknown): string {
  if (!(err instanceof ContributeError)) return err instanceof Error ? err.message : 'That didn’t work. Please try again.'
  switch (err.reason) {
    case 'not_patroller':
      return 'Only reviewers can do that.'
    case 'cannot_patrol':
      return 'This edit can’t be marked reviewed (it may be your own, or already reviewed).'
    case 'cannot_review_own':
      return 'You can’t review your own edit; another reviewer has to.'
    case 'not_pending':
      return 'This edit is no longer waiting for review.'
    case 'stale_revision':
      return 'Another change was accepted after this edit was written, so it no longer applies cleanly. Reject it with a note asking the author to redo it on the current text.'
    case 'note_required':
      return 'Add a note explaining why, so the author knows what to change.'
    case 'no_such_revision':
      return 'That revision can’t be restored.'
  }
  return err.message
}

export const STATUS_LABEL: Record<HistoryEntry['patrol_status'], string> = {
  unpatrolled: 'not yet reviewed',
  patrolled: 'reviewed',
  reverted: 'reverted',
  pending: 'waiting for review',
  rejected: 'rejected',
}
