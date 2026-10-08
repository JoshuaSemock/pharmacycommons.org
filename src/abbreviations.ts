/**
 * Recognized abbreviations for a page title (phase 15i).
 *
 * page_abbreviations(name) returns the medical-dictionary abbreviations whose
 * expansion is the page's name, ignoring case, hyphens and punctuation
 * ("High-altitude pulmonary edema" → HAPE). The database never offers one on
 * the Joint Commission "Do Not Use" list, in any spelling.
 *
 * Shown after the title of concept and classification pages only. Drug pages
 * don't get them: drug-name abbreviations (MS, MSO4, HCTZ, MTX…) are the
 * error-prone kind ISMP asks references not to model.
 */

import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export async function getAbbreviations(name: string, signal?: AbortSignal): Promise<string[]> {
  const q = name.trim()
  if (!q) return []
  const call = supabase.rpc('page_abbreviations', { p_name: q })
  const { data, error } = await (signal ? call.abortSignal(signal) : call)
  if (error) throw new Error(error.message)
  return ((data ?? []) as { term: string }[]).map(r => r.term)
}

/** "(HAPE)" or "(H/A, HA)"; empty when there are none. */
export function abbreviationSuffix(terms: string[]): string {
  return terms.length ? `(${terms.join(', ')})` : ''
}

/** Abbreviations for `name`; [] while loading or on failure (they are decoration). */
export function useAbbreviations(name: string | null | undefined): string[] {
  const [terms, setTerms] = useState<string[]>([])
  useEffect(() => {
    setTerms([])
    if (!name?.trim()) return
    const controller = new AbortController()
    getAbbreviations(name, controller.signal)
      .then(setTerms)
      .catch(() => {})
    return () => controller.abort()
  }, [name])
  return terms
}
