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
import {
  defaultSortKey,
  filterItems,
  formatCount,
  listToCsv,
  sortItems,
  sortOptions,
  statusLabel,
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
    return <main className="flex justify-center py-32 font-sans text-mint-700">Loading…</main>
  }

  if (state !== 'ready' || !list) {
    return (
      <main className="flex flex-col items-center justify-center px-4 py-32 text-center">
        <p className="mb-2 font-display text-xl text-mint-800" style={{ fontFamily: 'var(--font-display)' }}>
          {state === 'missing' ? `No list called “${slug}”.` : 'The list couldn’t be loaded right now.'}
        </p>
        <Link to="/lists" className="font-sans text-sm text-hepatica-700 hover:underline">
          All lists
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 py-4 font-sans text-[13px] text-mint-700">
        <Link to="/lists" className="transition-colors hover:text-mint-950">
          Lists
        </Link>
        {list.parent && (
          <span className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true">/</span>
            <Link to={`/lists/${list.parent.slug}`} className="break-words transition-colors hover:text-mint-950">
              {list.parent.title}
            </Link>
          </span>
        )}
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="min-w-0 break-words font-medium text-mint-950">
          {list.title}
        </span>
      </nav>

      <ListHeader list={list} />

      <div className="grid grid-cols-1 gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Drugs on this list" className="min-w-0">
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
                      className="flex items-baseline justify-between gap-2 rounded-lg border border-mint-200 bg-white px-3 py-2 transition-colors hover:border-hepatica-300 hover:bg-mint-50"
                    >
                      <span className="min-w-0 break-words font-sans text-[13px] leading-snug text-mint-900">
                        {c.title.replace(/^.*?:\s*/, '')}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-mint-700">{c.item_count}</span>
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
    <header className="border-b border-mint-200 pb-8">
      <div className="flex flex-wrap gap-1.5">
        {place && (
          <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono text-[11px] font-medium text-sky-700">
            {place}
          </span>
        )}
        <span className="rounded-md border border-mint-200 bg-mint-50 px-2 py-0.5 font-mono text-[11px] text-mint-800">
          {list.pcid_code}
        </span>
      </div>
      <h1
        className="mt-3 font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.015em] text-balance text-mint-950 sm:text-[2.618rem]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {list.title}
      </h1>
      {list.description && (
        <p className="mt-4 max-w-[42rem] font-sans text-[17px] leading-relaxed text-pretty text-mint-700">
          {list.description}
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-2.5">
        <Link
          to={`/lists/compare?l=${encodeURIComponent(list.slug)}`}
          className="rounded-lg border border-hepatica-400 bg-hepatica-400/10 px-4 py-2 font-sans text-[13.5px] font-medium text-hepatica-700 transition-colors hover:border-hepatica-500 hover:bg-hepatica-400/20"
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
  const sLabel = statusLabel(list)

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
          className="font-display text-[22px] font-semibold leading-snug text-mint-950"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Drugs on this list{' '}
          <span className="ml-1 font-mono text-[13px] font-normal text-mint-700">
            {rows.length === list.items.length
              ? list.items.length.toLocaleString()
              : `${rows.length.toLocaleString()} of ${list.items.length.toLocaleString()}`}
          </span>
        </h2>
        <button
          type="button"
          onClick={download}
          className="rounded-lg border border-mint-300 bg-white px-3 py-1.5 font-sans text-[12.5px] font-medium text-mint-900 transition-colors hover:border-mint-400"
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
          placeholder={`Filter ${list.items.length.toLocaleString()} drugs`}
          aria-label="Filter drugs on this list"
          className="w-full rounded-lg border border-mint-200 bg-white px-3 py-1.5 font-sans text-[13.5px] text-mint-950 placeholder:text-mint-700 focus:border-hepatica-400 focus:outline-none focus:ring-2 focus:ring-hepatica-200 sm:w-64"
        />
        {tops.length > 0 && (
          <label className="flex items-center gap-2 font-sans text-[13px] text-mint-800">
            Show
            <select
              value={top ?? ''}
              onChange={e => update({ top: e.target.value || null })}
              className="rounded-lg border border-mint-200 bg-white px-2 py-1 font-sans text-[13px] text-mint-950"
            >
              <option value="">All ranks</option>
              {tops.map(n => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
            </select>
          </label>
        )}
        {showStatus && (
          <label className="flex items-center gap-2 font-sans text-[13px] text-mint-800">
            {sLabel}
            <select
              value={status ?? ''}
              onChange={e => update({ status: e.target.value || null })}
              className="rounded-lg border border-mint-200 bg-white px-2 py-1 font-sans text-[13px] text-mint-950"
            >
              <option value="">All</option>
              {statuses.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span id="list-sort-label" className="font-sans text-[12.5px] font-medium text-mint-950">
          Sort by
        </span>
        <div
          role="radiogroup"
          aria-labelledby="list-sort-label"
          className="flex flex-wrap gap-0.5 rounded-lg bg-mint-100 p-0.5 ring-1 ring-inset ring-mint-200"
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
                className={`rounded-md px-2.5 py-1 font-sans text-[12.5px] whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-white font-medium text-mint-950 shadow-[0_1px_3px_rgb(0_0_0/0.14)] ring-1 ring-mint-200'
                    : 'text-mint-700 hover:text-mint-950'
                }`}
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
          className="flex items-center gap-1.5 rounded-lg border border-mint-200 bg-white px-2.5 py-1 font-sans text-[12.5px] text-mint-800 hover:border-mint-300"
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
        <p className="py-6 font-sans text-[14px] text-mint-700">No drugs match these filters.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-mint-200 bg-white">
          <div
            className="hidden gap-x-4 border-b border-mint-200 bg-mint-50 px-4 py-2 font-sans text-[12px] text-mint-700 sm:grid"
            style={{ gridTemplateColumns: gridCols }}
            aria-hidden="true"
          >
            {showRank && <span>Rank</span>}
            <span>Drug</span>
            {showValue && <span>{vLabel}</span>}
            {showStatus && <span>{sLabel}</span>}
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
          className="mt-4 rounded-lg border border-hepatica-400 bg-hepatica-400/10 px-4 py-2 font-sans text-[13px] font-medium text-hepatica-700 hover:bg-hepatica-400/20"
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
  const name = formatDrugName(item.name)
  const sourceDiffers = item.source_name.trim().toLowerCase().replace(/\s*\/\s*/g, '/') !== item.name.trim().toLowerCase()
  return (
    <li
      className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-b border-mint-100 px-4 py-2.5 last:border-b-0 sm:items-center sm:gap-x-4 sm:[grid-template-columns:var(--cols)]"
      style={{ ['--cols' as string]: gridCols }}
    >
      {showRank ? (
        <span className="font-mono text-[12.5px] text-mint-800">{item.rank ?? '—'}</span>
      ) : (
        <span className="sm:hidden" aria-hidden="true" />
      )}
      <span className="min-w-0">
        <Link to={`/drugs/${item.slug}`} className="break-words font-sans text-[14.5px] font-medium text-mint-950 hover:text-hepatica-700">
          {name}
        </Link>
        {item.entity_type === 'combination' && (
          <span className="ml-2 font-sans text-[11.5px] text-mint-700">combination</span>
        )}
        {sourceDiffers && (
          <span className="block break-words font-sans text-[11.5px] text-mint-700">listed as “{item.source_name}”</span>
        )}
        {item.note && <span className="block break-words font-sans text-[12.5px] text-mint-800">{item.note}</span>}
        {item.sources && item.sources.length > 0 && (
          <span className="block break-words font-sans text-[11.5px] text-mint-700">Also listed by {item.sources.join(' and ')}</span>
        )}
      </span>
      {showValue && (
        <span className="col-start-2 min-w-0 sm:col-start-auto">
          {valueText !== null && (
            <>
              <span className="font-mono text-[12px] text-mint-800">
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
            <span className="flex flex-wrap gap-1">
              {item.legal_status
                .split(';')
                .map(part => part.trim())
                .filter(Boolean)
                .map(part => (
                  <span
                    key={part}
                    className="inline-block max-w-full break-words rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-rose-700"
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
            <a href={list.source_url} target="_blank" rel="noopener noreferrer" className="text-hepatica-700 underline decoration-hepatica-300 underline-offset-2">
              {list.source_citation}
            </a>
          ) : (
            list.source_citation
          )}
        </Fact>
        {place && <Fact label="Jurisdiction">{place}</Fact>}
        {list.measure_label && <Fact label="Measure">{list.measure_label}</Fact>}
        {list.rank_label && <Fact label="Ranked by">{list.rank_label}</Fact>}
        <Fact label="Drugs">{list.item_count.toLocaleString()}</Fact>
        <Fact label="License">{list.license === 'CC0-1.0' ? 'CC0 1.0 (public domain)' : list.license}</Fact>
        <Fact label="Permanent address">
          <Link to={`/id/${list.pcid_code}`} className="font-mono text-[12px] text-hepatica-700 hover:underline">
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
      <dt className="text-[12px] text-mint-700">{label}</dt>
      <dd className="break-words text-mint-950">{children}</dd>
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-mint-200 bg-white">
      <div className="border-b border-mint-100 px-4 py-3">
        {/* Inline size and family: index.css styles bare h2 with the display face at --text-3xl. */}
        <h2 className="font-medium text-mint-950" style={{ fontSize: '12.5px', lineHeight: 1.4, fontFamily: 'var(--font-sans)' }}>
          {title}
        </h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}
