/**
 * /classifications — every classification system in one place.
 *
 * One search box queries every system at once (WHO ATC, VA, FDA EPC / MoA /
 * PE / Chemical, ChemOnt, Pharmacy Commons groups) by name or code; each hit
 * carries a stamp naming its system. The group filter narrows the catalog to
 * one system, and the search then refines within it. With no query, a
 * single system's hierarchy is indented the way the source nests it.
 *
 * Each class can be added to a compare tray (up to three). The tray is a bar
 * stuck to the bottom of the window; "Compare" opens
 * /classifications/compare. The query, group and selection live in the URL
 * (?q=, ?group=, ?c=) so any view can be linked. /classes and its old ?type=
 * tabs redirect here.
 *
 * Destination: src/pages/ClassIndex.tsx
 */

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PaperSelect from '../components/PaperSelect'
import Stamp from '../components/Stamp'
import {
  GROUPS,
  HIERARCHICAL,
  MAX_COMPARE,
  SHOWS_CODES,
  bySystem,
  groupFromParams,
  loadAllClasses,
  parseSelection,
  searchClasses,
  systemBadge,
} from '../classifications'
import type { ClassRow, GroupKey } from '../classifications'

const BATCH = 200

export default function ClassIndex() {
  const [params, setParams] = useSearchParams()
  const group = groupFromParams(params)
  const selected = useMemo(() => parseSelection(params.get('c')), [params])
  const [query, setQuery] = useState(params.get('q') ?? '')
  const deferredQuery = useDeferredValue(query)
  const [rows, setRows] = useState<ClassRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [limit, setLimit] = useState(BATCH)

  useEffect(() => {
    document.title = 'Classifications · Pharmacy Commons'
  }, [])

  useEffect(() => {
    let cancelled = false
    loadAllClasses()
      .then(r => {
        if (!cancelled) setRows(r)
      })
      .catch(err => {
        console.error(err)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  /** Writes one URL parameter (empty removes it), keeping the others. Drops the old ?type=. */
  function setParam(key: 'q' | 'group' | 'c', value: string) {
    setParams(
      prev => {
        const next = new URLSearchParams(prev)
        next.delete('type')
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  // Keep ?q= in step with the box, without a history entry per keystroke.
  useEffect(() => {
    const q = deferredQuery.trim()
    if ((params.get('q') ?? '') !== q) setParam('q', q)
  }, [deferredQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setLimit(BATCH), [deferredQuery, group])

  const bySlug = useMemo(() => new Map((rows ?? []).map(r => [r.slug, r])), [rows])
  const groupTypes = useMemo(() => GROUPS.find(g => g.key === group)?.types ?? [], [group])
  const multiSystem = groupTypes.length > 1
  const searching = deferredQuery.trim().length > 0

  const visible = useMemo(() => {
    if (!rows) return []
    const inGroup = rows.filter(r => groupTypes.includes(r.class_type))
    return searching ? searchClasses(inGroup, deferredQuery) : [...inGroup].sort(bySystem)
  }, [rows, groupTypes, deferredQuery, searching])

  const systemsHit = useMemo(() => new Set(visible.map(r => r.class_type)).size, [visible])

  // Indent relative to the shallowest level shown, so a narrowed list doesn't float right.
  const minLevel = useMemo(
    () => visible.reduce((m, r) => (r.level !== null && r.level < m ? r.level : m), Infinity),
    [visible],
  )

  // Unfiltered, the catalog is split into one section per system.
  const sections = useMemo(() => {
    const shown = visible.slice(0, limit)
    if (searching) return [{ type: null as string | null, rows: shown }]
    const out: { type: string | null; rows: ClassRow[] }[] = []
    for (const r of shown) {
      const last = out[out.length - 1]
      if (last && last.type === r.class_type) last.rows.push(r)
      else out.push({ type: r.class_type, rows: [r] })
    }
    return out
  }, [visible, limit, searching])

  function toggle(slug: string) {
    const next = selected.includes(slug) ? selected.filter(s => s !== slug) : [...selected, slug].slice(0, MAX_COMPARE)
    setParam('c', next.join(','))
  }

  const groupOptions = GROUPS.map(g => ({ value: g.key, label: g.label, sublabel: g.sublabel }))

  return (
    <main className={`mx-auto max-w-page px-4 sm:px-6 ${selected.length > 0 ? 'pb-40' : 'pb-24'}`}>
      <header className="border-b border-ink/15 pb-8 pt-10 sm:pt-14">
        <h1
          className="font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.015em] text-ink sm:text-[2.618rem]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Classifications
        </h1>
        <p className="mt-5 max-w-[42rem] font-sans text-[17px] leading-relaxed text-ink">
          Explore structured pharmaceutical classifications across international and federal systems, including WHO
          ATC, VA National Formulary, FDA EPC/MOA/PE, ChemOnt chemical taxonomy, and curated Pharmacy Commons groups.
        </p>

        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:items-stretch">
          <div className="lp-field flex min-w-0 flex-1 items-center gap-2 rounded-md px-4 py-2.5">
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-ink">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. kinase, hypoglycemic, N06AB, beta blocker"
              aria-label="Search classifications"
              enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent font-sans text-[14px] text-ink placeholder:text-ink outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center text-ink" aria-label="Clear search">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
          <PaperSelect
            value={group}
            onChange={v => setParam('group', v === 'all' ? '' : (v as GroupKey))}
            options={groupOptions}
            searchable={false}
            aria-label="Classification system"
            className="h-11 w-full text-[14px] sm:w-72"
            menuMinWidth={300}
          />
        </div>
      </header>

      {failed ? (
        <p className="py-10 font-sans text-[15px] text-ink">Classifications couldn’t be loaded right now.</p>
      ) : !rows ? (
        <div className="grid gap-2 py-8" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="lp-raised h-[68px] animate-pulse rounded-md" />
          ))}
        </div>
      ) : (
        <>
          <p className="pb-4 pt-6 font-sans text-[13px] text-ink" aria-live="polite">
            {visible.length.toLocaleString()} {visible.length === 1 ? 'class' : 'classes'}
            {searching && visible.length > 0 && ` in ${systemsHit} ${systemsHit === 1 ? 'system' : 'systems'}`}
            {searching && ` matching “${deferredQuery.trim()}”`}
          </p>

          {visible.length === 0 ? (
            <p className="py-6 font-sans text-[15px] text-ink">
              No classes match “{deferredQuery.trim()}”
              {group !== 'all' && (
                <>
                  {' '}
                  in {GROUPS.find(g => g.key === group)?.label}.{' '}
                  <button type="button" onClick={() => setParam('group', '')} className="font-medium underline">
                    Search every system
                  </button>
                </>
              )}
              {group === 'all' && '.'}
            </p>
          ) : (
            sections.map((section, i) => (
              <section key={`${section.type ?? 'hits'}-${i}`} className={section.type && i > 0 ? 'pt-8' : ''}>
                {section.type && multiSystem && (
                  <h2
                    className="mb-3 font-display font-semibold leading-snug text-ink"
                    style={{ fontFamily: 'var(--font-display)', fontSize: '22px' }}
                  >
                    {section.rows[0]?.class_type_label ?? systemBadge(section.type)}
                  </h2>
                )}
                <ul className="grid gap-2">
                  {section.rows.map(r => (
                    <ClassItem
                      key={r.slug}
                      row={r}
                      indent={
                        !searching && HIERARCHICAL.has(r.class_type) && r.level !== null && Number.isFinite(minLevel)
                          ? Math.min(r.level - minLevel, 6)
                          : 0
                      }
                      selected={selected.includes(r.slug)}
                      full={selected.length >= MAX_COMPARE}
                      onToggle={() => toggle(r.slug)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}

          {visible.length > limit && (
            <button
              type="button"
              onClick={() => setLimit(l => l + BATCH * 2)}
              className="lp-raised lp-press mt-5 rounded-md px-4 py-2 font-sans text-[13px] font-medium text-ink"
            >
              Show more ({(visible.length - limit).toLocaleString()} left)
            </button>
          )}
        </>
      )}

      {selected.length > 0 && (
        <CompareTray
          selected={selected}
          names={selected.map(s => bySlug.get(s)?.name ?? s)}
          onRemove={slug => setParam('c', selected.filter(s => s !== slug).join(','))}
          onClear={() => setParam('c', '')}
        />
      )}
    </main>
  )
}

function ClassItem({
  row,
  indent,
  selected,
  full,
  onToggle,
}: {
  row: ClassRow
  indent: number
  selected: boolean
  full: boolean
  onToggle: () => void
}) {
  const code = SHOWS_CODES.has(row.class_type) ? row.source_code : null
  return (
    <li
      className="min-w-0 ml-[calc(var(--indent)*0.6rem)] sm:ml-[calc(var(--indent)*1.1rem)]"
      style={{ '--indent': indent } as CSSProperties}
    >
      <article className="lp-raised min-w-0 rounded-md px-4 py-3">
        <div className="mb-1 flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 pt-0.5">
            <Stamp>{systemBadge(row.class_type)}</Stamp>
            {code && (
              <span className="lp-raised rounded px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink">{code}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={selected}
            disabled={!selected && full}
            aria-label={selected ? `Remove ${row.name} from compare` : `Add ${row.name} to compare`}
            title={!selected && full ? `You can compare up to ${MAX_COMPARE} classes` : undefined}
            className="lp-toggle -mr-1 shrink-0 rounded-md px-2.5 py-1.5 font-sans text-[12.5px] font-medium whitespace-nowrap text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40 disabled:cursor-default disabled:opacity-40"
          >
            {selected ? '✓ Comparing' : '+ Compare'}
          </button>
        </div>
        <Link
          to={`/classifications/${row.slug}`}
          className="block min-w-0 break-words font-display font-semibold leading-snug text-ink hover:underline"
          style={{ fontFamily: 'var(--font-display)', fontSize: '17px' }}
        >
          {row.name}
        </Link>
        <span className="mt-0.5 block font-mono text-[11.5px] text-ink">
          {row.member_count.toLocaleString()} {row.member_count === 1 ? 'drug' : 'drugs'}
        </span>
      </article>
    </li>
  )
}

/** Sticks to the bottom of the window while one to three classes are picked. */
function CompareTray({
  selected,
  names,
  onRemove,
  onClear,
}: {
  selected: string[]
  names: string[]
  onRemove: (slug: string) => void
  onClear: () => void
}) {
  const ready = selected.length >= 2
  return (
    <div role="region" aria-label="Compare classes" className="pc-grain lp-rule-t fixed inset-x-0 bottom-0 z-40 bg-paper shadow-[0_-6px_16px_rgb(0_0_0/0.08)]">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
        <p className="shrink-0 font-sans text-[13.5px] font-medium text-ink" aria-live="polite">
          {selected.length} of {MAX_COMPARE} classes selected
        </p>
        <ul className="hidden min-w-0 flex-1 flex-wrap gap-1.5 md:flex">
          {selected.map((slug, i) => (
            <li key={slug} className="min-w-0 max-w-full">
              <span className="lp-sunken flex min-w-0 items-center gap-1 rounded-md py-1 pl-2.5 pr-1 font-sans text-[12.5px] text-ink">
                <span className="min-w-0 truncate">{names[i]}</span>
                <button
                  type="button"
                  onClick={() => onRemove(slug)}
                  aria-label={`Remove ${names[i]}`}
                  className="flex shrink-0 rounded p-1 text-ink"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </span>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            className="lp-raised lp-press rounded-md px-3 py-2 font-sans text-[13px] text-ink"
          >
            Clear all
          </button>
          {ready ? (
            <Link
              to={`/classifications/compare?c=${selected.map(encodeURIComponent).join(',')}`}
              className="lp-raised lp-press rounded-md px-4 py-2 font-sans text-[13px] font-medium text-ink"
            >
              Compare
            </Link>
          ) : (
            <span
              aria-disabled="true"
              title="Pick one more class to compare"
              className="lp-raised cursor-default rounded-md px-4 py-2 font-sans text-[13px] font-medium text-ink opacity-50"
            >
              Compare
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
