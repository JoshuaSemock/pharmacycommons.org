/**
 * Machine-readable panels for a record page.
 *
 *   Sources           — provenance: which source contributed which part of
 *                       the record, under what license, with machine-assisted
 *                       assignments called out. Useful to human readers too.
 *   Machine-readable  — PCID, permanent IRI, JSON/JSON-LD endpoints, current
 *                       version and hash, and a dialog with the full record
 *                       JSON, its version list and its field-level changes.
 *
 * Also embeds the record's schema.org JSON-LD and JSON alternates in <head>
 * (useMachineHead). Data comes from the public `api` Edge Function — the same
 * document any other client gets, not a site-only view of it.
 *
 * Destination: src/MachinePanels.tsx
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  entityUrls,
  getChanges,
  getEntityDocument,
  getVersions,
  useMachineHead,
} from './machine'
import type { ChangeEntry, EntityDocument, ProvenanceSource, VersionListItem } from './machine'

export default function MachinePanels({ pcidCode, slug }: { pcidCode: string; slug: string }) {
  const [doc, setDoc] = useState<EntityDocument | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    setDoc(null)
    setFailed(false)
    getEntityDocument(pcidCode, ctrl.signal)
      .then(setDoc)
      .catch(err => {
        if (ctrl.signal.aborted) return
        console.error(err)
        setFailed(true)
      })
    return () => ctrl.abort()
  }, [pcidCode])

  useMachineHead(doc)

  return (
    <>
      <SourcesCard doc={doc} failed={failed} />
      <MachineCard pcidCode={pcidCode} slug={slug} doc={doc} failed={failed} />
    </>
  )
}

// ─── Sources ─────────────────────────────────────────────────────────────────

const PART_LABEL: Record<string, string> = {
  identity: 'record',
  identifiers: 'identifiers',
  classification: 'classes',
  brands: 'brand names',
  relationships: 'clinical statements',
  labels: 'labels',
  guidelines: 'guidelines',
  structure: 'structure',
}

function SourcesCard({ doc, failed }: { doc: EntityDocument | null; failed: boolean }) {
  if (failed) return null // the Machine-readable card reports the failure once
  const prov = doc?.provenance
  const sources = prov?.sources ?? []

  return (
    <Card title="Sources">
      {!doc ? (
        <Skeleton />
      ) : sources.length === 0 ? (
        <p className="font-sans text-sm text-sage-600">No sources recorded for this entry.</p>
      ) : (
        <>
          <ul className="space-y-3">
            {sources.map(s => (
              <SourceRow key={s.key} source={s} />
            ))}
          </ul>
          {(prov?.record_created || prov?.record_updated) && (
            <p className="mt-4 border-t border-sage-100 pt-3 font-sans text-2xs leading-relaxed text-sage-600">
              {prov.record_created && <>Record created {formatDate(prov.record_created)}</>}
              {prov.record_created && prov.record_updated && ' · '}
              {prov.record_updated && <>updated {formatDate(prov.record_updated)}</>}
            </p>
          )}
        </>
      )}
    </Card>
  )
}

function SourceRow({ source: s }: { source: ProvenanceSource }) {
  const parts = s.contributes.map(p => PART_LABEL[p] ?? p).join(', ')
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        {s.url ? (
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-sans text-sm font-medium leading-snug text-aqua-700 underline-offset-2 hover:underline"
          >
            {s.name}
          </a>
        ) : (
          <span className="font-sans text-sm font-medium leading-snug text-sage-800">{s.name}</span>
        )}
        {s.kind === 'machine_assisted' && (
          <span
            className="shrink-0 rounded border border-amber-400 bg-amber-100 px-1.5 py-px font-sans text-2xs text-sage-800"
            title="Assigned by a rule or an AI-assisted review rather than taken from a published source"
          >
            machine-assisted
          </span>
        )}
      </div>
      <p className="mt-0.5 font-sans text-2xs leading-relaxed text-sage-600">
        {parts}
        {s.license ? (
          <> · {s.license}</>
        ) : s.terms_url ? (
          <>
            {' · '}
            <a href={s.terms_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-sage-900">
              terms
            </a>
          </>
        ) : null}
      </p>
    </li>
  )
}

// ─── Machine-readable ───────────────────────────────────────────────────────

function MachineCard({
  pcidCode,
  slug,
  doc,
  failed,
}: {
  pcidCode: string
  slug: string
  doc: EntityDocument | null
  failed: boolean
}) {
  // The stable addresses don't depend on the fetch — show them regardless.
  const urls = entityUrls(pcidCode, slug)
  const dialog = useRef<HTMLDialogElement>(null)
  const [tab, setTab] = useState<'json' | 'history'>('json')

  function open(which: 'json' | 'history') {
    setTab(which)
    dialog.current?.showModal()
  }

  return (
    <Card title="Machine-readable">
      <div className="space-y-3">
        <UrlRow label="PCID" display={pcidCode} copy={pcidCode} />
        <UrlRow label="Permanent link" display={urls.permanent.replace('https://', '')} copy={urls.permanent} />
        <UrlRow label="JSON" display={`…/v1/entities/${pcidCode}.json`} copy={urls.json} href={urls.json} />
      </div>

      <div className="mt-4 border-t border-sage-100 pt-3">
        {failed ? (
          <p className="font-sans text-sm leading-relaxed text-sage-600">
            The structured record couldn’t be loaded right now. The addresses above still work.
          </p>
        ) : !doc ? (
          <Skeleton />
        ) : (
          <>
            <p className="font-sans text-sm text-sage-800">
              Version {doc.version.number}
              <span className="text-sage-600"> · {reasonLabel(doc.version.reason)} · {formatDate(doc.version.created_at)}</span>
            </p>
            <p className="mt-0.5 font-mono text-2xs text-sage-600" title={doc.version.hash}>
              {doc.version.hash.slice(0, 19)}…
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <SmallButton onClick={() => open('json')}>View record JSON</SmallButton>
              <SmallButton onClick={() => open('history')}>History</SmallButton>
            </div>
          </>
        )}
      </div>

      <p className="mt-4 font-sans text-2xs leading-relaxed text-sage-600">
        <a href={urls.schema} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-sage-900">
          JSON Schema
        </a>
        {' · '}
        <a href={urls.jsonld} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-sage-900">
          JSON-LD
        </a>
        {' · '}
        <a href={urls.index} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-sage-900">
          API index
        </a>
      </p>

      <dialog
        ref={dialog}
        aria-label={`${pcidCode} as structured data`}
        className="m-auto w-[min(56rem,calc(100%-2rem))] max-h-[85vh] overflow-hidden rounded-xl border border-sage-200 bg-white p-0 text-sage-900 backdrop:bg-sage-900/40"
        onClick={e => {
          if (e.target === dialog.current) dialog.current?.close() // click on backdrop
        }}
      >
        {doc && <RecordDialog doc={doc} tab={tab} setTab={setTab} onClose={() => dialog.current?.close()} />}
      </dialog>
    </Card>
  )
}

function RecordDialog({
  doc,
  tab,
  setTab,
  onClose,
}: {
  doc: EntityDocument
  tab: 'json' | 'history'
  setTab: (t: 'json' | 'history') => void
  onClose: () => void
}) {
  return (
    <div className="flex max-h-[85vh] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-sage-100 px-5 py-3">
        <div role="tablist" className="flex gap-1">
          <TabButton active={tab === 'json'} onClick={() => setTab('json')}>
            Record JSON
          </TabButton>
          <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
            History
          </TabButton>
        </div>
        <button
          onClick={onClose}
          className="rounded-md px-2 py-1 font-sans text-sm text-sage-600 hover:bg-sage-100 hover:text-sage-900"
        >
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {tab === 'json' ? <JsonView doc={doc} /> : <HistoryView doc={doc} />}
      </div>
    </div>
  )
}

function JsonView({ doc }: { doc: EntityDocument }) {
  const text = JSON.stringify(doc, null, 2)
  const [copied, setCopied] = useState(false)

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.pcid}.v${doc.version.number}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SmallButton
          onClick={() =>
            navigator.clipboard.writeText(text).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }
        >
          {copied ? 'Copied' : 'Copy JSON'}
        </SmallButton>
        <SmallButton onClick={download}>Download</SmallButton>
        <a
          href={doc.links.self}
          target="_blank"
          rel="noopener noreferrer"
          className="font-sans text-sm text-aqua-700 underline-offset-2 hover:underline"
        >
          Open in API ↗
        </a>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-sage-50 p-4 font-mono text-2xs leading-relaxed text-sage-800">
        {text}
      </pre>
    </div>
  )
}

function HistoryView({ doc }: { doc: EntityDocument }) {
  const [versions, setVersions] = useState<VersionListItem[] | null>(null)
  const [changes, setChanges] = useState<{ changes: ChangeEntry[]; note?: string } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    Promise.all([getVersions(doc.pcid, ctrl.signal), getChanges(doc.pcid, ctrl.signal)])
      .then(([v, c]) => {
        setVersions(v)
        setChanges(c)
      })
      .catch(err => {
        if (ctrl.signal.aborted) return
        console.error(err)
        setFailed(true)
      })
    return () => ctrl.abort()
  }, [doc.pcid])

  if (failed) return <p className="font-sans text-sm text-sage-600">History couldn’t be loaded right now.</p>
  if (!versions || !changes) return <Skeleton />

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section>
        <h3 className="mb-3 font-sans text-sm font-semibold text-sage-800">Versions</h3>
        <ol className="space-y-2.5">
          {versions.map(v => (
            <li key={v.number} className="rounded-lg border border-sage-200 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans text-sm font-medium text-aqua-700 underline-offset-2 hover:underline"
                >
                  Version {v.number}
                </a>
                <span className="font-sans text-2xs text-sage-600">{formatDate(v.created_at)}</span>
              </div>
              <p className="mt-0.5 font-sans text-2xs text-sage-600">
                {reasonLabel(v.reason)}
                {typeof v.changes === 'number' && v.changes > 0 && ` · ${v.changes} ${v.changes === 1 ? 'edit' : 'edits'}`}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-3 font-sans text-2xs leading-relaxed text-sage-600">
          A new version is recorded whenever the record’s content changes — an edit to this entry, or a
          refresh of data derived from its sources. Every version stays readable at its own address.
        </p>
      </section>

      <section>
        <h3 className="mb-3 font-sans text-sm font-semibold text-sage-800">Changes</h3>
        {changes.changes.length === 0 ? (
          <p className="font-sans text-sm leading-relaxed text-sage-600">
            {changes.note ?? 'No edits recorded yet.'}
          </p>
        ) : (
          <ol className="space-y-3">
            {changes.changes.map(c => (
              <li key={c.change_id} className="border-l-2 border-sage-200 pl-3">
                <p className="font-sans text-2xs text-sage-600">
                  {formatDate(c.changed_at)} · {sourceLabel(c)} · {c.table.replace(/_/g, ' ')}
                  {c.row_key && ` #${c.row_key}`}
                </p>
                <dl className="mt-1 space-y-1">
                  {c.fields.map(f => (
                    <div key={f} className="font-mono text-2xs leading-relaxed">
                      <dt className="inline text-sage-600">{f}: </dt>
                      <dd className="inline text-sage-800">
                        {c.op !== 'INSERT' && <del className="text-coral-600">{show(c.diff[f]?.old)}</del>}
                        {c.op === 'UPDATE' && ' → '}
                        {c.op !== 'DELETE' && <ins className="text-aqua-700 no-underline">{show(c.diff[f]?.new)}</ins>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

// ─── Small parts ─────────────────────────────────────────────────────────────

function UrlRow({ label, display, copy, href }: { label: string; display: string; copy: string; href?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <p className="font-sans text-xs uppercase tracking-[0.08em] text-sage-600">{label}</p>
        <button
          onClick={() =>
            navigator.clipboard.writeText(copy).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }
          className="shrink-0 font-sans text-2xs text-sage-600 hover:text-sage-900"
          aria-label={`Copy ${label}`}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={copy}
          className="block break-all font-mono text-2xs leading-relaxed text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-700"
        >
          {display}
        </a>
      ) : (
        <p title={copy} className="break-all font-mono text-2xs leading-relaxed text-sage-800">
          {display}
        </p>
      )}
    </div>
  )
}

function SmallButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-sage-200 bg-white px-2.5 py-1 font-sans text-sm text-sage-700 transition-colors hover:border-aqua-300 hover:text-aqua-700"
    >
      {children}
    </button>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 font-sans text-sm transition-colors ${
        active ? 'bg-sage-100 font-medium text-sage-900' : 'text-sage-600 hover:text-sage-900'
      }`}
    >
      {children}
    </button>
  )
}

/** Same look as DrugDetail's SideCard, so the rail reads as one column. */
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-sage-200 bg-white">
      <div className="border-b border-sage-100 px-4 py-3">
        <h2
          className="font-semibold uppercase tracking-[0.1em] text-sage-600"
          style={{ fontSize: 'var(--text-2xs)', fontFamily: 'var(--font-sans)', lineHeight: 1.4 }}
        >
          {title}
        </h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <div className="h-4 w-4/5 animate-pulse rounded bg-sage-100" />
      <div className="h-4 w-3/5 animate-pulse rounded bg-sage-100" />
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function reasonLabel(reason: VersionListItem['reason']): string {
  return reason === 'baseline' ? 'first recorded' : reason === 'change' ? 'edited' : 'source data refreshed'
}

function sourceLabel(c: ChangeEntry): string {
  if (c.source === 'revision') return c.revision_id ? `community revision #${c.revision_id}` : 'community revision'
  if (c.source === 'direct') return 'database edit'
  return c.source
}

function show(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  return typeof v === 'string' ? v : JSON.stringify(v)
}
