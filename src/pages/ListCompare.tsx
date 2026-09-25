/**
 * /lists/compare?l=slug,slug,slug — up to three lists side by side.
 *
 * Rows are drugs (by PCID), columns are lists; each cell shows what that list
 * says about the drug (its rank, its legal status, or just that it is there).
 * "On every list" / "Not on every list" narrows the rows; the chosen lists live in ?l= so a
 * comparison can be linked.
 *
 * Destination: src/pages/ListCompare.tsx
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getListBySlug, listLists } from '../api'
import type { ListDetail, ListItem, ListSummary } from '../api.generated'
import { formatDrugName } from '../names'

const MAX_LISTS = 3
const BATCH = 300

type Row = { pcid: number; slug: string; name: string; cells: (ListItem | null)[] }
type Show = 'all' | 'every' | 'some'

export default function ListCompare() {
  const [params, setParams] = useSearchParams()
  const slugs = useMemo(
    () =>
      (params.get('l') ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, MAX_LISTS),
    [params],
  )
  const [catalog, setCatalog] = useState<ListSummary[]>([])
  const [loaded, setLoaded] = useState<Record<string, ListDetail | null>>({})
  const [show, setShow] = useState<Show>('all')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(BATCH)

  useEffect(() => {
    document.title = 'Compare lists · Pharmacy Commons'
    listLists().then(setCatalog).catch(err => console.error(err))
  }, [])

  // Fetch each chosen list once; requests in flight are remembered so a
  // re-render before they land doesn't start them again.
  const requested = useRef(new Set<string>())
  useEffect(() => {
    for (const slug of slugs) {
      if (requested.current.has(slug)) continue
      requested.current.add(slug)
      getListBySlug(slug)
        .then(d => setLoaded(prev => ({ ...prev, [slug]: d })))
        .catch(err => {
          console.error(err)
          setLoaded(prev => ({ ...prev, [slug]: null }))
        })
    }
  }, [slugs])

  function setSlugs(next: string[]) {
    const p = new URLSearchParams(params)
    if (next.length) p.set('l', next.join(','))
    else p.delete('l')
    setParams(p, { replace: true })
  }

  const lists = useMemo(() => slugs.map(s => loaded[s]), [slugs, loaded])
  const ready = lists.every(l => l !== undefined)
  const shown = useMemo(() => lists.filter((l): l is ListDetail => Boolean(l)), [lists])

  const rows = useMemo<Row[]>(() => {
    if (!ready) return []
    const byPcid = new Map<number, Row>()
    shown.forEach((list, col) => {
      for (const item of list.items) {
        let row = byPcid.get(item.pcid)
        if (!row) {
          row = { pcid: item.pcid, slug: item.slug, name: formatDrugName(item.name), cells: shown.map(() => null) }
          byPcid.set(item.pcid, row)
        }
        if (!row.cells[col]) row.cells[col] = item
      }
    })
    return [...byPcid.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
  }, [ready, shown])

  const counts = useMemo(() => {
    const every = rows.filter(r => r.cells.every(Boolean)).length
    return { all: rows.length, every, some: rows.length - every }
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(r => {
      if (show === 'every' && !r.cells.every(Boolean)) return false
      if (show === 'some' && r.cells.every(Boolean)) return false
      return !q || r.name.toLowerCase().includes(q)
    })
  }, [rows, show, query])

  useEffect(() => setLimit(BATCH), [show, query, slugs])

  const available = catalog.filter(l => !slugs.includes(l.slug))

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-1.5 py-4 font-sans text-[13px] text-mint-700">
        <Link to="/lists" className="transition-colors hover:text-mint-950">
          Lists
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="font-medium text-mint-950">
          Compare
        </span>
      </nav>

      <header className="border-b border-mint-200 pb-8">
        <h1
          className="font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.015em] text-mint-950 sm:text-[2.618rem]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Compare lists
        </h1>
        <p className="mt-4 max-w-[42rem] font-sans text-[17px] leading-relaxed text-mint-700">
          Pick up to three lists. Each row is a drug; each column shows what that list says about it.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2.5 pt-7">
        <span className="mr-1 font-sans text-[12.5px] font-medium text-mint-950">Comparing</span>
        {slugs.map((slug, i) => (
          <span
            key={slug}
            className="flex max-w-full items-center gap-2 rounded-lg border border-hepatica-300 bg-hepatica-100 py-1.5 pl-3 pr-1.5 font-sans text-[13px] font-medium text-hepatica-800"
          >
            <span className="min-w-0 break-words">{lists[i]?.title ?? slug}</span>
            <button
              type="button"
              onClick={() => setSlugs(slugs.filter(s => s !== slug))}
              aria-label={`Remove ${lists[i]?.title ?? slug}`}
              className="flex rounded p-1 text-hepatica-700 hover:bg-hepatica-200"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        {slugs.length < MAX_LISTS && available.length > 0 && (
          <label className="flex items-center gap-2">
            <span className="sr-only">Add a list</span>
            <select
              value=""
              onChange={e => e.target.value && setSlugs([...slugs, e.target.value])}
              className="w-full max-w-72 rounded-lg border border-dashed border-mint-500 bg-white px-2.5 py-1.5 font-sans text-[13px] text-mint-900"
            >
              <option value="">+ Add a list</option>
              {available.map(l => (
                <option key={l.slug} value={l.slug}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {slugs.length < 2 ? (
        <p className="py-10 font-sans text-[15px] text-mint-700">
          {slugs.length === 0 ? 'Add two or three lists to compare them.' : 'Add one more list to compare.'}
        </p>
      ) : !ready ? (
        <p className="py-10 font-sans text-[15px] text-mint-700" aria-busy="true">
          Loading lists…
        </p>
      ) : (
        <>
          <div className="mb-4 mt-6 flex flex-wrap items-center gap-4">
            <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-0.5 rounded-lg bg-mint-100 p-0.5 ring-1 ring-inset ring-mint-200">
              {(
                [
                  ['all', 'All'],
                  ['every', 'On every list'],
                  ['some', 'Not on every list'],
                ] as [Show, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={show === key}
                  onClick={() => setShow(key)}
                  className={`rounded-md px-2.5 py-1 font-sans text-[12.5px] whitespace-nowrap ${
                    show === key
                      ? 'bg-white font-medium text-mint-950 shadow-[0_1px_3px_rgb(0_0_0/0.14)] ring-1 ring-mint-200'
                      : 'text-mint-700 hover:text-mint-950'
                  }`}
                >
                  {label} <span className="font-mono text-[11px] text-mint-700">{counts[key].toLocaleString()}</span>
                </button>
              ))}
            </div>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter drugs"
              aria-label="Filter drugs"
              className="w-full rounded-lg border border-mint-200 bg-white px-3 py-1.5 font-sans text-[13.5px] text-mint-950 placeholder:text-mint-700 focus:border-hepatica-400 focus:outline-none sm:w-64"
            />
          </div>

          {/* Wide comparisons scroll inside this box, never the page. */}
          <div className="overflow-x-auto rounded-xl border border-mint-200 bg-white">
            <table className="w-full min-w-[36rem] border-collapse font-sans text-[13.5px]">
              <thead>
                <tr className="border-b border-mint-200 bg-mint-50 text-left text-[12px] text-mint-700">
                  <th scope="col" className="px-4 py-2 font-normal">
                    Drug
                  </th>
                  {shown.map(l => (
                    <th key={l.slug} scope="col" className="px-4 py-2 font-medium text-mint-950">
                      <Link to={`/lists/${l.slug}`} className="hover:text-hepatica-700">
                        {l.title}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map(r => (
                  <tr key={r.pcid} className="border-b border-mint-100 last:border-b-0">
                    <th scope="row" className="px-4 py-2 text-left font-medium">
                      <Link to={`/drugs/${r.slug}`} className="text-mint-950 hover:text-hepatica-700">
                        {r.name}
                      </Link>
                    </th>
                    {r.cells.map((c, i) => (
                      <td key={i} className="px-4 py-2">
                        <Cell item={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length > limit && (
            <button
              type="button"
              onClick={() => setLimit(l => l + BATCH)}
              className="mt-4 rounded-lg border border-hepatica-400 bg-hepatica-400/10 px-4 py-2 font-sans text-[13px] font-medium text-hepatica-700 hover:bg-hepatica-400/20"
            >
              Show more ({(filtered.length - limit).toLocaleString()} left)
            </button>
          )}
          <p className="mt-3 font-sans text-[12.5px] text-mint-700">— means the drug is not on that list.</p>
        </>
      )}
    </main>
  )
}

function Cell({ item }: { item: ListItem | null }) {
  if (!item) {
    return (
      <span className="text-neutral-500" aria-label="Not on this list">
        —
      </span>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      {item.rank !== null && <span className="font-mono text-[12.5px] text-mint-950">#{item.rank}</span>}
      {item.legal_status && (
        <span className="rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-rose-700">
          {item.legal_status}
        </span>
      )}
      {item.rank === null && !item.legal_status && (
        <span className="text-mint-700" aria-label="On this list">
          ✓
        </span>
      )}
    </span>
  )
}
