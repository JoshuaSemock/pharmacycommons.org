/**
 * The live page as a model (docs/page-editor.md): the current revision's lead,
 * sections and section order, plus its numbered reference list. Pages written
 * with the phase-15 Overview editor are converted on the fly (fromLegacy), so
 * every page renders the same way.
 *
 * If the database doesn't have the phase-16 columns yet (migration not
 * applied), this reports `legacy` and the page keeps the phase-15 Overview.
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { isAbort } from '../drugPageData'
import { REGISTRY, citationOrder, fromLegacy, templateModel } from '../pageSource'
import type { PageContext, PageModel, PageType } from '../pageSource'

export type Reference = {
  ordinal: number
  key: string
  kind: string
  title: string | null
  authors: string | null
  container: string | null
  year: number | null
  volume: string | null
  issue: string | null
  pages: string | null
  doi: string | null
  pmid: string | null
  setid: string | null
  url: string | null
}

export type PageModelState =
  | { status: 'loading' }
  | { status: 'legacy' }
  | { status: 'failed' }
  | { status: 'ready'; model: PageModel; references: Reference[]; numbers: Map<string, number>; revisionId: number | null }

/** Enough page context to rebuild a phase-15 page on its template (no Quick Facts or brands needed). */
export function displayContext(pageType: PageType, title: string, entityType: string): PageContext {
  return { pageType, title, entityType, infoboxKeys: [], sourceBrands: [], sourceValues: {}, registry: REGISTRY }
}

type RevisionRow = { id: number; format: number; model: PageModel | null; description: string; body_md: string }
type CitationRow = { ordinal: number; ref_key: string; source: Omit<Reference, 'ordinal' | 'key'> | null }

/** Column missing → the phase-16 migration hasn't been applied. */
const missingSchema = (message: string) => /column .* does not exist|relation .* does not exist|Could not find/.test(message)

export async function loadPageModel(pcid: number, ctx: PageContext, signal?: AbortSignal): Promise<Exclude<PageModelState, { status: 'loading' }>> {
  const content = await supabase.from('page_content').select('current_revision_id').eq('pcid', pcid).abortSignal(signal ?? new AbortController().signal).maybeSingle()
  if (content.error) throw new Error(content.error.message)
  const revisionId = (content.data as { current_revision_id: number | null } | null)?.current_revision_id ?? null
  if (revisionId === null) return { status: 'ready', model: templateModel(ctx), references: [], numbers: new Map(), revisionId: null }

  const rev = await supabase
    .from('page_revisions')
    .select('id, format, model, description, body_md')
    .eq('id', revisionId)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle()
  if (rev.error) {
    if (missingSchema(rev.error.message)) return { status: 'legacy' }
    throw new Error(rev.error.message)
  }
  const row = rev.data as RevisionRow | null
  if (!row) return { status: 'ready', model: templateModel(ctx), references: [], numbers: new Map(), revisionId }
  const model = row.format === 2 && row.model ? row.model : fromLegacy(row.description, row.body_md, ctx)

  let references: Reference[] = []
  if (row.format === 2) {
    const cites = await supabase
      .from('page_citations')
      .select('ordinal, ref_key, source:citation_sources(kind, title, authors, container, year, volume, issue, pages, doi, pmid, setid, url)')
      .eq('revision_id', revisionId)
      .order('ordinal')
      .abortSignal(signal ?? new AbortController().signal)
    if (cites.error) throw new Error(cites.error.message)
    references = ((cites.data ?? []) as unknown as CitationRow[]).map(c => ({
      ordinal: c.ordinal,
      key: c.ref_key,
      kind: c.source?.kind ?? c.ref_key.split(':')[0],
      title: c.source?.title ?? null,
      authors: c.source?.authors ?? null,
      container: c.source?.container ?? null,
      year: c.source?.year ?? null,
      volume: c.source?.volume ?? null,
      issue: c.source?.issue ?? null,
      pages: c.source?.pages ?? null,
      doi: c.source?.doi ?? null,
      pmid: c.source?.pmid ?? null,
      setid: c.source?.setid ?? null,
      url: c.source?.url ?? null,
    }))
  }
  return { status: 'ready', model, references, numbers: numbersFor(model, references), revisionId }
}

/** Reference number of each cited key: from the stored list, else in reading order. */
export function numbersFor(model: PageModel, references: Reference[]): Map<string, number> {
  if (references.length) return new Map(references.map(r => [r.key, r.ordinal]))
  return new Map(citationOrder(model).map((c, i) => [c.key, i + 1]))
}

export function usePageModel(pcid: number, ctx: PageContext): { state: PageModelState; reload: () => void } {
  const [state, setState] = useState<PageModelState>({ status: 'loading' })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick(t => t + 1), [])
  const { pageType, title, entityType } = ctx

  useEffect(() => {
    const controller = new AbortController()
    loadPageModel(pcid, displayContext(pageType, title, entityType), controller.signal)
      .then(setState)
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return
        console.error(`Failed to load the page model for PCID-${pcid}`, err)
        setState({ status: 'failed' })
      })
    return () => controller.abort()
  }, [pcid, pageType, title, entityType, tick])

  return { state, reload }
}
