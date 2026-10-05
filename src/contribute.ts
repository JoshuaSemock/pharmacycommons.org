/**
 * Pharmacy Commons — contributing (phase 15)
 *
 * Who may edit, and the calls that write. Every write is a SECURITY DEFINER
 * RPC that re-checks the caller itself (db/phase15_community_editing.sql);
 * the checks here only decide what the page offers, never what is allowed.
 *
 * Design: docs/user-edits.md.
 */

import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export type ContributorStatus =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'unverified' }
  | { kind: 'blocked' }
  | { kind: 'ready'; handle: string | null; displayCredential: boolean; patroller: boolean }

/** What the signed-in user can do on community pages. Re-runs when `userId` changes. */
export function useContributorStatus(userId: string | null, sessionLoading: boolean): ContributorStatus {
  const [status, setStatus] = useState<ContributorStatus>({ kind: 'loading' })

  useEffect(() => {
    if (sessionLoading) {
      setStatus({ kind: 'loading' })
      return
    }
    if (!userId) {
      setStatus({ kind: 'signed-out' })
      return
    }
    let cancelled = false
    setStatus({ kind: 'loading' })
    loadStatus()
      .then(s => {
        if (!cancelled) setStatus(s)
      })
      .catch(err => {
        console.error('Failed to load contributor status', err)
        if (!cancelled) setStatus({ kind: 'unverified' })
      })
    return () => {
      cancelled = true
    }
  }, [userId, sessionLoading])

  return status
}

async function loadStatus(): Promise<ContributorStatus> {
  const [verified, patroller, profile, blocked] = await Promise.all([
    supabase.rpc('is_verified_contributor'),
    supabase.rpc('has_role', { p_role: 'patroller' }),
    supabase.from('contributor_profiles').select('handle, display_credential').maybeSingle(),
    supabase.from('contributor_blocks').select('expires_at').maybeSingle(),
  ])
  for (const r of [verified, patroller, profile, blocked]) if (r.error) throw new Error(r.error.message)

  if (verified.data !== true) {
    const block = blocked.data as { expires_at: string | null } | null
    const activeBlock = block && (block.expires_at === null || new Date(block.expires_at) > new Date())
    return activeBlock ? { kind: 'blocked' } : { kind: 'unverified' }
  }
  const p = profile.data as { handle: string; display_credential: boolean } | null
  return {
    kind: 'ready',
    handle: p?.handle ?? null,
    displayCredential: p?.display_credential ?? true,
    patroller: patroller.data === true,
  }
}

export const HANDLE_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/

export async function setContributorHandle(handle: string, displayCredential: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_contributor_handle', {
    p_handle: handle,
    p_display_credential: displayCredential,
  })
  if (error) throw new ContributeError(error.message, error.code)
}

export type SaveResult = { revisionId: number }

export async function savePage(input: {
  pcid: number
  baseRevisionId: number | null
  description: string
  body: string
  summary: string
}): Promise<SaveResult> {
  const { data, error } = await supabase.rpc('save_page', {
    p_pcid: input.pcid,
    p_base_revision_id: input.baseRevisionId,
    p_description: input.description,
    p_body_md: input.body,
    p_summary: input.summary,
  })
  if (error) throw new ContributeError(error.message, error.code)
  return { revisionId: Number(data) }
}

/** Raised by the write RPCs; `reason` is the exception text the RPC raised (e.g. 'edit_conflict'). */
export class ContributeError extends Error {
  reason: string
  code: string | undefined
  constructor(reason: string, code?: string) {
    super(contributeErrorMessage(reason, code))
    this.reason = reason
    this.code = code
  }
}

/** Plain-language message for an RPC exception. */
export function contributeErrorMessage(reason: string, code?: string): string {
  switch (reason) {
    case 'not_verified':
      return 'Editing needs a verified NPI. Verify on your account page, then try again.'
    case 'handle_required':
      return 'Choose a public handle before your first edit.'
    case 'summary_required':
      return 'Add a short edit summary describing what you changed.'
    case 'too_long':
      return 'That’s longer than a page allows (2,000 characters for the description, 200,000 for the text).'
    case 'rate_limited':
      return 'You’ve made a lot of edits in the last hour. Please wait a little and try again.'
    case 'protected':
      return 'This page is locked to reviewers right now.'
    case 'edit_conflict':
      return 'Someone else saved this page while you were editing.'
    case 'no_such_page':
      return 'This page no longer exists.'
  }
  if (code === '23505') return 'That handle is taken. Try another.'
  if (code === '23514') return 'Handles are 3–30 letters, numbers, dots, dashes or underscores.'
  return 'The change couldn’t be saved. Please try again.'
}

/** A page suggestion for `[[` autocomplete. */
export type PageSuggestion = { slug: string; name: string; entityType: string }

const KIND_LABEL: Record<string, string> = {
  moiety: 'drug',
  combination: 'combination',
  precise_form: 'salt or form',
  formulation: 'brand',
  class: 'class',
  clinical: 'clinical concept',
  measurement: 'measurement',
  target: 'target',
  functional: 'herbal or biological',
  list: 'list',
}

export function kindLabel(entityType: string): string {
  return KIND_LABEL[entityType] ?? entityType
}

/** Pages whose name starts with `query` (then contains it), drugs first. */
export async function suggestPages(query: string, signal?: AbortSignal): Promise<PageSuggestion[]> {
  const q = query.trim().replace(/[%_\\]/g, '')
  if (q.length < 2) return []
  const query$ = (pattern: string) => {
    const b = supabase.from('entities').select('slug, name, entity_type').ilike('name', pattern).order('name').limit(8)
    return signal ? b.abortSignal(signal) : b
  }
  const [prefix, contains] = await Promise.all([query$(`${q}%`), query$(`%${q}%`)])
  if (prefix.error) throw new Error(prefix.error.message)
  if (contains.error) throw new Error(contains.error.message)
  const rows = [...(prefix.data ?? []), ...(contains.data ?? [])] as { slug: string; name: string; entity_type: string }[]
  const seen = new Set<string>()
  const out: PageSuggestion[] = []
  for (const r of rows) {
    if (seen.has(r.slug)) continue
    seen.add(r.slug)
    out.push({ slug: r.slug, name: r.name, entityType: r.entity_type })
  }
  const rank = (t: string) => (t === 'moiety' ? 0 : t === 'clinical' ? 1 : 2)
  return out.sort((a, b) => rank(a.entityType) - rank(b.entityType)).slice(0, 8)
}

/** The text to insert for a chosen suggestion: the slug is the stable target, the name the visible text. */
export function linkMarkup(s: PageSuggestion): string {
  return s.name.trim().toLowerCase() === s.slug ? `[[${s.slug}]]` : `[[${s.slug}|${s.name}]]`
}

/**
 * If the caret sits inside an unfinished `[[…` (no closing brackets, no newline
 * or `|` yet), returns the query typed so far and where it starts.
 */
export function openLinkQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const open = before.lastIndexOf('[[')
  if (open === -1) return null
  const typed = before.slice(open + 2)
  if (/[\]\n|[]/.test(typed) || typed.length > 60) return null
  return { start: open, query: typed }
}
