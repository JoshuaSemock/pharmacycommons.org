/**
 * Calls to the publish-page Edge Function (supabase/functions/publish-page),
 * the only way the full-page editor reads a page's source or publishes it.
 */

import { supabase } from '../supabaseClient'
import type { Conflict, Diagnostic, FragmentTarget, PageContext, Registry } from '../pageSource'

export type Protection = 'open' | 'reviewed' | 'patrollers'

export type OpenResult = {
  revisionId: number | null
  protection: Protection
  source: string
  context: Omit<PageContext, 'registry'>
  registry: Registry
  sectionIds: Record<string, string>
}

export type PublishResult = { status: 'live' | 'pending' | 'unchanged'; revisionId: number; changed: string[] }

/** What publishing refused, in a shape the editor can show. */
export type PublishProblem =
  | { kind: 'invalid'; diagnostics: Diagnostic[] }
  | { kind: 'conflict'; conflicts: Conflict[]; revisionId: number | null; source: string }
  | { kind: 'citation'; key: string; message: string }
  | { kind: 'message'; status: number; code: string; message: string }

export class PublishError extends Error {
  constructor(public problem: PublishProblem) {
    super(problem.kind === 'message' ? problem.message : problem.kind)
  }
}

type ErrorBody = {
  error?: string
  message?: string
  diagnostics?: Diagnostic[]
  conflicts?: Conflict[]
  revisionId?: number | null
  source?: string
  key?: string
}

/** Turns an Edge Function error response into a PublishProblem. */
export function toProblem(status: number, body: ErrorBody): PublishProblem {
  if (body.error === 'invalid' && body.diagnostics) return { kind: 'invalid', diagnostics: body.diagnostics }
  if (status === 409 && body.conflicts && typeof body.source === 'string') {
    return { kind: 'conflict', conflicts: body.conflicts, revisionId: body.revisionId ?? null, source: body.source }
  }
  if (body.error === 'citation_not_found') return { kind: 'citation', key: body.key ?? '', message: body.message ?? 'A citation could not be found.' }
  return {
    kind: 'message',
    status,
    code: body.error ?? 'error',
    message: body.message ?? (status === 0 ? 'Couldn’t reach Pharmacy Commons. Check your connection; your draft is saved.' : 'Publishing failed. Your draft is saved; try again.'),
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('publish-page', { body })
  if (error) {
    const response = (error as { context?: unknown }).context
    let status = 0
    let parsed: ErrorBody = {}
    if (response instanceof Response) {
      status = response.status
      try {
        parsed = (await response.json()) as ErrorBody
      } catch {
        parsed = {}
      }
    }
    throw new PublishError(toProblem(status, parsed))
  }
  if (!data) throw new PublishError(toProblem(0, {}))
  return data
}

export function openPage(pcid: number, target?: FragmentTarget): Promise<OpenResult> {
  return call<OpenResult>({ action: 'open', pcid, target })
}

export function publishPage(input: {
  pcid: number
  baseRevisionId: number | null
  source: string
  summary: string
  target?: FragmentTarget
}): Promise<PublishResult> {
  return call<PublishResult>({ action: 'publish', ...input })
}

/** A reviewer accepting a held edit that needs merging onto the live page first. */
export function acceptRebased(revisionId: number, note: string | null): Promise<PublishResult> {
  return call<PublishResult>({ action: 'accept', revisionId, note })
}
