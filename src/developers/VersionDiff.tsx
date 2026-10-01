/**
 * Compare two versions of a record, field by field. Uses the public
 * /versions list and /versions/{n} documents, so what it shows is exactly what
 * any client can reproduce.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useState } from 'react'
import { diffDocuments, runRequest, type DiffRow } from './client.ts'
import RefPicker from './RefPicker.tsx'

type VersionItem = { number: number; reason: string; created_at: string; changes?: number }

const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const show = (v: unknown) => (v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v))

const KIND_STYLE: Record<DiffRow['kind'], string> = {
  added: 'border-l-mint-500 bg-mint-50',
  removed: 'border-l-rose-500 bg-rose-50',
  changed: 'border-l-marigold-500 bg-marigold-50',
}

export default function VersionDiff({ apiBase }: { apiBase: string }) {
  const [ref, setRef] = useState('PCID-1001923')
  const [versions, setVersions] = useState<VersionItem[] | null>(null)
  const [from, setFrom] = useState<number | null>(null)
  const [to, setTo] = useState<number | null>(null)
  const [rows, setRows] = useState<DiffRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadVersions = async () => {
    setError(null)
    setRows(null)
    setBusy(true)
    const r = await runRequest(`${apiBase}/v1/entities/${encodeURIComponent(ref.trim())}/versions`)
    setBusy(false)
    const list = (r.json as { versions?: VersionItem[] } | null)?.versions
    if (!r.ok || !list) {
      setVersions(null)
      setError(r.networkError ? 'The API did not answer. Try again in a moment.' : `No versions found for “${ref}” (HTTP ${r.status}).`)
      return
    }
    setVersions(list)
    setTo(list[0]?.number ?? null)
    setFrom(list[1]?.number ?? list[0]?.number ?? null)
  }

  // Load the default record's history once, so the section opens with something to see.
  useEffect(() => {
    void loadVersions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase])

  const compare = async () => {
    if (from == null || to == null) return
    setBusy(true)
    setError(null)
    const base = `${apiBase}/v1/entities/${encodeURIComponent(ref.trim())}/versions`
    const [a, b] = await Promise.all([runRequest(`${base}/${from}`), runRequest(`${base}/${to}`)])
    setBusy(false)
    if (!a.ok || !b.ok) {
      setError('One of the versions could not be loaded.')
      return
    }
    setRows(diffDocuments(a.json, b.json))
  }

  const counts = rows ? { added: rows.filter(r => r.kind === 'added').length, removed: rows.filter(r => r.kind === 'removed').length, changed: rows.filter(r => r.kind === 'changed').length } : null

  const versionSelect = (label: string, value: number | null, set: (n: number) => void) => (
    <label className="grid min-w-0 gap-1">
      <span className="font-sans text-[12.5px] font-medium text-mint-900">{label}</span>
      <select value={value ?? ''} onChange={e => set(Number(e.target.value))} className="w-full min-w-0 rounded-lg border border-mint-200 bg-white px-3 py-1.5 font-sans text-[13.5px] text-mint-950">
        {versions?.map(v => (
          <option key={v.number} value={v.number}>
            Version {v.number} · {v.reason} · {fmtDate(v.created_at)}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 border-t border-mint-200 pt-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <div className="grid min-w-0 gap-1">
          <label htmlFor="diff-ref" className="font-sans text-[12.5px] font-medium text-mint-900">
            Record
          </label>
          <RefPicker id="diff-ref" value={ref} onChange={setRef} apiBase={apiBase} placeholder="Type a name, or a PCID" onEnter={() => void loadVersions()} />
        </div>
        <button type="button" onClick={() => void loadVersions()} className="rounded-lg border border-mint-300 bg-white px-3 py-1.5 font-sans text-[13px] font-medium text-mint-900 hover:border-mint-400">
          Load history
        </button>
        {versions && versions.length > 0 ? (
          <>
            {versionSelect('From', from, setFrom)}
            {versionSelect('To', to, setTo)}
            <button
              type="button"
              disabled={busy || from == null || to == null || from === to}
              onClick={() => void compare()}
              className="rounded-lg border border-mint-700 bg-mint-700 px-4 py-1.5 font-sans text-[13.5px] font-semibold text-white hover:bg-mint-800 disabled:opacity-50"
            >
              {busy ? 'Comparing…' : 'Compare'}
            </button>
          </>
        ) : (
          <p className="font-sans text-[13px] text-neutral-600 md:col-span-3">{busy ? 'Loading history…' : versions ? 'This record has one version so far.' : ''}</p>
        )}
      </div>

      {versions && versions.length === 1 && <p className="font-sans text-[13.5px] text-neutral-700">Only one version exists, so there is nothing to compare yet.</p>}
      {error && <p className="font-sans text-[13.5px] text-rose-700">{error}</p>}

      {rows && counts && (
        <div className="grid min-w-0 gap-2">
          <p className="font-sans text-[13.5px] text-mint-950">
            {rows.length === 0 ? (
              'No field differs between these versions.'
            ) : (
              <>
                <b className="font-semibold">{rows.length}</b> field{rows.length === 1 ? '' : 's'} differ: {counts.added} added, {counts.removed} removed, {counts.changed} changed.
              </>
            )}
          </p>
          {rows.length > 0 && (
            <ol className="grid max-h-[28rem] min-w-0 gap-1 overflow-auto">
              {rows.map(r => (
                <li key={r.path} className={`grid min-w-0 gap-1 border-l-4 px-3 py-2 ${KIND_STYLE[r.kind]}`}>
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="font-sans text-[11.5px] font-medium text-neutral-700">{r.kind}</span>
                    <code className="break-all font-mono text-[12.5px] text-hepatica-800">{r.path}</code>
                  </span>
                  {r.kind !== 'added' && (
                    <span className="break-words font-mono text-[12px] text-rose-800">
                      <span className="sr-only">Before: </span>− {show(r.before)}
                    </span>
                  )}
                  {r.kind !== 'removed' && (
                    <span className="break-words font-mono text-[12px] text-mint-800">
                      <span className="sr-only">After: </span>+ {show(r.after)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
