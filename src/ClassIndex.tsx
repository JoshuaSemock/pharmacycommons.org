import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listClasses } from './api'
import type { ClassSummary, ClassType } from './api.generated'
import { PageFrame, PageTitle } from './pages/PageShell'

/**
 * /classes — every drug class with at least one member, one classification
 * system at a time (the `list_classes` RPC). A search box queries the server
 * (debounced) across the selected system, or across all of them on the
 * "All systems" tab, which only lists anything once there is a search string:
 * several thousand classes exist in total.
 *
 * State lives in the URL (?type=atc&q=serotonin) so a filtered view can be
 * linked to, the same way SearchView keeps ?q= and ?letter=.
 */

type Tab = ClassType | 'all'

/** Tab order and labels. The server's class_type_label is what each row shows. */
const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: 'atc', label: 'WHO ATC', hint: 'Anatomical Therapeutic Chemical classification' },
  { key: 'epc', label: 'Pharmacologic class', hint: 'FDA Established Pharmacologic Class' },
  { key: 'moa', label: 'Mechanism', hint: 'FDA Mechanism of Action' },
  { key: 'pe', label: 'Physiologic effect', hint: 'FDA Physiologic Effect' },
  { key: 'chem', label: 'Chemical structure', hint: 'FDA Chemical Structure' },
  { key: 'va', label: 'VA class', hint: 'VA National Drug File class' },
  { key: 'chemont', label: 'ChemOnt', hint: 'ClassyFire chemical taxonomy' },
  { key: 'curated', label: 'Curated', hint: 'Classes curated by Pharmacy Commons' },
  { key: 'all', label: 'All systems', hint: 'Search every classification system' },
]

const TAB_KEYS = new Set<string>(TABS.map(t => t.key))
const DEFAULT_TAB: Tab = 'atc'
const DEBOUNCE_MS = 300
const PAGE = 300

function toTab(raw: string | null): Tab {
  return raw && TAB_KEYS.has(raw) ? (raw as Tab) : DEFAULT_TAB
}

/** ATC reads best in code order (its hierarchy is in the code); every other system alphabetically. */
function sortClasses(rows: ClassSummary[], tab: Tab): ClassSummary[] {
  const byName = (a: ClassSummary, b: ClassSummary) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  if (tab !== 'atc') return [...rows].sort(byName)
  return [...rows].sort((a, b) => (a.source_code ?? '').localeCompare(b.source_code ?? '') || byName(a, b))
}

