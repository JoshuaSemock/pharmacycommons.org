/**
 * The record schema as a readable field table, fetched live from
 * /v1/schema/entity.json so it always matches what the API serves.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from 'react'
import { runRequest, schemaFields, type SchemaField } from './client.ts'

export default function SchemaFields({ apiBase }: { apiBase: string }) {
  const [fields, setFields] = useState<SchemaField[] | null>(null)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let live = true
    runRequest(`${apiBase}/v1/schema/entity.json`).then(r => {
      if (!live) return
      if (r.ok && r.json) setFields(schemaFields(r.json))
      else setError(true)
    })
    return () => {
      live = false
    }
  }, [apiBase])

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (fields ?? []).filter(f => !q || f.path.toLowerCase().includes(q) || (f.description ?? '').toLowerCase().includes(q))
  }, [fields, filter])

  if (error) return <p className="font-sans text-[13.5px] text-ink">The schema could not be loaded from the API. Try again in a moment.</p>
  if (!fields) return <p className="font-sans text-[13.5px] text-ink">Loading the schema…</p>

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <input
        type="search"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder={`Filter ${fields.length} fields, e.g. unii, version, brands`}
        aria-label="Filter schema fields"
        className="w-full max-w-md rounded-lg border border-mint-200 bg-white px-3 py-1.5 font-sans text-[14px] text-ink placeholder:text-ink focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-ink/20"
      />
      <div role="region" aria-label="Schema fields" tabIndex={0} className="relative max-h-[30rem] min-w-0 overflow-auto border-y border-mint-200">
        <table className="w-full min-w-[40rem] border-separate border-spacing-0 font-sans text-[13px]">
          <thead className="sticky top-0 z-10 bg-mint-50">
            <tr>
              {['Field', 'Type', 'What it is'].map(h => (
                <th key={h} scope="col" className="border-b border-mint-200 px-3 py-2 text-left font-medium text-ink">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(f => (
              <tr key={f.path} className="align-top">
                <td className="border-b border-mint-100 px-3 py-1.5" style={{ paddingLeft: `${0.75 + f.depth * 1}rem` }}>
                  <code className="font-mono text-[12.5px] text-ink">{f.path.split('.').pop()}</code>
                  {f.required && <span className="ml-1.5 font-sans text-[11px] text-ink">required</span>}
                  {f.depth > 0 && <span className="block font-mono text-[10.5px] text-ink">{f.path}</span>}
                </td>
                <td className="border-b border-mint-100 px-3 py-1.5 font-mono text-[12px] text-ink">{f.type}</td>
                <td className="border-b border-mint-100 px-3 py-1.5 text-ink">{f.description ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
