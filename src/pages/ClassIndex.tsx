/**
 * /classes — browse drug classes by classification system.
 *
 * One tab per system (list_classes(p_type)); only classes with at least one
 * member are listed. Hierarchical systems (ATC, VA, ChemOnt) indent by level
 * and show their codes. The filter matches names and codes within the tab.
 * The tab lives in ?type= so a view can be linked.
 *
 * Destination: src/pages/ClassIndex.tsx
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

type ClassRow = {
  slug: string
  name: string
  class_type: string
  class_type_label: string
  source_code: string | null
  level: number | null
  member_count: number
}

// Same order as the Classes card on drug pages.
const TYPES: { key: string; label: string }[] = [
  { key: 'atc', label: 'WHO ATC' },
  { key: 'va', label: 'VA' },
  { key: 'epc', label: 'FDA EPC' },
  { key: 'moa', label: 'Mechanism' },
  { key: 'pe', label: 'Physiologic effect' },
  { key: 'chem', label: 'Chemical (FDA)' },
  { key: 'chemont', label: 'ChemOnt' },
  { key: 'curated', label: 'Pharmacy Commons' },
]

const HIERARCHICAL = new Set(['atc', 'va', 'chemont'])
const BATCH = 300

export default function ClassIndex() {
  const [params, setParams] = useSearchParams()
  const type = TYPES.some(t => t.key === params.get('type')) ? (params.get('type') as string) : 'atc'
  const [rows, setRows] = useState<ClassRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(BATCH)

  useEffect(() => {
    document.title = 'Classes · Pharmacy Commons'
  }, [])

  useEffect(() => {
    let cancelled = false
    setRows(null)
    setFailed(false)
    setLimit(BATCH)
    supabase.rpc('list_classes', { p_type: type }).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        console.error(error)
        setFailed(true)
      } else {
        setRows((data ?? []) as ClassRow[])
      }
    })
    return () => {
      cancelled = true
    }
  }, [type])

  useEffect(() => setLimit(BATCH), [query])

  const filtered = useMemo(() => {
    if (!rows) return []
    const q = query.trim().toLowerCase()
    return q
      ? rows.filter(r => r.name.toLowerCase().includes(q) || (r.source_code ?? '').toLowerCase().startsWith(q))
      : rows
  }, [rows, query])

  // Indent relative to the shallowest level present, so a filtered list doesn't float right.
  const minLevel = useMemo(
    () => filtered.reduce((m, r) => (r.level !== null && r.level < m ? r.level : m), Infinity),
    [filtered],
  )
  const indent = HIERARCHICAL.has(type) && !query.trim()
  const showCodes = type === 'atc' || type === 'va'

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <header className="mb-6 border-b border-sage-200 pb-6 pt-8">
        <h1
          className="font-display text-3xl font-semibold leading-tight text-sage-900 sm:text-4xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Drug classes
        </h1>
        <p className="mt-2 max-w-2xl font-sans text-md leading-relaxed text-sage-700">
          Every classification system in Pharmacy Commons, each class linked to the drugs in it.
        </p>
      </header>

      <div role="tablist" aria-label="Classification system" className="mb-4 flex flex-wrap gap-1.5">
        {TYPES.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === type}
            onClick={() => {
              setQuery('')
              setParams({ type: t.key }, { replace: true })
            }}
            className={`rounded-lg border px-3 py-1.5 font-sans text-sm transition-colors ${
              t.key === type
                ? 'border-aqua-300 bg-aqua-100 font-medium text-sage-900'
                : 'border-sage-200 bg-white text-sage-700 hover:border-sage-300 hover:text-sage-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {failed ? (
        <p className="font-sans text-md text-sage-600">Classes couldn’t be loaded right now.</p>
      ) : !rows ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-5 w-2/3 animate-pulse rounded bg-sage-100" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="font-sans text-sm text-sage-600">
              {rows[0]?.class_type_label ?? ''} · {filtered.length.toLocaleString()}{' '}
              {filtered.length === 1 ? 'class' : 'classes'}
            </p>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={showCodes ? 'Filter by name or code' : 'Filter by name'}
              aria-label="Filter classes"
              className="w-full rounded-lg border border-sage-200 bg-white px-3 py-1.5 font-sans text-sm text-sage-900 placeholder:text-sage-600 focus:border-aqua-400 focus:outline-none sm:w-64"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="font-sans text-sm text-sage-600">No classes match “{query}”.</p>
          ) : (
            <ul className="divide-y divide-sage-100 overflow-hidden rounded-xl border border-sage-200 bg-white">
              {filtered.slice(0, limit).map(r => (
                <li key={r.slug}>
                  <Link
                    to={`/classes/${r.slug}`}
                    className="flex items-baseline justify-between gap-3 px-4 py-2 transition-colors hover:bg-sage-50"
                    style={
                      indent && r.level !== null && Number.isFinite(minLevel)
                        ? { paddingLeft: `calc(1rem + ${Math.min(r.level - minLevel, 6) * 1.1}rem)` }
                        : undefined
                    }
                  >
                    <span className="min-w-0 break-words font-sans text-md leading-snug text-sage-800">
                      {showCodes && r.source_code && (
                        <span className="mr-2 font-mono text-sm text-sage-600">{r.source_code}</span>
                      )}
                      {r.name}
                    </span>
                    <span className="shrink-0 font-sans text-sm text-sage-600">
                      {r.member_count.toLocaleString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {filtered.length > limit && (
            <button
              onClick={() => setLimit(l => l + BATCH)}
              className="mt-4 font-sans text-sm font-medium text-aqua-700 hover:underline"
            >
              Show more ({(filtered.length - limit).toLocaleString()} left)
            </button>
          )}
        </>
      )}
    </main>
  )
}
