import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Button from '../components/Button'
import Stamp from '../components/Stamp'
import {
  cellText,
  csvUrl,
  editText,
  formatCount,
  groupOf,
  isSecret,
  loadRows,
  loadTables,
  lockReason,
  parseEdit,
  pcidHref,
  saveCell,
  type ColumnMeta,
  type Row,
  type RowsPage,
  type TableMeta,
} from '../localTables'

/**
 * /tables/:name: one table as a grid. Sort by a column, filter per column (text columns
 * match anywhere, others exactly; type NULL for empty), search every column, page through
 * 100 rows at a time, download the filtered rows as CSV, and click a cell to read or edit
 * it. Edits go through scripts/viteLocalDb.ts, which re-checks the rules, refuses the save
 * if the value changed since it was loaded, and tags the change `tables-ui`.
 * Local app only (docs/local-tables.md).
 *
 * Destination: src/pages/TableView.tsx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const PAGE = 100
const FIELD = 'lp-field block w-full rounded-md px-2 py-1 font-mono text-[12px] text-ink placeholder:text-ink/50 outline-none'

interface Selected {
  row: number
  column: ColumnMeta
}

export default function TableView() {
  const { name = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const [meta, setMeta] = useState<TableMeta | null>(null)
  const [page, setPage] = useState<RowsPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Selected | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [search, setSearch] = useState(params.get('q') ?? '')

  const offset = Math.max(0, Number(params.get('offset')) || 0)
  const sort = params.get('sort')
  const dir = params.get('dir') === 'desc' ? 'desc' : 'asc'

  useEffect(() => {
    document.title = `${name} · Tables · Pharmacy Commons`
    setMeta(null)
    loadTables().then(
      ts => {
        const t = ts.find(x => x.name === name)
        if (t) setMeta(t)
        else setError(`There is no table called ${name} in the local database.`)
      },
      (e: Error) => setError(e.message),
    )
  }, [name])

  // Filter boxes show what the URL holds.
  useEffect(() => {
    const d: Record<string, string> = {}
    for (const [k, v] of params) if (k.startsWith('f.')) d[k.slice(2)] = v
    setDrafts(d)
    setSearch(params.get('q') ?? '')
  }, [params])

  const queryKey = params.toString()
  useEffect(() => {
    if (!meta) return
    const sp = new URLSearchParams(params)
    sp.set('limit', String(PAGE))
    setLoading(true)
    setError(null)
    loadRows(meta.name, sp).then(
      p => { setPage(p); setLoading(false) },
      (e: Error) => { setError(e.message); setLoading(false) },
    )
    // queryKey stands in for params
  }, [meta, queryKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (changes: Record<string, string | null>, resetOffset = true) => {
    const sp = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') sp.delete(k)
      else sp.set(k, v)
    }
    if (resetOffset) sp.delete('offset')
    setParams(sp)
    setSelected(null)
  }

  const toggleSort = (col: string) => {
    if (sort !== col) update({ sort: col, dir: 'asc' })
    else if (dir === 'asc') update({ sort: col, dir: 'desc' })
    else update({ sort: null, dir: null })
  }

  const filtersOn = [...params.keys()].some(k => k.startsWith('f.') || k === 'q')
  const total = page?.total ?? null
  const shownTo = page ? offset + page.rows.length : 0
  const csvParams = useMemo(() => new URLSearchParams(params), [params])

  if (error && !meta) {
    return (
      <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
        <Breadcrumb name={name} />
        <p role="alert" className="font-sans text-[15px] text-ink">{error}</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <Breadcrumb name={name} />
      <header className="border-b border-ink/15 pb-6">
        <h1 className="font-mono text-[1.6rem] font-semibold text-ink sm:text-[2rem]">{name}</h1>
        {meta && (
          <p className="mt-3 max-w-[48rem] font-sans text-[15px] leading-relaxed text-ink">
            {groupOf(meta)} · {meta.columns.length} columns
            {meta.columns.some(c => c.pk) ? ` · key: ${meta.columns.filter(c => c.pk).map(c => c.name).join(', ')}` : ' · no primary key'}
            {meta.comment ? ` · ${meta.comment}` : ''}
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2.5 py-4">
        <form
          className="lp-field flex min-w-[14rem] flex-1 items-center gap-2 rounded-md px-3 py-1.5 sm:max-w-sm"
          onSubmit={e => { e.preventDefault(); update({ q: search.trim() || null }) }}
        >
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search every column, then Enter"
            aria-label="Search every column"
            className="min-w-0 flex-1 bg-transparent font-sans text-sm text-ink outline-none placeholder:text-ink/60"
          />
        </form>
        {filtersOn && (
          <Button size="sm" onClick={() => setParams(new URLSearchParams(sort ? { sort, dir } : {}))}>
            Clear filters
          </Button>
        )}
        {meta && (
          <a href={csvUrl(meta.name, csvParams)} className="lp-press inline-flex items-center rounded-md px-3 py-1 font-sans text-[12.5px] text-ink">
            Download CSV
          </a>
        )}
        <span className="ml-auto font-sans text-[13px] text-ink tabular-nums" aria-live="polite">
          {loading ? 'Loading…' : page ? `${page.rows.length ? formatCount(offset + 1) : 0}–${formatCount(shownTo)} of ${total === null ? `about ${formatCount(page.estimate)}` : formatCount(total)}` : ''}
        </span>
        <Button size="sm" disabled={offset === 0 || loading} onClick={() => update({ offset: String(Math.max(0, offset - PAGE)) }, false)}>
          Previous
        </Button>
        <Button
          size="sm"
          disabled={loading || !page || page.rows.length < PAGE || (total !== null && shownTo >= total)}
          onClick={() => update({ offset: String(offset + PAGE) }, false)}
        >
          Next
        </Button>
      </div>

      {error && <p role="alert" className="pb-3 font-sans text-[14px] text-ink">{error}</p>}

      {meta && (
        <div className="max-h-[72vh] overflow-auto rounded-md border border-ink/15">
          <table className="min-w-full border-collapse font-mono text-[12px] text-ink">
            <thead className="sticky top-0 z-10 bg-paper">
              <tr>
                {meta.columns.map(c => (
                  <th key={c.name} scope="col" className="border-b border-ink/15 px-2 pb-1 pt-2 text-left align-bottom font-normal">
                    <button type="button" onClick={() => toggleSort(c.name)} className="lp-press rounded px-1 text-left" title={`Sort by ${c.name}`}>
                      <span className="block font-semibold">
                        {c.name}
                        {c.pk ? ' (key)' : ''}
                        {sort === c.name ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </span>
                      <span className="block font-sans text-[11px]">{c.type}</span>
                    </button>
                  </th>
                ))}
              </tr>
              <tr>
                {meta.columns.map(c => (
                  <th key={c.name} className="border-b border-ink/15 px-2 pb-2 font-normal">
                    <input
                      value={drafts[c.name] ?? ''}
                      onChange={e => setDrafts(d => ({ ...d, [c.name]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') update({ [`f.${c.name}`]: (drafts[c.name] ?? '').trim() || null }) }}
                      onBlur={() => {
                        const v = (drafts[c.name] ?? '').trim()
                        if (v !== (params.get(`f.${c.name}`) ?? '')) update({ [`f.${c.name}`]: v || null })
                      }}
                      placeholder="filter"
                      aria-label={`Filter ${c.name}`}
                      className={`${FIELD} min-w-[6rem]`}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page?.rows.map((row, i) => (
                <tr key={i} className="border-b border-ink/10 align-top">
                  {meta.columns.map(c => {
                    const v = row[c.name]
                    const href = pcidHref(c.name, v)
                    const isSel = selected?.row === i && selected.column.name === c.name
                    return (
                      <td key={c.name} className={`max-w-[22rem] px-2 py-1.5 ${isSel ? 'lp-sunken' : ''}`}>
                        <button
                          type="button"
                          onClick={() => setSelected({ row: i, column: c })}
                          className="block w-full truncate text-left"
                          title="Open this value"
                        >
                          {isSecret(c.name) && v !== null ? '••••••' : v === null || v === undefined ? <em>NULL</em> : cellText(v)}
                        </button>
                        {href && (
                          <Link to={href} className="font-sans text-[11px] underline decoration-foil underline-offset-2">
                            open
                          </Link>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {page && page.rows.length === 0 && <p className="p-4 font-sans text-[14px] text-ink">No rows match.</p>}
        </div>
      )}

      {meta && selected && page?.rows[selected.row] && (
        <CellPanel
          key={`${selected.row}:${selected.column.name}:${offset}`}
          table={meta}
          column={selected.column}
          row={page.rows[selected.row]}
          onClose={() => setSelected(null)}
          onSaved={value =>
            setPage(p => (p ? { ...p, rows: p.rows.map((r, i) => (i === selected.row ? { ...r, [selected.column.name]: value } : r)) } : p))
          }
        />
      )}
    </main>
  )
}

function Breadcrumb({ name }: { name: string }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-1.5 py-4 font-sans text-[13px] text-ink">
      <Link to="/tables" className="lp-press inline-flex items-center rounded-md px-2 py-0.5">
        Tables
      </Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page" className="font-mono font-medium text-ink">{name}</span>
    </nav>
  )
}

function CellPanel({
  table,
  column,
  row,
  onClose,
  onSaved,
}: {
  table: TableMeta
  column: ColumnMeta
  row: Row
  onClose: () => void
  onSaved: (value: unknown) => void
}) {
  const value = row[column.name]
  const reason = lockReason(table, column)
  const [revealed, setRevealed] = useState(!isSecret(column.name))
  const [text, setText] = useState(editText(value))
  const [isNull, setIsNull] = useState(value === null || value === undefined)
  const [confirming, setConfirming] = useState<unknown>(undefined)
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const key = Object.fromEntries(table.columns.filter(c => c.pk).map(c => [c.name, row[c.name]]))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const review = () => {
    setStatus(null)
    try {
      const next = parseEdit(column.type, text, isNull)
      if (JSON.stringify(next ?? null) === JSON.stringify(value ?? null) || (!isNull && editText(value) === text)) {
        setStatus('Nothing changed.')
        return
      }
      setConfirming(next)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  const save = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const r = await saveCell({ table: table.name, key, column: column.name, oldValue: value ?? null, newValue: confirming })
      onSaved(r.value)
      setStatus('Saved.')
      setConfirming(undefined)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside
      aria-label={`Value of ${column.name}`}
      className="lp-popover pc-grain fixed inset-y-0 right-0 z-40 flex w-full flex-col gap-3 overflow-y-auto bg-paper p-5 sm:w-[30rem]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[15px] font-semibold text-ink">{column.name}</p>
          <p className="font-sans text-[12.5px] text-ink">
            {column.type}
            {column.notnull ? ' · required' : ''} · row {Object.entries(key).map(([k, v]) => `${k} = ${String(v)}`).join(', ') || '(no key)'}
          </p>
        </div>
        <Button size="sm" onClick={onClose}>Close</Button>
      </div>

      {!revealed ? (
        <Button size="sm" onClick={() => setRevealed(true)}>Show hidden value</Button>
      ) : reason ? (
        <>
          <pre className="whitespace-pre-wrap break-words rounded-md border border-ink/15 p-3 font-mono text-[12.5px] text-ink">
            {value === null || value === undefined ? 'NULL' : editText(value)}
          </pre>
          <p className="flex items-center gap-2 font-sans text-[13px] text-ink"><Stamp>read-only</Stamp>{reason}</p>
        </>
      ) : confirming === undefined ? (
        <>
          <textarea
            value={text}
            disabled={isNull}
            onChange={e => setText(e.target.value)}
            rows={Math.min(18, Math.max(4, text.split('\n').length + 1))}
            aria-label={`New value for ${column.name}`}
            className="lp-field w-full rounded-md p-3 font-mono text-[12.5px] text-ink outline-none disabled:opacity-50"
          />
          {!column.notnull && (
            <label className="flex items-center gap-2 font-sans text-[13px] text-ink">
              <input type="checkbox" checked={isNull} onChange={e => setIsNull(e.target.checked)} />
              Empty (NULL)
            </label>
          )}
          <p className="font-sans text-[12.5px] leading-snug text-ink">
            {column.type.endsWith('[]') ? 'A list: write it as JSON, ["a", "b"], or as {a,b}. ' : ''}
            {/^jsonb?\b/.test(column.type) ? 'Must be valid JSON. ' : ''}
            Nothing is saved until you review and confirm.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={review}>Review change</Button>
          </div>
        </>
      ) : (
        <>
          <p className="font-sans text-[14px] font-medium text-ink">Save this change to the local database?</p>
          <p className="font-sans text-[12.5px] text-ink">Before</p>
          <pre className="whitespace-pre-wrap break-words rounded-md border border-ink/15 p-3 font-mono text-[12.5px] text-ink line-through decoration-ink/40">
            {value === null || value === undefined ? 'NULL' : editText(value)}
          </pre>
          <p className="font-sans text-[12.5px] text-ink">After</p>
          <pre className="whitespace-pre-wrap break-words rounded-md border border-ink/15 p-3 font-mono text-[12.5px] text-ink">
            {confirming === null ? 'NULL' : editText(confirming)}
          </pre>
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Confirm and save'}</Button>
            <Button size="sm" disabled={saving} onClick={() => setConfirming(undefined)}>Back</Button>
          </div>
          <p className="font-sans text-[12px] text-ink">
            Recorded in the change log as tables-ui. Last night's backup is in Backups\local-nightly if you need to undo.
          </p>
        </>
      )}

      {status && <p role="status" className="font-sans text-[13.5px] font-medium text-ink">{status}</p>}
    </aside>
  )
}
