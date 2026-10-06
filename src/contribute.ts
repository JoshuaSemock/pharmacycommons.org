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
  /** The RPC's DETAIL text, e.g. the PCID of an existing page for 'page_exists'. */
  detail: string | undefined
  constructor(reason: string, code?: string, detail?: string) {
    super(contributeErrorMessage(reason, code))
    this.reason = reason
    this.code = code
    this.detail = detail
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
    case 'page_exists':
      return 'A page with that name already exists.'
    case 'identifier_exists':
      return 'A page with that UNII or CAS number already exists.'
    case 'kind_not_creatable':
      return 'That kind of page can’t be created here.'
    case 'bad_name':
      return 'Give the page a name (up to 200 characters).'
  }
  if (code === '23505') return 'That handle is taken. Try another.'
  if (code === '23514') return 'Handles are 3–30 letters, numbers, dots, dashes or underscores.'
  return 'The change couldn’t be saved. Please try again.'
}

/** A page suggestion for `[[` autocomplete. */
export type PageSuggestion = { slug: string; name: string; entityType: string; pcid?: number }

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
    const b = supabase.from('entities').select('pcid, slug, name, entity_type').ilike('name', pattern).order('name').limit(8)
    return signal ? b.abortSignal(signal) : b
  }
  const [prefix, contains] = await Promise.all([query$(`${q}%`), query$(`%${q}%`)])
  if (prefix.error) throw new Error(prefix.error.message)
  if (contains.error) throw new Error(contains.error.message)
  const rows = [...(prefix.data ?? []), ...(contains.data ?? [])] as { pcid: number; slug: string; name: string; entity_type: string }[]
  const seen = new Set<string>()
  const out: PageSuggestion[] = []
  for (const r of rows) {
    if (seen.has(r.slug)) continue
    seen.add(r.slug)
    out.push({ slug: r.slug, name: r.name, entityType: r.entity_type, pcid: r.pcid })
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

// ─── New pages ────────────────────────────────────────────────────────────────

export type PageKindOption = {
  id: string
  label: string
  hint: string
  kind: 'moiety' | 'precise_form' | 'combination' | 'formulation' | 'clinical' | 'measurement' | 'target' | 'functional'
  /** clinical: concept_type; functional: group_type; measurement: chosen separately. */
  subtype?: string
  /** Drug kinds take UNII/CAS for the duplicate check. */
  identifiers?: boolean
  group: 'Drugs and supplements' | 'Clinical concepts' | 'Other'
}

/** The type picker on /new, mapped to PCID blocks (docs/user-edits.md §7). */
export const PAGE_KINDS: PageKindOption[] = [
  { id: 'moiety', group: 'Drugs and supplements', label: 'Drug: single active ingredient', hint: 'e.g. metformin', kind: 'moiety', identifiers: true },
  { id: 'precise_form', group: 'Drugs and supplements', label: 'Drug: salt or ester form', hint: 'e.g. metoprolol succinate', kind: 'precise_form', identifiers: true },
  { id: 'combination', group: 'Drugs and supplements', label: 'Drug: combination product', hint: 'e.g. lisinopril/hydrochlorothiazide', kind: 'combination', identifiers: true },
  { id: 'formulation', group: 'Drugs and supplements', label: 'Drug: branded product', hint: 'e.g. Glucophage XR', kind: 'formulation' },
  { id: 'supplement', group: 'Drugs and supplements', label: 'Dietary supplement (a defined chemical)', hint: 'e.g. melatonin, cholecalciferol', kind: 'moiety', identifiers: true },
  { id: 'herbal', group: 'Drugs and supplements', label: 'Herbal or biological source', hint: 'e.g. ashwagandha, fish oil', kind: 'functional', subtype: 'Botanical source' },
  { id: 'indication', group: 'Clinical concepts', label: 'Indication', hint: 'a condition drugs treat', kind: 'clinical', subtype: 'Indication' },
  { id: 'symptom', group: 'Clinical concepts', label: 'Symptom', hint: 'e.g. dizziness', kind: 'clinical', subtype: 'Symptom' },
  { id: 'adverse', group: 'Clinical concepts', label: 'Adverse effect', hint: 'e.g. lactic acidosis', kind: 'clinical', subtype: 'Adverse Reaction' },
  { id: 'contraindication', group: 'Clinical concepts', label: 'Contraindication', hint: 'e.g. severe renal impairment', kind: 'clinical', subtype: 'Contraindication' },
  { id: 'risk', group: 'Clinical concepts', label: 'Risk factor', hint: 'e.g. QT prolongation history', kind: 'clinical', subtype: 'Risk Factor' },
  { id: 'measurement', group: 'Other', label: 'Lab test or measurement', hint: 'e.g. serum potassium, CrCl', kind: 'measurement' },
  { id: 'target', group: 'Other', label: 'Biological target', hint: 'e.g. CYP3A4, SGLT2', kind: 'target' },
]

/** measurement_type values already in use. */
export const MEASUREMENT_TYPES = ['Serum Lab Panel', 'Vital Sign', 'Assessment Scale', 'Diagnostic Measure', 'Derived Calculation']

export type CreatedPage = { pcid: number; pcid_code: string; slug: string; entity_type: string }

export async function createPage(input: {
  kind: PageKindOption['kind']
  name: string
  summary: string
  description: string
  subtype: string | null
  unii: string
  cas: string
}): Promise<CreatedPage> {
  const identifiers: Record<string, string> = {}
  if (input.unii.trim()) identifiers.unii = input.unii.trim()
  if (input.cas.trim()) identifiers.cas = input.cas.trim()
  const { data, error } = await supabase.rpc('create_page', {
    p_entity_kind: input.kind,
    p_name: input.name.trim(),
    p_summary: input.summary.trim(),
    p_description: input.description.trim(),
    p_body_md: '',
    p_subtype: input.subtype,
    p_identifiers: identifiers,
  })
  if (error) throw new ContributeError(error.message, error.code, error.details ?? undefined)
  return data as CreatedPage
}

/** Mirrors pc_slugify() in the database, to preview a new page's address. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The subtype create_page stores for a chosen kind (measurements pick theirs). */
export function subtypeFor(option: PageKindOption, measurementType: string): string | null {
  if (option.kind === 'measurement') return measurementType || null
  return option.subtype ?? null
}
