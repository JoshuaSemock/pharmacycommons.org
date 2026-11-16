import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Stamp from '../components/Stamp'
import Button from '../components/Button'
import { GROUPS, formatCount, groupOf, loadTables, type TableMeta } from '../localTables'

/**
 * /tables: every table, view and materialized view in the local database's public schema,
 * grouped by what it holds. Local app only (LOCAL_TOOLS_ENABLED; docs/local-tables.md).
 *
 * Destination: src/pages/Tables.tsx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const KIND_LABEL: Record<TableMeta['kind'], string> = { r: 'table', p: 'table', v: 'view', m: 'derived' }

export default function Tables() {
  const [tables, setTables] = useState<TableMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const load = (fresh = false) => {
    setError(null)
    loadTables(fresh).then(setTables, (e: Error) => setError(e.message))
  }
  useEffect(() => {
    document.title = 'Tables · Pharmacy Commons'
    load()
  }, [])

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hit = (t: TableMeta) =>
      !q || t.name.includes(q) || (t.comment ?? '').toLowerCase().includes(q) || t.columns.some(c => c.name.includes(q))
    return GROUPS.map(g => ({ group: g, items: (tables ?? []).filter(t => groupOf(t) === g && hit(t)) })).filter(g => g.items.length)
  }, [tables, query])

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <header className="border-b border-ink/15 pb-8 pt-8">
        <h1
          className="font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.015em] text-ink sm:text-[2.618rem]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Tables
        </h1>
        <p className="mt-4 max-w-[42rem] font-sans text-[17px] leading-relaxed text-ink">
          Every table in your local database, read straight from Postgres. Open one to sort, filter, export it as CSV
          or correct a value. This page exists only in the local app; the public site has no database behind it.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 pt-6">
        <label className="lp-field flex min-w-[16rem] flex-1 items-center gap-2 rounded-md px-3 py-2 sm:max-w-md">
          <span className="sr-only">Find a table</span>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Find a table or column"
            className="min-w-0 flex-1 bg-transparent font-sans text-sm text-ink outline-none placeholder:text-ink/60"
          />
        </label>
        <Button size="sm" onClick={() => load(true)}>
          Refresh counts
        </Button>
        {tables && (
          <span className="font-sans text-[13px] text-ink">
            {tables.length} tables and views · counts are Postgres estimates; a table's own page shows the exact count
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="pt-6 font-sans text-[15px] text-ink">
          Could not read the local database: {error}
        </p>
      )}
      {!tables && !error && <p className="pt-6 font-sans text-[15px] text-ink">Reading the catalogue…</p>}

      {grouped.map(({ group, items }) => (
        <section key={group} className="pt-9" aria-labelledby={`g-${group}`}>
          <h2 id={`g-${group}`} className="border-b border-ink/15 pb-2 font-sans text-[19px] font-semibold text-ink">
            {group} <span className="font-normal">({items.length})</span>
          </h2>
          <ul className="divide-y divide-ink/10">
            {items.map(t => (
              <li key={t.name} className="grid gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[minmax(14rem,18rem)_7rem_1fr]">
                <span className="flex items-center gap-2">
                  <Link to={`/tables/${t.name}`} className="lp-press rounded-md px-1.5 py-0.5 font-mono text-[13.5px] text-ink">
                    {t.name}
                  </Link>
                  {t.kind !== 'r' && t.kind !== 'p' && <Stamp>{KIND_LABEL[t.kind]}</Stamp>}
                </span>
                <span className="font-mono text-[13px] text-ink tabular-nums">~{formatCount(t.estimate)} rows</span>
                <span className="font-sans text-[13.5px] text-ink">
                  {t.columns.length} columns
                  {t.comment ? ` · ${t.comment.length > 140 ? t.comment.slice(0, 139) + '…' : t.comment}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