export default function ClassIndex() {
  const [params, setParams] = useSearchParams()
  const tab = toTab(params.get('type'))
  const urlQuery = params.get('q') ?? ''

  // The input updates immediately; the URL (and so the request) follows after a pause.
  const [input, setInput] = useState(urlQuery)
  const [rows, setRows] = useState<ClassSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => {
    document.title = 'Drug classes · Pharmacy Commons'
  }, [])

  // Back/forward navigation changes the URL under the input.
  // (Only when they really differ, so a debounced write doesn't strip a trailing space mid-typing.)
  useEffect(() => {
    setInput(current => (current.trim() === urlQuery.trim() ? current : urlQuery))
  }, [urlQuery])

  // Functional update, so a debounced write never clobbers a tab switch made while it waited.
  const patch = useCallback(
    (changes: Record<string, string | null>) => {
      setParams(
        prev => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(changes)) {
            if (v === null || v === '') next.delete(k)
            else next.set(k, v)
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  useEffect(() => {
    const trimmed = input.trim()
    if (trimmed === urlQuery.trim()) return
    const timer = window.setTimeout(() => patch({ q: trimmed || null }), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [input, urlQuery, patch])

  const query = urlQuery.trim()
  const needsQuery = tab === 'all' && !query

  useEffect(() => {
    setLimit(PAGE)
    if (needsQuery) {
      setRows([])
      setFailed(false)
      return
    }
    let cancelled = false
    setRows(null)
    setFailed(false)
    listClasses(tab === 'all' ? null : tab, query || null)
      .then(result => {
        if (!cancelled) setRows(result)
      })
      .catch(err => {
        console.error(err)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [tab, query, needsQuery])

  const sorted = useMemo(() => (rows ? sortClasses(rows, tab) : []), [rows, tab])
  const visible = sorted.slice(0, limit)
  const activeTab = TABS.find(t => t.key === tab) ?? TABS[0]

  return (
    <PageFrame
      contentKey="classes"
      toc={false}
      header={
        <PageTitle
          title="Drug classes"
          lede="Every drug belongs to several classes: where it acts, how it works, what it does, and what it is built from. Pick a classification system, or search across all of them."
        />
      }
    >
      <section className="pt-8 pb-9">
        {/* System picker: a tab row on sm+, a select below it */}
        <div
          role="tablist"
          aria-label="Classification system"
          className="hidden flex-wrap gap-0.5 rounded-lg border border-sage-200 bg-sage-100 p-0.5 sm:inline-flex"
        >
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              title={t.hint}
              onClick={() => patch({ type: t.key === DEFAULT_TAB ? null : t.key })}
              className={[
                'rounded-md px-3 py-1.5 font-sans text-[13px] font-medium whitespace-nowrap transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-aqua-500',
                tab === t.key
                  ? 'bg-white text-sage-900 shadow-[0_1px_3px_rgb(0_0_0/0.14),0_1px_1px_rgb(0_0_0/0.06)] ring-1 ring-sage-200'
                  : 'text-sage-600 hover:text-sage-900',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="block sm:hidden">
          <span className="mb-1.5 block font-sans text-[13px] font-medium text-sage-700">Classification system</span>
          <select
            value={tab}
            onChange={e => patch({ type: e.target.value === DEFAULT_TAB ? null : e.target.value })}
            className="w-full rounded-lg border border-sage-200 bg-white px-3 py-2 font-sans text-[14px] text-sage-900 outline-none focus:border-aqua-400 focus:ring-2 focus:ring-aqua-200"
          >
            {TABS.map(t => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        {/* Search */}
        <div className="mt-5 max-w-lg">
          <div className="flex items-center gap-2 rounded-xl border border-sage-200 bg-white px-4 py-2.5 shadow-sm shadow-sage-900/5 transition-all focus-within:border-aqua-400 focus-within:ring-3 focus-within:ring-aqua-200">
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-sage-400">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={
                tab === 'all' ? 'Search every system, e.g. serotonin or N06AB' : `Search ${activeTab.label} classes`
              }
              aria-label="Search drug classes"
              className="flex-1 bg-transparent font-sans text-[14px] text-sage-900 placeholder-sage-400 outline-none"
            />
            {input && (
              <button type="button" onClick={() => setInput('')} className="text-sage-400 hover:text-sage-600" aria-label="Clear search">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="mt-8">
          {failed ? (
            <div className="py-12 text-center">
              <p className="font-sans text-sage-700">The classes didn’t load.</p>
              <button onClick={() => window.location.reload()} className="mt-2 font-sans text-[13px] text-aqua-700 hover:underline">
                Reload the page
              </button>
            </div>
          ) : needsQuery ? (
            <p className="py-12 text-center font-sans text-sage-600">
              Type a class name or code to search every classification system at once.
            </p>
          ) : rows === null ? (
            <div className="space-y-2" aria-busy="true">
              <div className="h-10 animate-pulse rounded-lg bg-sage-100" />
              <div className="h-10 animate-pulse rounded-lg bg-sage-100" />
              <div className="h-10 animate-pulse rounded-lg bg-sage-100" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-sans text-sage-600">
                {query ? (
                  <>
                    No {tab === 'all' ? '' : `${activeTab.label} `}classes match{' '}
                    <span className="font-medium text-sage-900">{query}</span>.
                  </>
                ) : (
                  `No ${activeTab.label} classes have drugs linked to them yet.`
                )}
              </p>
              {query && tab !== 'all' && (
                <button onClick={() => patch({ type: 'all' })} className="mt-2 font-sans text-[13px] text-aqua-700 hover:underline">
                  Search every system instead
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="mb-3 font-sans text-[13px] text-sage-600">
                {query ? (
                  <>
                    Classes matching <span className="font-medium text-sage-900">{query}</span>
                  </>
                ) : (
                  activeTab.hint
                )}
                <span className="ml-2 font-mono text-[12px] text-sage-400">{sorted.length.toLocaleString()}</span>
              </p>

              <ul className="divide-y divide-sage-100 overflow-hidden rounded-xl border border-sage-200 bg-white">
                {visible.map(c => (
                  <ClassRow key={c.slug} cls={c} showType={tab === 'all'} indent={tab === 'atc' && !query} />
                ))}
              </ul>

              {sorted.length > visible.length && (
                <div className="mt-6 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setLimit(l => l + PAGE)}
                    className="rounded-lg border border-aqua-400 bg-aqua-400/10 px-4 py-2 font-sans text-[13px] font-medium text-aqua-700 transition-colors hover:border-aqua-500 hover:bg-aqua-400/20"
                  >
                    Show {Math.min(PAGE, sorted.length - visible.length).toLocaleString()} more
                  </button>
                  <span className="font-mono text-[11.5px] text-sage-600">
                    {(sorted.length - visible.length).toLocaleString()} left
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </PageFrame>
  )
}

/**
 * One class. In the unfiltered ATC list, rows are indented by level so the
 * code hierarchy (N → N06 → N06A → N06AB) reads at a glance.
 */
function ClassRow({ cls, showType, indent }: { cls: ClassSummary; showType: boolean; indent: boolean }) {
  const depth = indent && cls.level ? Math.max(0, Math.min(cls.level, 5) - 1) : 0
  return (
    <li>
      <Link
        to={`/classes/${cls.slug}`}
        className="flex items-baseline gap-3 px-4 py-2.5 transition-colors hover:bg-sage-50"
        style={depth ? { paddingLeft: `calc(1rem + ${depth * 1.25}rem)` } : undefined}
      >
        {cls.source_code && (
          <span className="w-24 shrink-0 font-mono text-[12px] text-sage-600">{cls.source_code}</span>
        )}
        <span className="min-w-0 flex-1">
          <span className={`block font-sans text-[14px] text-sage-900 ${depth === 0 && indent ? 'font-medium' : ''}`}>
            {cls.name}
          </span>
          {showType && <span className="block font-sans text-[11.5px] text-sage-600">{cls.class_type_label}</span>}
        </span>
        <span className="shrink-0 font-mono text-[11.5px] text-sage-600" title={`${cls.member_count} drugs`}>
          {cls.member_count.toLocaleString()}
        </span>
      </Link>
    </li>
  )
}
