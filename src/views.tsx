import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Reader views — one canonical record, six ways to read or work with it.
 *
 * Mirrors §17 of the white paper. The four perspectives are ways of reading,
 * Machine is a way of accessing the data, and Commons is the contributor
 * workspace. Views change presentation only, never facts.
 *
 * State lives in the URL (`?view=`) so a view is linkable, and is also
 * remembered in localStorage so it survives navigation to pages whose links
 * don't carry the parameter. The default view is left out of the URL.
 */

export type ViewKey = 'patient' | 'clinical' | 'research' | 'academic' | 'machine' | 'commons'
export type ViewGroup = 'explore' | 'access' | 'contribute'

export type ViewDef = {
  key: ViewKey
  label: string
  tagline: string
  group: ViewGroup
}

export const VIEWS: ViewDef[] = [
  { key: 'patient', label: 'Patient', tagline: 'Understand my medicine', group: 'explore' },
  { key: 'clinical', label: 'Clinical', tagline: 'Use in practice', group: 'explore' },
  { key: 'research', label: 'Research', tagline: 'Explore the evidence', group: 'explore' },
  { key: 'academic', label: 'Academic', tagline: 'Learn and teach', group: 'explore' },
  { key: 'machine', label: 'Machine', tagline: 'Use the data', group: 'access' },
  { key: 'commons', label: 'Commons', tagline: 'Help steward the record', group: 'contribute' },
]

export const VIEW_GROUPS: { key: ViewGroup; label: string }[] = [
  { key: 'explore', label: 'Explore' },
  { key: 'access', label: 'Access' },
  { key: 'contribute', label: 'Contribute' },
]

/** Open decision in the white paper (§20); Clinical until it is settled. */
export const DEFAULT_VIEW: ViewKey = 'clinical'

const STORAGE_KEY = 'pc:view'
const PARAM = 'view'

export function viewDef(key: ViewKey): ViewDef {
  return VIEWS.find(v => v.key === key) ?? VIEWS[0]
}

function parseView(value: string | null): ViewKey | null {
  return VIEWS.some(v => v.key === value) ? (value as ViewKey) : null
}

function readStored(): ViewKey | null {
  try {
    return parseView(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

function writeStored(view: ViewKey) {
  try {
    window.localStorage.setItem(STORAGE_KEY, view)
  } catch {
    // Storage can be unavailable (private mode, quota); the URL still carries the view.
  }
}

type ViewContextValue = {
  view: ViewKey
  setView: (view: ViewKey) => void
}

const ViewContext = createContext<ViewContextValue | null>(null)

export function ViewProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const urlView = parseView(new URLSearchParams(location.search).get(PARAM))

  const [view, setViewState] = useState<ViewKey>(() => urlView ?? readStored() ?? DEFAULT_VIEW)

  /** Rewrites only the query string; pathname and hash (deep links) are kept. */
  const writeUrl = useCallback(
    (next: ViewKey) => {
      const params = new URLSearchParams(location.search)
      if (next === DEFAULT_VIEW) params.delete(PARAM)
      else params.set(PARAM, next)
      const search = params.toString()
      navigate(
        { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash },
        { replace: true },
      )
    },
    [location.pathname, location.search, location.hash, navigate],
  )

  const setView = useCallback(
    (next: ViewKey) => {
      setViewState(next)
      writeStored(next)
      writeUrl(next)
    },
    [writeUrl],
  )

  // A shared link or back/forward carries a view: adopt it.
  useEffect(() => {
    if (urlView && urlView !== view) {
      setViewState(urlView)
      writeStored(urlView)
    }
  }, [urlView]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the URL in step after navigating to a page whose link had no view.
  useEffect(() => {
    if (urlView && urlView !== view) return // the effect above is about to sync state
    const current = new URLSearchParams(location.search).get(PARAM)
    const wanted = view === DEFAULT_VIEW ? null : view
    if (current !== wanted) writeUrl(view)
  }, [view, location.pathname, location.search]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({ view, setView }), [view, setView])
  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>
}

export function useView(): ViewContextValue {
  const ctx = useContext(ViewContext)
  if (!ctx) throw new Error('useView must be used inside <ViewProvider>')
  return ctx
}
