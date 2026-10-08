/**
 * /lists/:slug — one list.
 *
 * Reads get_list(p_slug): the list, its source and license, its sub-lists (or
 * parent), and every drug on it. Sorting (rank / measured value / A–Z /
 * legal status), direction, a top-N cut-off and a legal-status filter live in
 * the URL (?sort=&dir=&top=&status=) so a view can be linked. The rows shown
 * download as CSV with PCIDs.
 *
 * Rows are a CSS grid rather than a <table> so they stack on a phone instead
 * of pushing the page sideways.
 *
 * Destination: src/pages/ListDetail.tsx
 */

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getListBySlug } from '../api'
import type { ListDetail as ListRecord, ListItem } from '../api.generated'
import { formatDrugName } from '../names'
import PaperSelect from '../components/PaperSelect'
import {
  defaultSortKey,
  filterItems,
  formatCount,
  isTermList,
  listToCsv,
  sortItems,
  sortOptions,
  statusValues,
  topChoices,
  valueIsRank,
  valueLabel,
} from '../lists'
import type { SortKey } from '../lists'

const BATCH = 200

const JURISDICTIONS: Record<string, string> = { US: 'United States', 'US-GA': 'Georgia' }

/** 'US-GA' → 'Georgia'. */
export function jurisdictionLabel(code: string | null): string | null {
  if (!code) return null
  return JURISDICTIONS[code] ?? code
}

