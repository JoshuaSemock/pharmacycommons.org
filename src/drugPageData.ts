/**
 * Pharmacy Commons — data hooks for the drug page
 *
 * The drug page (DrugDetail.tsx) shows some data twice: the Quick Facts box
 * summarizes the FDA label, the FDA pharmacologic class and four key lists,
 * and the full label, classifications and lists render further down. Each of
 * those is fetched once here and handed to both places.
 *
 * Every request runs in its own effect with its own AbortController, so a
 * slow class or list lookup never holds up the page, and leaving a drug
 * (or switching labels) cancels the requests still in flight instead of
 * letting them resolve into an unmounted page.
 */

import { useCallback, useEffect, useState } from 'react'
import { getEntityClasses, getEntityLists } from './api'
import type { EntityClass, EntityList } from './api.generated'
import { getLabelText } from './labels'
import type { LabelText } from './labels'

/** `data` is null while loading; `failed` is set (and data stays null) when the request errors. */
export type Loadable<T> = { data: T | null; failed: boolean }

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException
    ? err.name === 'AbortError'
    : err instanceof Error && (err.name === 'AbortError' || /abort/i.test(err.message))
}

function pcidNumber(pcidCode: string): number | null {
  const m = /^PCID-(\d+)$/.exec(pcidCode)
  return m ? Number(m[1]) : null
}

/** Shared shape of the class and list hooks: one RPC keyed by PCID, [] when the PCID is malformed. */
function usePcidQuery<T>(
  pcidCode: string,
  load: (pcid: number, signal: AbortSignal) => Promise<T[]>,
  what: string,
): Loadable<T[]> {
  const [state, setState] = useState<Loadable<T[]>>({ data: null, failed: false })

  useEffect(() => {
    const pcid = pcidNumber(pcidCode)
    if (pcid === null) {
      setState({ data: [], failed: false })
      return
    }
    const controller = new AbortController()
    setState({ data: null, failed: false })
    load(pcid, controller.signal)
      .then(rows => setState({ data: rows, failed: false }))
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return
        console.error(`Failed to load ${what} for ${pcidCode}`, err)
        setState({ data: null, failed: true })
      })
    return () => controller.abort()
    // `load` is recreated every render but only ever closes over module-level
    // functions, so the PCID alone decides when to refetch.
  }, [pcidCode])

  return state
}

/** Every class the drug is in, including ones it reaches through a sub-class. */
export function useEntityClasses(pcidCode: string): Loadable<EntityClass[]> {
  return usePcidQuery(pcidCode, (pcid, signal) => getEntityClasses(pcid, true, { signal }), 'classes')
}

/** Every list the drug is on (for a moiety, also lists that name one of its forms or combinations). */
export function useEntityLists(pcidCode: string): Loadable<EntityList[]> {
  return usePcidQuery(pcidCode, (pcid, signal) => getEntityLists(pcid, { signal }), 'lists')
}

export type LabelState = {
  data: LabelText | null
  loading: boolean
  error: string | null
  /** Show another manufacturer's label. */
  pick: (setid: string) => void
}

/**
 * The drug's FDA label text. Starts on the best-ranked label; `pick` switches
 * to another manufacturer's while keeping the original ranked list in the picker.
 */
export function useLabelText(slug: string): LabelState {
  const [setid, setSetid] = useState<string | undefined>(undefined)
  const [data, setData] = useState<LabelText | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    getLabelText(slug, setid, controller.signal)
      .then(result => {
        setData(prev =>
          setid && prev ? { ...result, n_labels: prev.n_labels, other_labels: mergeOthers(prev, result) } : result,
        )
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return
        console.error(err)
        setError('The label text could not be loaded right now.')
        setLoading(false)
      })
    return () => controller.abort()
  }, [slug, setid])

  const pick = useCallback((next: string) => setSetid(next), [])
  return { data, loading, error, pick }
}

/** Keep the original ranked list stable when the user switches labels. */
function mergeOthers(prev: LabelText, next: LabelText) {
  const all = [
    ...(prev.label ? [{ setid: prev.label.setid, labeler: prev.label.labeler, effective_time: prev.label.effective_time }] : []),
    ...prev.other_labels,
  ]
  return all.filter(o => o.setid !== next.label?.setid)
}
