/**
 * The Developers console: pick an endpoint, fill in its parameters, run it
 * against the live API, read the response, and copy the same request as code.
 *
 * State lives in the page's query string (?ep=entity&ref=PCID-1001923), so a
 * console view is a shareable link; opening one runs it.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ENDPOINTS,
  ENDPOINT_BY_ID,
  SNIPPET_LANGS,
  buildUrl,
  exampleValues,
  isEndpointId,
  missingParams,
  snippet,
  type Endpoint,
  type EndpointId,
  type Format,
  type ParamValues,
  type SnippetLang,
} from './endpoints.ts'
import { formatBytes, runRequest, type ApiResult } from './client.ts'
import JsonView from './JsonView.tsx'
import RefPicker from './RefPicker.tsx'

export type ConsoleExample = { label: string; ep: EndpointId; values?: ParamValues; fmt?: Format }

export const EXAMPLES: ConsoleExample[] = [
  { label: 'Find a drug by brand', ep: 'search', values: { q: 'Glucophage' } },
  { label: 'A class by abbreviation', ep: 'search', values: { q: 'ssri' } },
  { label: 'Metformin, in full', ep: 'entity', values: { ref: 'PCID-1001923' } },
  { label: 'Metformin as linked data', ep: 'entity', values: { ref: 'PCID-1001923' }, fmt: 'jsonld' },
  { label: 'What changed in metformin', ep: 'changes', values: { ref: 'PCID-1001923', limit: '10' } },
  { label: 'Metformin as first recorded', ep: 'version', values: { ref: 'PCID-1001923', n: '1' } },
  { label: 'Drugs in the biguanide class', ep: 'members', values: { ref: 'PCID-5001822' } },
]

const STATUS_TONE = (s: number) =>
  s >= 200 && s < 300 ? 'bg-mint-400/25 text-ink' : s === 304 ? 'bg-sky-300/25 text-ink' : s >= 400 && s < 500 ? 'bg-marigold-400/25 text-ink' : 'bg-rose-400/25 text-ink'

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = useCallback((text: string, what: string) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(what)
        setTimeout(() => setCopied(c => (c === what ? null : c)), 1600)
      },
      () => setCopied('Copy blocked by the browser'),
    )
  }, [])
  return { copied, copy }
}

export default function Console({ apiBase }: { apiBase: string }) {
  const [params, setParams] = useSearchParams()
  const epParam = params.get('ep') ?? ''
  const ep: Endpoint = ENDPOINT_BY_ID.get(isEndpointId(epParam) ? epParam : 'search') ?? ENDPOINTS[0]
  const format: Format = params.get('fmt') === 'jsonld' && ep.jsonld ? 'jsonld' : 'json'

  const values: ParamValues = useMemo(() => {
    const v = exampleValues(ep)
    if (isEndpointId(epParam)) for (const p of ep.params) v[p.name] = params.get(p.name) ?? (p.required ? v[p.name] : '')
    return v
  }, [ep, epParam, params])

  const url = buildUrl(ep, values, apiBase, format)
  const missing = missingParams(ep, values)

  const [result, setResult] = useState<ApiResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'body' | 'headers'>('body')
  const [lang, setLang] = useState<SnippetLang>('curl')
  const { copied, copy } = useCopy()
  const abort = useRef<AbortController | null>(null)
  const autoRan = useRef(false)

  const update = (next: { ep?: EndpointId; values?: ParamValues; fmt?: Format }) => {
    const e = ENDPOINT_BY_ID.get(next.ep ?? ep.id) ?? ep
    const vals = next.values ?? (next.ep && next.ep !== ep.id ? exampleValues(e) : values)
    const sp = new URLSearchParams()
    sp.set('ep', e.id)
    for (const p of e.params) if ((vals[p.name] ?? '') !== '') sp.set(p.name, vals[p.name])
    const fmt = next.fmt ?? (next.ep && next.ep !== ep.id ? 'json' : format)
    if (fmt === 'jsonld' && e.jsonld) sp.set('fmt', 'jsonld')
    setParams(sp, { replace: true, preventScrollReset: true })
  }

  const run = useCallback(
    async (opts: { etag?: string; target?: string } = {}) => {
      const target = opts.target ?? url
      abort.current?.abort()
      const ctrl = new AbortController()
      abort.current = ctrl
      setBusy(true)
      const r = await runRequest(target, { etag: opts.etag, signal: ctrl.signal })
      if (!ctrl.signal.aborted) {
        setResult(r)
        setBusy(false)
      }
    },
    [url],
  )

  // A shared link (?ep=…) runs on arrival.
  useEffect(() => {
    if (autoRan.current || !isEndpointId(epParam) || missing.length) return
    autoRan.current = true
    void run()
  }, [epParam, missing.length, run])

  const loadPcid = (pcid: string) => {
    const vals = { ref: pcid }
    update({ ep: 'entity', values: vals, fmt: 'json' })
    void run({ target: buildUrl(ENDPOINT_BY_ID.get('entity')!, vals, apiBase) })
    document.getElementById('console')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const etag = result?.headers.find(([k]) => k === 'etag')?.[1]

  return (
    <div
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]"
      onKeyDown={e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !missing.length) {
          e.preventDefault()
          void run()
        }
      }}
    >
      {/* Endpoint list */}
      <nav aria-label="Endpoints" className="min-w-0">
        <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 lg:hidden">
          <span className="font-sans text-[12.5px] font-medium text-ink">Endpoint</span>
          <select
            value={ep.id}
            onChange={e => isEndpointId(e.target.value) && update({ ep: e.target.value })}
            className="lp-field w-full min-w-0 rounded-md px-3 py-1.5 font-sans text-[14px] text-ink"
          >
            {ENDPOINTS.map(e => (
              <option key={e.id} value={e.id}>
                {e.label} — {e.path}
              </option>
            ))}
          </select>
        </label>
        <ul className="hidden gap-0.5 lg:grid">
          {ENDPOINTS.map(e => {
            const on = e.id === ep.id
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => update({ ep: e.id })}
                  aria-current={on ? 'true' : undefined}
                  className={`grid w-full gap-0.5 rounded-lg px-3 py-2 text-left transition-colors ${on ? 'bg-hepatica-100 text-ink' : 'text-ink hover:bg-mint-50'}`}
                >
                  <span className="font-sans text-[14px] font-medium">{e.label}</span>
                  <span className={`truncate font-mono text-[11px] ${on ? 'text-ink' : 'text-ink'}`}>{e.path}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        {/* Request */}
        <div className="grid min-w-0 gap-3 border-t border-ink/15 pt-4">
          <div>
            <p className="font-sans text-[15px] font-semibold text-ink">{ep.summary}</p>
            <p className="mt-0.5 max-w-[60rem] font-sans text-[13.5px] leading-relaxed text-ink">{ep.description}</p>
          </div>

          {(ep.params.length > 0 || ep.jsonld) && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {ep.params.map(p => {
                const fid = `console-${p.name}`
                const set = (v: string) => update({ values: { ...values, [p.name]: v } })
                return (
                  <div key={p.name} className="grid min-w-0 content-start gap-1">
                    <label htmlFor={fid} className="flex flex-wrap items-baseline gap-x-2 font-sans text-[12.5px] font-medium text-ink">
                      <span className="font-mono">{p.name}</span>
                      <span className="font-normal text-ink">
                        {p.in === 'path' ? 'in the path' : 'query'}
                        {p.required ? ' · required' : p.default ? ` · default ${p.default}` : ''}
                      </span>
                    </label>
                    {p.type === 'ref' ? (
                      <RefPicker
                        id={fid}
                        value={values[p.name] ?? ''}
                        onChange={set}
                        apiBase={apiBase}
                        types={ep.id === 'members' ? 'class' : 'moiety,combination,class,precise_form,formulation'}
                        placeholder="Type a name, or a PCID"
                        onEnter={() => !missing.length && void run()}
                      />
                    ) : p.type === 'boolean' ? (
                      <select id={fid} value={values[p.name] || p.default || 'false'} onChange={e => set(e.target.value)} className={fieldClass}>
                        <option value="false">false</option>
                        <option value="true">true</option>
                      </select>
                    ) : (
                      <input
                        id={fid}
                        type={p.type === 'integer' ? 'number' : 'text'}
                        inputMode={p.type === 'integer' ? 'numeric' : undefined}
                        min={p.min}
                        max={p.max}
                        spellCheck={false}
                        value={values[p.name] ?? ''}
                        placeholder={p.default ?? ''}
                        onChange={e => set(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !missing.length && void run()}
                        className={fieldClass}
                      />
                    )}
                    <span className="font-sans text-[12px] leading-snug text-ink">
                      {p.description}
                      {p.options && <> Options: {p.options.join(', ')}.</>}
                    </span>
                  </div>
                )
              })}
              {ep.jsonld && (
                <div className="grid content-start gap-1">
                  <span className="font-sans text-[12.5px] font-medium text-ink">Format</span>
                  <div role="radiogroup" aria-label="Format" className="flex gap-1.5">
                    {(['json', 'jsonld'] as const).map(f => (
                      <label key={f} className="relative cursor-pointer">
                        <input type="radio" name="console-fmt" checked={format === f} onChange={() => update({ fmt: f })} className="peer sr-only" />
                        <span className="inline-block rounded-md shadow-emboss peer-checked:shadow-deboss px-3 py-1 font-mono text-[12.5px] text-ink peer-focus-visible:ring-2 peer-focus-visible:ring-ink/20">
                          {f === 'json' ? '.json' : '.jsonld'}
                        </span>
                      </label>
                    ))}
                  </div>
                  <span className="font-sans text-[12px] text-ink">JSON-LD adds linked-data types for semantic-web tools.</span>
                </div>
              )}
            </div>
          )}

          {/* URL bar */}
          <div className="flex min-w-0 flex-wrap items-stretch gap-2">
            <div className={`${CODE_SURFACE} flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2`}>
              <span className="shrink-0 rounded bg-mint-400/25 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink">GET</span>
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12.5px] text-ink" aria-label="Request URL">
                {url}
              </code>
              <button type="button" onClick={() => copy(url, 'URL')} className={darkButton}>
                {copied === 'URL' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <button
              type="button"
              disabled={busy || missing.length > 0}
              onClick={() => void run()}
              className="lp-raised lp-press inline-flex items-center gap-2 rounded-md px-4 font-sans text-[14px] font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Running…' : 'Run'}
              <kbd className="hidden rounded border border-white/30 px-1 font-mono text-[10.5px] font-normal sm:inline">Ctrl ↵</kbd>
            </button>
          </div>
          {missing.length > 0 && (
            <p className="font-sans text-[13px] text-ink">Fill in {missing.map(p => p.name).join(' and ')} to run this request.</p>
          )}
        </div>

        {/* Response */}
        <div className={`${CODE_SURFACE} grid min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-xl`} aria-live="polite" aria-busy={busy}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 px-4 py-2.5">
            {result ? (
              result.networkError ? (
                <span className="rounded bg-rose-400/25 px-2 py-0.5 font-mono text-[12px] font-semibold text-ink">No response</span>
              ) : (
                <>
                  <span className={`rounded px-2 py-0.5 font-mono text-[12px] font-semibold ${STATUS_TONE(result.status)}`}>{result.status}</span>
                  <span className="font-mono text-[12px] text-ink">{result.ms} ms</span>
                  <span className="font-mono text-[12px] text-ink">{formatBytes(result.bytes)}</span>
                </>
              )
            ) : (
              <span className="font-sans text-[13px] text-ink">Run a request to see the live response here.</span>
            )}
            {result && !result.networkError && (
              <div role="tablist" aria-label="Response view" className="ml-auto flex gap-1">
                {(['body', 'headers'] as const).map(t => (
                  <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={`${darkButton} ${tab === t ? 'bg-white/20 text-ink' : ''}`}>
                    {t === 'body' ? 'Body' : `Headers (${result.headers.length})`}
                  </button>
                ))}
                {result.json != null && (
                  <button type="button" onClick={() => copy(JSON.stringify(result.json, null, 2), 'JSON')} className={darkButton}>
                    {copied === 'JSON' ? 'Copied' : 'Copy JSON'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="max-h-[36rem] min-h-[10rem] overflow-auto px-4 py-3">
            {!result && (
              <div className="grid gap-2 font-sans text-[13.5px] text-ink">
                <p>Or start from an example:</p>
                <ul className="flex flex-wrap gap-2">
                  {EXAMPLES.map(x => (
                    <li key={x.label}>
                      <button
                        type="button"
                        onClick={() => {
                          const e = ENDPOINT_BY_ID.get(x.ep)!
                          const vals = { ...exampleValues(e), ...x.values }
                          update({ ep: x.ep, values: vals, fmt: x.fmt ?? 'json' })
                          void run({ target: buildUrl(e, vals, apiBase, x.fmt ?? 'json') })
                        }}
                        className="rounded-full border border-white/20 px-3 py-1 text-ink hover:border-white/40"
                      >
                        {x.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result?.networkError && (
              <p className="font-sans text-[13.5px] text-ink">
                The request did not get an answer ({result.networkError}). Check your connection, or try again in a moment.
              </p>
            )}
            {result && !result.networkError && tab === 'headers' && (
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 font-mono text-[12.5px]">
                {result.headers.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-ink">{k}</dt>
                    <dd className="break-all text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {result && !result.networkError && tab === 'body' && (
              <>
                {result.status === 304 && (
                  <p className="mb-2 font-sans text-[13.5px] text-ink">
                    304 Not Modified: the record has not changed since that ETag, so the server sent no body. This is how a client keeps a copy up to date cheaply.
                  </p>
                )}
                {result.json != null ? (
                  <JsonView value={result.json} openDepth={result.bytes < 16000 ? 4 : 2} onPcid={loadPcid} onCopyPath={p => copy(p, `path ${p}`)} />
                ) : (
                  result.text && <pre className="whitespace-pre-wrap font-mono text-[12.5px] text-ink">{result.text}</pre>
                )}
              </>
            )}
          </div>

          {result && !result.networkError && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 px-4 py-2 font-sans text-[12.5px] text-ink">
              {copied?.startsWith('path ') ? <span className="text-ink">Copied {copied.slice(5)}</span> : <span>Click a field name to copy its path. Click a PCID to open that record.</span>}
              {etag && result.status === 200 && (
                <button type="button" onClick={() => void run({ etag, target: result.url })} className={`${darkButton} ml-auto`}>
                  Ask again with If-None-Match
                </button>
              )}
            </div>
          )}
        </div>

        {/* Code */}
        <div className="lp-raised grid min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-md">
          <div role="tablist" aria-label="Code language" className="flex flex-wrap items-center gap-1 border-b border-ink/10 px-3 py-2">
            <span className="mr-2 font-sans text-[12.5px] font-medium text-ink">The same request in</span>
            {SNIPPET_LANGS.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={lang === id}
                type="button"
                onClick={() => setLang(id)}
                className={`rounded-md px-2.5 py-1 font-sans text-[13px] ${lang === id ? 'bg-hepatica-100 font-medium text-ink' : 'text-ink hover:bg-mint-50'}`}
              >
                {label}
              </button>
            ))}
            <button type="button" onClick={() => copy(snippet(lang, url, ep), 'code')} className="lp-raised lp-press ml-auto rounded-md px-2.5 py-1 font-sans text-[12.5px] font-medium text-ink">
              {copied === 'code' ? 'Copied' : 'Copy code'}
            </button>
          </div>
          <pre className={`${CODE_SURFACE} m-0 overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed text-ink`}>
            <code>{snippet(lang, url, ep)}</code>
          </pre>
        </div>
      </div>
    </div>
  )
}

/** The dark "code" surface: black olive from the palette, not pure black. */
export const CODE_SURFACE = 'pc-code bg-neutral-900 text-ink'
const darkButton = 'rounded-md px-2 py-1 font-sans text-[12px] text-ink hover:bg-white/10'
const fieldClass =
  'lp-field w-full min-w-0 rounded-md px-3 py-1.5 font-mono text-[13.5px] text-ink placeholder:text-ink'