export default function ListDetail() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [list, setList] = useState<ListRecord | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    setState('loading')
    setList(null)
    window.scrollTo(0, 0)
    getListBySlug(slug)
      .then(data => {
        if (cancelled) return
        if (!data) setState('missing')
        else {
          setList(data)
          setState('ready')
        }
      })
      .catch(err => {
        if (cancelled) return
        console.error(err)
        setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    document.title = list ? `${list.title} · Lists · Pharmacy Commons` : 'Lists · Pharmacy Commons'
  }, [list])

  if (state === 'loading') {
    return <main className="flex justify-center py-32 font-sans text-ink">Loading…</main>
  }

  if (state !== 'ready' || !list) {
    return (
      <main className="flex flex-col items-center justify-center px-4 py-32 text-center">
        <p className="mb-2 font-display text-xl text-ink" style={{ fontFamily: 'var(--font-display)' }}>
          {state === 'missing' ? `No list called “${slug}”.` : 'The list couldn’t be loaded right now.'}
        </p>
        <Link to="/lists" className="lp-press inline-flex items-center rounded-md px-2.5 py-1 font-sans text-sm text-ink">
          All lists
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 py-4 font-sans text-[13px] text-ink">
        <Link to="/lists" className="lp-press inline-flex items-center rounded-md px-2 py-0.5">
          Lists
        </Link>
        {list.parent && (
          <span className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true">/</span>
            <Link to={`/lists/${list.parent.slug}`} className="lp-press inline-flex items-center rounded-md px-2 py-0.5 break-words">
              {list.parent.title}
            </Link>
          </span>
        )}
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="min-w-0 break-words font-medium text-ink">
          {list.title}
        </span>
      </nav>

      <ListHeader list={list} />

      <div className="grid grid-cols-1 gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label={isTermList(list.items) ? 'Entries on this list' : 'Drugs on this list'} className="min-w-0">
          <Items list={list} />
        </section>
        <aside className="space-y-4 lg:col-start-2 lg:row-start-1">
          <AboutCard list={list} />
          {list.children.length > 0 && (
            <Card title="Categories">
              <ul className="space-y-1.5">
                {list.children.map(c => (
                  <li key={c.slug}>
                    <Link
                      to={`/lists/${c.slug}`}
                      className="lp-card flex items-baseline justify-between gap-2 rounded-md px-3 py-2"
                    >
                      <span className="lp-link-text min-w-0 break-words font-sans text-[13px] leading-snug text-ink">
                        {c.title.replace(/^.*?:\s*/, '')}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-ink">{c.item_count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </main>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

function ListHeader({ list }: { list: ListRecord }) {
  const place = jurisdictionLabel(list.jurisdiction)
  return (
    <header className="border-b border-ink/15 pb-8">
      <div className="flex flex-wrap gap-1.5">
        {place && (
          <span className="lp-label rounded-md px-2 py-0.5 font-mono text-[11px] font-medium text-ink">
            {place}
          </span>
        )}
        <span className="lp-label rounded-md px-2 py-0.5 font-mono text-[11px] text-ink">
          {list.pcid_code}
        </span>
      </div>
      <h1
        className="mt-3 font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.015em] text-balance text-ink sm:text-[2.618rem]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {list.title}
      </h1>
      {list.description && (
        // Full page width (2026-10-03); each line break in the stored description starts a new paragraph.
        <div className="mt-4 space-y-3 font-sans text-[17px] leading-relaxed text-pretty text-ink">
          {list.description
            .split(/\n+/)
            .map(p => p.trim())
            .filter(Boolean)
            .map((p, i) => (
              <p key={i}>{p}</p>
            ))}
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-2.5">
        <Link
          to={`/lists/compare?l=${encodeURIComponent(list.slug)}`}
          className="lp-raised lp-press rounded-md px-4 py-2 font-sans text-[13.5px] font-medium text-ink"
        >
          Compare with another list
        </Link>
      </div>
    </header>
  )
}

// ─── Items ────────────────────────────────────────────────────────────────────

function Items({ list }: { list: ListRecord }) {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(BATCH)

  const options = useMemo(() => sortOptions(list), [list])
  // Lists of abbreviations (the Joint Commission "Do Not Use" list) hold terms, not drugs.
  const terms = isTermList(list.items)
  const noun = terms ? 'entries' : 'drugs'
  const statusLabel = list.status_label ?? 'Status'
  const statuses = useMemo(() => statusValues(list.items), [list])
  const maxRank = useMemo(() => list.items.reduce((m, i) => (i.rank !== null && i.rank > m ? i.rank : m), 0), [list])
  const tops = topChoices(maxRank)
  const rankish = valueIsRank(list)

  const sortParam = params.get('sort') as SortKey | null
  const sort: SortKey = sortParam && options.some(o => o.key === sortParam) ? sortParam : defaultSortKey(list)
  const reverse = params.get('dir') === 'rev'
  const topParam = Number(params.get('top'))
  const top = tops.includes(topParam) ? topParam : null
  const statusParam = params.get('status')
  const status = statusParam && statuses.includes(statusParam) ? statusParam : null

  function update(next: Record<string, string | null>) {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k)
      else p.set(k, v)
    }
    setParams(p, { replace: true })
  }

  const rows = useMemo(
    () => sortItems(filterItems(list.items, { query, top, status }), sort, reverse, { valueIsRank: rankish }),
    [list, query, top, status, sort, reverse, rankish],
  )

  useEffect(() => setLimit(BATCH), [query, top, status, sort, reverse])

  const showRank = list.items.some(i => i.rank !== null)
  const showValue = list.items.some(i => i.value !== null)
  const showStatus = statuses.length > 0
  const maxValue = useMemo(() => list.items.reduce((m, i) => (i.value !== null && i.value > m ? i.value : m), 0), [list])
  const vLabel = valueLabel(list)

  function download() {
    const blob = new Blob([listToCsv(list, rows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${list.slug}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const directionText =
    sort === 'name' || sort === 'status'
      ? reverse
        ? 'Z → A'
        : 'A → Z'
      : sort === 'value' && !rankish
        ? reverse
          ? 'Fewest first'
          : 'Most first'
        : reverse
          ? 'Last → first'
          : 'First → last'

  const gridCols = [showRank ? '3.25rem' : null, 'minmax(0,1fr)', showValue ? 'minmax(0,11rem)' : null, showStatus ? 'minmax(0,13rem)' : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2
          className="font-display text-[22px] font-semibold leading-snug text-ink"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {terms ? 'Entries' : 'Drugs'} on this list{' '}
          <span className="ml-1 font-mono text-[13px] font-normal text-ink">
            {rows.length === list.items.length
              ? list.items.length.toLocaleString()
              : `${rows.length.toLocaleString()} of ${list.items.length.toLocaleString()}`}
          </span>
        </h2>
        <button
          type="button"
          onClick={download}
          className="lp-raised lp-press rounded-md px-3 py-1.5 font-sans text-[12.5px] font-medium text-ink"
        >
          Download CSV
        </button>
      </div>

      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-3">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Filter ${list.items.length.toLocaleString()} ${noun}`}
          aria-label={`Filter ${noun} on this list`}
          className="lp-field w-full rounded-md px-3 py-1.5 font-sans text-[13.5px] text-ink placeholder:text-ink sm:w-64"
        />
        {tops.length > 0 && (
          <label className="flex items-center gap-2 font-sans text-[13px] text-ink">
            Show
            <PaperSelect
              value={top ?? ''}
              onChange={v => update({ top: v || null })}
              className="rounded-md px-2 py-1 font-sans text-[13px] text-ink"
            >
              <option value="">All ranks</option>
              {tops.map(n => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
            </PaperSelect>
          </label>
        )}
        {showStatus && (
          <label className="flex items-center gap-2 font-sans text-[13px] text-ink">
            {statusLabel}
            <PaperSelect
              value={status ?? ''}
              onChange={v => update({ status: v || null })}
              className="rounded-md px-2 py-1 font-sans text-[13px] text-ink"
            >
              <option value="">All</option>
              {statuses.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </PaperSelect>
          </label>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span id="list-sort-label" className="font-sans text-[12.5px] font-medium text-ink">
          Sort by
        </span>
        <div
          role="radiogroup"
          aria-labelledby="list-sort-label"
          className="flex flex-wrap gap-1.5"
        >
          {options.map(o => {
            const active = o.key === sort
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => update({ sort: o.key, dir: null })}
                className={`lp-toggle rounded-md px-2.5 py-1 font-sans text-[12.5px] whitespace-nowrap text-ink ${active ? 'font-medium' : ''}`}
              >
                {o.label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => update({ dir: reverse ? null : 'rev' })}
          aria-label={`Reverse order (now ${directionText})`}
          className="lp-raised lp-press flex items-center gap-1.5 rounded-md px-2.5 py-1 font-sans text-[12.5px] text-ink"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M3.5 1.5V10.5M3.5 10.5L1.5 8.5M3.5 10.5L5.5 8.5M8.5 10.5V1.5M8.5 1.5L6.5 3.5M8.5 1.5L10.5 3.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {directionText}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 font-sans text-[14px] text-ink">No {noun} match these filters.</p>
      ) : (
        <div className="overflow-hidden border-y border-ink/15">
          <div
            className="hidden gap-x-4 border-b border-ink/15 bg-mint-50 px-4 py-2 font-sans text-[12px] text-ink sm:grid"
            style={{ gridTemplateColumns: gridCols }}
            aria-hidden="true"
          >
            {showRank && <span>Rank</span>}
            <span>{terms ? 'Entry' : 'Drug'}</span>
            {showValue && <span>{vLabel}</span>}
            {showStatus && <span>{statusLabel}</span>}
          </div>
          <ol>
            {rows.slice(0, limit).map(i => (
              <Row
                key={`${i.position}`}
                item={i}
                gridCols={gridCols}
                showRank={showRank}
                showValue={showValue}
                showStatus={showStatus}
                valueText={i.value === null ? null : rankish ? `#${i.value}` : formatCount(i.value)}
                valueWidth={showValue && !rankish && i.value !== null && maxValue > 0 ? (i.value / maxValue) * 100 : null}
                valueLabel={vLabel}
              />
            ))}
          </ol>
        </div>
      )}

      {rows.length > limit && (
        <button
          type="button"
          onClick={() => setLimit(l => l + BATCH * 2)}
          className="lp-raised lp-press mt-4 rounded-md px-4 py-2 font-sans text-[13px] font-medium text-ink"
        >
          Show more ({(rows.length - limit).toLocaleString()} left)
        </button>
      )}
    </div>
  )
}

function Row({
  item,
  gridCols,
  showRank,
  showValue,
  showStatus,
  valueText,
  valueWidth,
  valueLabel,
}: {
  item: ListItem
  gridCols: string
  showRank: boolean
  showValue: boolean
  showStatus: boolean
  valueText: string | null
  valueWidth: number | null
  valueLabel: string
}) {
  const isTerm = !item.slug
  const name = isTerm ? item.name : formatDrugName(item.name)
  const sourceDiffers = item.source_name.trim().toLowerCase().replace(/\s*\/\s*/g, '/') !== item.name.trim().toLowerCase()
  return (
    <li
      className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-b border-ink/10 px-4 py-2.5 last:border-b-0-0 sm:items-center sm:gap-x-4 sm:[grid-template-columns:var(--cols)]"
      style={{ ['--cols' as string]: gridCols }}
    >
      {showRank ? (
        <span className="font-mono text-[12.5px] text-ink">{item.rank ?? '—'}</span>
      ) : (
        <span className="sm:hidden" aria-hidden="true" />
      )}
      <span className="min-w-0">
        {isTerm ? (
          <span className="break-words font-mono text-[14px] font-medium text-ink">{name}</span>
        ) : (
          <Link to={`/drugs/${item.slug}`} className="lp-press inline-block max-w-full break-words rounded-md px-2 py-0.5 font-sans text-[14.5px] text-ink">
            {name}
          </Link>
        )}
        {item.entity_type === 'combination' && (
          <span className="ml-2 font-sans text-[11.5px] text-ink">combination</span>
        )}
        {sourceDiffers && (
          <span className="block break-words font-sans text-[11.5px] text-ink">listed as “{item.source_name}”</span>
        )}
        {item.note && (
          <span className={`mt-0.5 block break-words font-sans leading-snug text-ink ${isTerm ? 'text-[13px]' : 'text-[12.5px]'}`}>
            {item.note}
          </span>
        )}
        {item.sources && item.sources.length > 0 && (
          <span className="block break-words font-sans text-[11.5px] text-ink">Also listed by {item.sources.join(' and ')}</span>
        )}
      </span>
      {showValue && (
        <span className="col-start-2 min-w-0 sm:col-start-auto">
          {valueText !== null && (
            <>
              <span className="font-mono text-[12px] text-ink">
                <span className="sm:hidden">{valueLabel}: </span>
                {valueText}
              </span>
              {valueWidth !== null && (
                <span className="mt-1 block h-1 rounded-sm bg-mint-50" aria-hidden="true">
                  <span className="block h-1 rounded-sm bg-mint-500" style={{ width: `${valueWidth}%` }} />
                </span>
              )}
            </>
          )}
        </span>
      )}
      {showStatus && (
        <span className="col-start-2 min-w-0 sm:col-start-auto">
          {item.legal_status && (
            // One label per value: "Modified-release; Irritant" is two reasons.
            <span className="flex flex-wrap gap-1">
              {item.legal_status
                .split(';')
                .map(part => part.trim())
                .filter(Boolean)
                .map(part => (
                  <span
                    key={part}
                    className="lp-label inline-block max-w-full break-words rounded-md bg-rose-50 px-1.5 py-0.5 font-mono text-[11px] text-ink"
                  >
                    {part}
                  </span>
                ))}
            </span>
          )}
        </span>
      )}
    </li>
  )
}

// ─── Rail ─────────────────────────────────────────────────────────────────────

function AboutCard({ list }: { list: ListRecord }) {
  const place = jurisdictionLabel(list.jurisdiction)
  return (
    <Card title="About this list">
      <dl className="space-y-3 font-sans text-[13px]">
        <Fact label="Source">
          {list.source_url ? (
            <a href={list.source_url} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-hepatica-300 underline-offset-2">
              {list.source_citation}
            </a>
          ) : (
            list.source_citation
          )}
        </Fact>
        {place && <Fact label="Jurisdiction">{place}</Fact>}
        {list.measure_label && <Fact label="Measure">{list.measure_label}</Fact>}
        {list.rank_label && <Fact label="Ranked by">{list.rank_label}</Fact>}
        <Fact label={isTermList(list.items) ? 'Entries' : 'Drugs'}>{list.item_count.toLocaleString()}</Fact>
        <Fact label="License">{list.license === 'CC0-1.0' ? 'CC0 1.0 (public domain)' : list.license}</Fact>
        <Fact label="Permanent address">
          <Link to={`/id/${list.pcid_code}`} className="lp-press inline-block rounded-md px-1.5 py-0.5 font-mono text-[12px] text-ink">
            /id/{list.pcid_code}
          </Link>
        </Fact>
        <Fact label="Updated">{new Date(list.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</Fact>
      </dl>
    </Card>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-ink">{label}</dt>
      <dd className="break-words text-ink">{children}</dd>
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-ink/15">
      <div className="py-3">
        {/* Inline size and family: index.css styles bare h2 with the display face at --text-3xl. */}
        <h2 className="font-medium text-ink" style={{ fontSize: '12.5px', lineHeight: 1.4, fontFamily: 'var(--font-sans)' }}>
          {title}
        </h2>
      </div>
      <div className="pb-4">{children}</div>
    </div>
  )
}
