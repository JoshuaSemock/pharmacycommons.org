/**
 * A contributor's own work, new-page patrol and admin tools (phase 15g,
 * db/phase15g_contributions_admin.sql, docs/user-edits.md §9).
 *
 * Every call is an RPC that re-checks the caller in the database; what the
 * page shows only decides which buttons appear.
 */

import { supabase } from './supabaseClient'
import { ContributeError } from './contribute'

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new ContributeError(error.message, error.code)
  return data as T
}

// ─── My contributions ─────────────────────────────────────────────────────────

export type Contribution = {
  kind: 'page' | 'fact' | 'new_page'
  item_id: number
  pcid: number
  slug: string
  name: string
  entity_type: string
  property_key: string | null
  summary: string | null
  created_at: string
  patrol_status: 'unpatrolled' | 'patrolled' | 'reverted' | 'pending' | 'rejected' | 'merged'
  review_note: string | null
  is_live: boolean
}

export function getMyContributions(limit = 200): Promise<Contribution[]> {
  return call<Contribution[] | null>('my_contributions', { p_limit: limit }).then(r => r ?? [])
}

/** One plain-language status for a contribution. */
export function contributionStatus(c: Pick<Contribution, 'kind' | 'patrol_status' | 'is_live'>): string {
  switch (c.patrol_status) {
    case 'pending':
      return 'Waiting for review'
    case 'rejected':
      return 'Not accepted'
    case 'reverted':
      return 'Undone'
    case 'merged':
      return 'Merged into another page'
    case 'patrolled':
      return c.kind === 'new_page' ? 'Page reviewed' : c.is_live ? 'Live · reviewed' : 'Reviewed · since replaced'
    case 'unpatrolled':
      return c.kind === 'new_page' ? 'Page live · not yet reviewed' : c.is_live ? 'Live · not yet reviewed' : 'Since replaced'
  }
}

export type ContributionCounts = { total: number; live: number; pending: number; rejected: number; pages: number }

export function countContributions(rows: Contribution[]): ContributionCounts {
  return {
    total: rows.length,
    live: rows.filter(r => r.is_live && r.patrol_status !== 'pending' && r.patrol_status !== 'rejected').length,
    pending: rows.filter(r => r.patrol_status === 'pending').length,
    rejected: rows.filter(r => r.patrol_status === 'rejected').length,
    pages: rows.filter(r => r.kind === 'new_page').length,
  }
}

// ─── New pages (review queue) ─────────────────────────────────────────────────

export type NewPage = {
  pcid: number
  slug: string
  name: string
  entity_type: string
  created_at: string
  patrol_status: string
  handle: string
  credential: string | null
}

export function getNewPagesQueue(limit = 100): Promise<NewPage[]> {
  return call<NewPage[] | null>('new_pages_queue', { p_limit: limit, p_unpatrolled_only: true }).then(r => r ?? [])
}

export function patrolNewPage(pcid: number): Promise<void> {
  return call<null>('patrol_new_page', { p_pcid: pcid }).then(() => undefined)
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export type Role = 'patroller' | 'admin'

export type AdminContributor = {
  user_id: string
  handle: string
  credential: string | null
  verified: boolean
  roles: Role[]
  blocked: boolean
  block_reason: string | null
  block_expires_at: string | null
  edits: number
  last_edit_at: string | null
}

export function findContributors(query: string, limit = 50): Promise<AdminContributor[]> {
  return call<AdminContributor[] | null>('admin_contributors', { p_query: query.trim() || null, p_limit: limit }).then(
    r => r ?? [],
  )
}

export function grantRole(userId: string, role: Role): Promise<void> {
  return call<null>('grant_role', { p_user_id: userId, p_role: role }).then(() => undefined)
}

export function revokeRole(userId: string, role: Role): Promise<void> {
  return call<null>('revoke_role', { p_user_id: userId, p_role: role }).then(() => undefined)
}

/** `days` null blocks until lifted. */
export function blockContributor(userId: string, reason: string, days: number | null): Promise<void> {
  const expires = days === null ? null : new Date(Date.now() + days * 86_400_000).toISOString()
  return call<null>('block_contributor', { p_user_id: userId, p_reason: reason, p_expires_at: expires }).then(
    () => undefined,
  )
}

export function unblockContributor(userId: string): Promise<void> {
  return call<null>('unblock_contributor', { p_user_id: userId }).then(() => undefined)
}

export type Protection = 'open' | 'reviewed' | 'patrollers'

export const PROTECTION_LABEL: Record<Protection, string> = {
  open: 'Open: edits go live, then get reviewed',
  reviewed: 'Reviewed: edits wait for a reviewer',
  patrollers: 'Locked: reviewers only',
}

export function setPageProtection(pcid: number, protection: Protection): Promise<void> {
  return call<null>('set_page_protection', { p_pcid: pcid, p_protection: protection }).then(() => undefined)
}

export type ProtectedPage = { pcid: number; protection: Protection; slug: string; name: string; entityType: string }

/** Pages with protection above 'open', by name. page_content is public. */
export async function getProtectedPages(): Promise<ProtectedPage[]> {
  const { data, error } = await supabase
    .from('page_content')
    .select('pcid, protection, page:entities!page_content_pcid_fkey(slug, name, entity_type)')
    .neq('protection', 'open')
    .limit(1000)
  if (error) throw new Error(error.message)
  type Row = { pcid: number; protection: Protection; page: { slug: string; name: string; entity_type: string } | null }
  return ((data ?? []) as unknown as Row[])
    .map(r => ({
      pcid: r.pcid,
      protection: r.protection,
      slug: r.page?.slug ?? '',
      name: r.page?.name ?? `PCID-${r.pcid}`,
      entityType: r.page?.entity_type ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Plain-language message for an admin/patrol RPC failure. */
export function adminErrorMessage(err: unknown): string {
  const reason = err instanceof ContributeError ? err.reason : ''
  switch (reason) {
    case 'not_admin':
      return 'Only admins can do that.'
    case 'not_patroller':
      return 'Only reviewers can do that.'
    case 'not_verified':
      return 'Roles can only go to contributors with a verified NPI.'
    case 'cannot_revoke_own_admin':
      return 'You can’t remove your own admin role.'
    case 'cannot_patrol':
      return 'Already reviewed, or it’s your own page (another reviewer has to check it).'
  }
  return 'That didn’t work. Please try again.'
}

/** True once the signed-in user is confirmed to hold the admin role. */
export async function isAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_role', { p_role: 'admin' })
  if (error) return false
  return data === true
}
