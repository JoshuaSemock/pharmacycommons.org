import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageTitle } from '@/pages/PageShell'
import { API_BASE, SITE_BASE } from '@/machine'
import { ENDPOINTS, buildUrl, exampleValues, type Endpoint } from '@/developers/endpoints'
import { runRequest } from '@/developers/client'
import Console, { CODE_SURFACE } from '@/developers/Console'
import VersionDiff from '@/developers/VersionDiff'
import SchemaFields from '@/developers/SchemaFields'

/**
 * /developers
 *
 * The public API, made usable by anyone: a live console, the endpoint
 * reference, a version diff, the schema, and the files tools expect
 * (OpenAPI, llms.txt). Everything that describes an endpoint comes from
 * src/developers/endpoints.ts; everything that describes the data comes live
 * from the API itself.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Title · base URL · four facts · section links                │
 *   │ Quickstart (search → record → history)                      │
 *   │ Console (endpoint list │ request · response · code)          │
 *   │ Endpoint reference     Compare versions     Concepts         │
 *   │ Schema fields          Using the data       Files for tools  │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const TITLE = 'Developers'

const SECTIONS: [string, string][] = [
  ['quickstart', 'Quickstart'],
  ['console', 'Console'],
  ['endpoints', 'Endpoints'],
  ['versions', 'Compare versions'],
  ['concepts', 'Concepts'],
  ['schema', 'Schema'],
  ['using-the-data', 'Using the data'],
  ['files', 'Files for tools'],
]

type IndexType = { type: string; label: string; block: number; pcid_range: [string, string]; count: number }

function H2({ id, children, lede }: { id: string; children: ReactNode; lede?: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      {/* Inline size: the global h2 rule in index.css outranks text-* utilities (see CLAUDE.md). */}
      <h2 id={id} className="scroll-mt-28 font-display font-semibold leading-tight text-ink" style={{ fontFamily: 'var(--font-display)', fontSize: '26px' }}>
        {children}
      </h2>
      {lede && <p className="max-w-[46rem] font-sans text-[15px] leading-relaxed text-ink">{lede}</p>}
    </div>
  )
}

function CodeBlock({ children, label }: { children: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className={`${CODE_SURFACE} relative min-w-0 rounded-xl`}>
      {label && <p className="border-b border-white/10 px-4 py-1.5 font-sans text-[12px] text-ink">{label}</p>}
      <button
        type="button"
        onClick={() =>
          navigator.clipboard?.writeText(children).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }
        className="absolute right-2 top-1.5 rounded-md px-2 py-1 font-sans text-[12px] text-ink hover:bg-white/10"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className={`m-0 overflow-x-auto py-3 pl-4 font-mono text-[12.5px] leading-relaxed ${label ? 'pr-4' : 'pr-20'}`}>
        <code>{children}</code>
      </pre>
    </div>
  )
}

const link = 'text-ink underline decoration-hepatica-300 underline-offset-2 hover:decoration-hepatica-600'

export default function Developers() {
  const [, setParams] = useSearchParams()
  const [index, setIndex] = useState<{ api_version?: string; schema_version?: string; entity_types?: IndexType[]; tracking_since?: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    document.title = `${TITLE} · Pharmacy Commons`
  }, [])

  useEffect(() => {
    let live = true
    runRequest(`${API_BASE}/v1`).then(r => {
      if (live && r.ok && r.json) setIndex(r.json as typeof index)
    })
    return () => {
      live = false
    }
  }, [])

  const tryIt = (e: Endpoint) => {
    const sp = new URLSearchParams({ ep: e.id })
    for (const [k, v] of Object.entries(exampleValues(e))) if (v) sp.set(k, v)
    setParams(sp, { replace: true, preventScrollReset: true })
    document.getElementById('console')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const total = index?.entity_types?.reduce((t, x) => t + (x.count ?? 0), 0)

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <header className="grid gap-6 pt-10 pb-8 sm:pt-14">
        <PageTitle
          title={TITLE}
          lede="Every Pharmacy Commons record is also data: structured JSON and linked-data JSON-LD at a permanent address, with every version and every change kept. No key, no sign-up. Try it below, then copy the code."
        />

        <div className={`${CODE_SURFACE} flex min-w-0 max-w-[52rem] flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3`}>
          <span className="font-sans text-[12.5px] text-ink">API base</span>
          <code className="min-w-0 flex-1 break-all font-mono text-[14px] text-ink">{API_BASE}</code>
          <button
            type="button"
            onClick={() =>
              navigator.clipboard?.writeText(API_BASE).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
            }
            className="rounded-md px-2 py-1 font-sans text-[12.5px] text-ink hover:bg-white/10"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <ul className="grid max-w-[60rem] gap-x-8 gap-y-2 font-sans text-[14px] text-ink sm:grid-cols-2">
          <li>
            <b className="font-semibold">No key, no sign-up.</b> Open to any site or script (CORS allows every origin).
          </li>
          <li>
            <b className="font-semibold">Read-only and cached.</b> GET only; answers are cached for 5 minutes, and records carry an ETag.
          </li>
          <li>
            <b className="font-semibold">Permanent identifiers.</b> {total ? `${total.toLocaleString()} records, each` : 'Each record'} with a PCID that is never reused.
          </li>
          <li>
            <b className="font-semibold">Free to use.</b> Pharmacy Commons content is CC0; third-party fields keep their source terms.
          </li>
        </ul>

        <nav aria-label="On this page" className="flex flex-wrap gap-x-5 gap-y-1 border-y border-mint-200 py-2 font-sans text-[14px]">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-ink hover:underline">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-14">
        {/* Quickstart */}
        <section aria-labelledby="quickstart" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <H2 id="quickstart" lede="Three requests cover most uses: find a record by name, fetch it, and see how it has changed.">
            Quickstart
          </H2>
          <ol className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
            {[
              ['Find it', 'Search by generic name, brand or class. Each result carries its PCID and a link to the full record.', `curl "${API_BASE}/v1/search?q=glucophage"`],
              ['Fetch it', 'One request returns the whole record: identifiers, classes, brands, relationships and where each fact came from.', `curl "${API_BASE}/v1/entities/PCID-1001923"`],
              ['Follow it', 'Every change is kept, field by field. Store the version number or ETag and you can always tell what moved.', `curl "${API_BASE}/v1/entities/PCID-1001923/changes?limit=5"`],
            ].map(([title, text, code], i) => (
              <li key={title} className="grid min-w-0 content-start gap-2">
                <p className="font-sans text-[15px] font-semibold text-ink">
                  <span className="mr-2 font-mono text-[13px] text-ink">{i + 1}</span>
                  {title}
                </p>
                <p className="font-sans text-[14px] leading-relaxed text-ink">{text}</p>
                <CodeBlock>{code}</CodeBlock>
              </li>
            ))}
          </ol>
        </section>

        {/* Console */}
        <section aria-labelledby="console" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <H2 id="console" lede="Pick an endpoint, fill in a record by name or PCID, and run it against the live API. The address bar keeps the request, so you can share it.">
            Console
          </H2>
          <Console apiBase={API_BASE} />
        </section>

        {/* Endpoint reference */}
        <section aria-labelledby="endpoints" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <H2 id="endpoints" lede="All endpoints answer GET (and HEAD). Errors are JSON with a stable code: {&quot;error&quot;: true, &quot;status&quot;, &quot;code&quot;, &quot;message&quot;}.">
            Endpoints
          </H2>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
            {ENDPOINTS.map(e => (
              <article key={e.id} id={`endpoint-${e.id}`} className="grid min-w-0 scroll-mt-28 gap-3 border-t border-mint-200 pt-4">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="rounded bg-mint-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink">GET</span>
                  <code className="min-w-0 break-all font-mono text-[14px] font-medium text-ink">{e.path}</code>
                  <span className="font-sans text-[14px] text-ink">{e.summary}</span>
                  <button type="button" onClick={() => tryIt(e)} className="ml-auto rounded-lg border border-mint-300 px-3 py-1 font-sans text-[12.5px] font-medium text-ink hover:border-mint-400">
                    Try it
                  </button>
                </div>
                <p className="max-w-[60rem] font-sans text-[14px] leading-relaxed text-ink">{e.description}</p>
                {e.params.length > 0 && (
                  <div role="region" aria-label={`${e.label} parameters`} tabIndex={0} className="relative min-w-0 overflow-x-auto">
                    <table className="w-full min-w-[34rem] border-collapse font-sans text-[13px]">
                      <thead>
                        <tr>
                          {['Parameter', 'Where', 'Type', 'What it does'].map(h => (
                            <th key={h} scope="col" className="border-b border-mint-200 py-1.5 pr-3 text-left font-medium text-ink">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {e.params.map(p => (
                          <tr key={p.name} className="align-top">
                            <td className="border-b border-mint-100 py-1.5 pr-3">
                              <code className="font-mono text-[12.5px] text-ink">{p.name}</code>
                              {p.required && <span className="ml-1.5 text-[11px] text-ink">required</span>}
                            </td>
                            <td className="border-b border-mint-100 py-1.5 pr-3 text-ink">{p.in}</td>
                            <td className="border-b border-mint-100 py-1.5 pr-3 font-mono text-[12px] text-ink">
                              {p.type === 'ref' ? 'PCID or slug' : p.type === 'types' ? 'comma list' : p.type}
                              {p.min != null && p.max != null && ` ${p.min}–${p.max}`}
                            </td>
                            <td className="border-b border-mint-100 py-1.5 text-ink">
                              {p.description}
                              {p.default && <span className="text-ink"> Default {p.default}.</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="flex flex-wrap gap-x-5 gap-y-1 font-sans text-[12.5px] text-ink">
                  <span>
                    Cached {e.cacheSeconds >= 31536000 ? '1 year (immutable)' : e.cacheSeconds >= 3600 ? `${e.cacheSeconds / 3600} hour` : `${e.cacheSeconds / 60} min`}
                  </span>
                  {e.jsonld && <span>Add .jsonld for linked data</span>}
                  {e.errors.map(x => (
                    <span key={x.code}>
                      <code className="font-mono">{x.status} {x.code}</code>: {x.when}
                    </span>
                  ))}
                </p>
                <p className="min-w-0 break-all font-mono text-[12px] text-ink">
                  Example: <a href={buildUrl(e, exampleValues(e), API_BASE)} target="_blank" rel="noreferrer" className={link}>{buildUrl(e, exampleValues(e), API_BASE)}</a>
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* Compare versions */}
        <section aria-labelledby="versions" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <H2
            id="versions"
            lede="Records change as sources update and editors review them. Every version is kept at its own permanent address, so any two can be compared. This is built from the same public endpoints you can call."
          >
            Compare versions
          </H2>
          <VersionDiff apiBase={API_BASE} />
        </section>

        {/* Concepts */}
        <section aria-labelledby="concepts" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <H2 id="concepts">Concepts</H2>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
            <div className="grid min-w-0 content-start gap-3 font-sans text-[14.5px] leading-relaxed text-ink">
              <h3 className="font-sans font-semibold text-ink" style={{ fontSize: '16px' }}>
                PCIDs, slugs and addresses
              </h3>
              <p>
                A <b>PCID</b> (Pharmacy Commons Identifier) is the one permanent key for a record, such as <code className="font-mono text-[13px]">PCID-1001923</code> for metformin. It is never reused. A retired PCID answers{' '}
                <code className="font-mono text-[13px]">410 Gone</code> and names its replacement.
              </p>
              <p>
                <b>Slugs</b> (<code className="font-mono text-[13px]">metformin</code>) are readable addresses that resolve to the PCID. Use them to look things up; store the PCID.
              </p>
              <p>
                Every document has an <code className="font-mono text-[13px]">@id</code>: <code className="break-all font-mono text-[13px]">{SITE_BASE}/id/PCID-n</code>. It is both the record's identity in linked data and a working link to its page.
              </p>
              <h3 className="font-sans font-semibold text-ink" style={{ fontSize: '16px' }}>
                Versions and changes
              </h3>
              <p>
                <b>Versions</b> are whole snapshots, identified by a SHA-256 hash of the content; a new one is recorded only when the content actually changes. <b>Changes</b> are the field-level log behind them, with the old value, the new value, and the run that
                made the edit. The ETag of a record is its version hash, so <code className="font-mono text-[13px]">If-None-Match</code> tells you cheaply whether anything moved.
              </p>
              <h3 className="font-sans font-semibold text-ink" style={{ fontSize: '16px' }}>
                Provenance
              </h3>
              <p>
                <code className="font-mono text-[13px]">provenance.sources[]</code> lists where the record's facts came from, with each source's license or terms. Class assignments made by a rule or an AI-assisted review carry{' '}
                <code className="font-mono text-[13px]">machine_assisted: true</code>. Where sources disagree, the record says so rather than choosing silently.
              </p>
            </div>
            <div className="grid min-w-0 content-start gap-2">
              <h3 className="font-sans font-semibold text-ink" style={{ fontSize: '16px' }}>
                Record types
              </h3>
              <p className="font-sans text-[14px] text-ink">Each type has its own block of PCIDs, so the number alone tells you what kind of record it is.{index ? ' Counts are live.' : ''}</p>
              <div role="region" aria-label="Record types" tabIndex={0} className="relative min-w-0 overflow-x-auto border-y border-mint-200">
                <table className="w-full min-w-[28rem] border-collapse font-sans text-[13px]">
                  <thead className="bg-mint-50">
                    <tr>
                      {['Block', 'Type', 'PCID range', 'Records'].map(h => (
                        <th key={h} scope="col" className="border-b border-mint-200 px-3 py-2 text-left font-medium text-ink">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(index?.entity_types ?? FALLBACK_TYPES).map(t => (
                      <tr key={t.type}>
                        <td className="border-b border-mint-100 px-3 py-1.5 font-mono text-[12.5px]">{t.block}</td>
                        <td className="border-b border-mint-100 px-3 py-1.5">
                          {t.label} <code className="font-mono text-[11.5px] text-ink">{t.type}</code>
                        </td>
                        <td className="border-b border-mint-100 px-3 py-1.5 font-mono text-[12px] text-ink">
                          {t.pcid_range[0]}–{t.pcid_range[1].replace('PCID-', '')}
                        </td>
                        <td className="border-b border-mint-100 px-3 py-1.5 text-right font-mono text-[12.5px] tabular-nums">{t.count ? t.count.toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Schema */}
        <section aria-labelledby="schema" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <H2
            id="schema"
            lede={
              <>
                Every record, in every block, has one shape. Sections with no data are left out rather than sent empty. This table is read live from{' '}
                <a href={`${API_BASE}/v1/schema/entity.json`} target="_blank" rel="noreferrer" className={link}>
                  the JSON Schema
                </a>
                .
              </>
            }
          >
            Schema
          </H2>
          <SchemaFields apiBase={API_BASE} />
        </section>

        {/* Using the data */}
        <section aria-labelledby="using-the-data" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <H2 id="using-the-data">Using the data</H2>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 font-sans text-[14.5px] leading-relaxed text-ink lg:grid-cols-2">
            <div className="grid content-start gap-3">
              <p>
                <b>License.</b> Content written by Pharmacy Commons (identifiers, records, relationships and curation) is dedicated to the public domain under{' '}
                <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer" className={link}>
                  CC0 1.0
                </a>
                . Fields that come from a third-party source keep that source's terms, listed in each record's <code className="font-mono text-[13px]">provenance.sources[]</code>. ATC, ChemOnt and CAS data restrict commercial reuse.
              </p>
              <p>
                <b>Fair use.</b> There is no key and no hard rate limit today. Please cache what you fetch, use <code className="font-mono text-[13px]">If-None-Match</code> to refresh, and{' '}
                <a href="mailto:contact@pharmacycommons.org?subject=API%20bulk%20access" className={link}>
                  write to us
                </a>{' '}
                before pulling many thousands of records.
              </p>
              <p>
                <b>Not medical advice.</b> The data is for education and research. It does not replace a pharmacist, prescriber or the product labeling.
              </p>
            </div>
            <div className="grid min-w-0 content-start gap-2">
              <p>
                <b>Citing a record.</b> Cite the PCID and the version you used, so a reader can see exactly what you saw:
              </p>
              <CodeBlock label="Example">{`Pharmacy Commons. metformin (PCID-1001923), version 2. ${SITE_BASE}/id/PCID-1001923. Accessed ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`}</CodeBlock>
              <p className="text-[13.5px] text-ink">
                More citation styles are on the{' '}
                <a href="/references" className={link}>
                  References
                </a>{' '}
                page and on every drug page.
              </p>
            </div>
          </div>
        </section>

        {/* Files for tools */}
        <section aria-labelledby="files" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <H2 id="files" lede="Standard descriptions of the API, for the tools engineers already use.">
            Files for tools
          </H2>
          <ul className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ['OpenAPI 3.1', '/openapi.json', 'Import into Postman, Insomnia or Swagger UI, or generate a typed client.'],
              ['llms.txt', '/llms.txt', 'A short guide for AI agents and assistants that use the API.'],
              ['JSON Schema', `${API_BASE}/v1/schema/entity.json`, 'The record contract (2020-12). Validate responses or generate types.'],
              ['JSON-LD context', `${API_BASE}/v1/context.jsonld`, 'Maps fields to schema.org and the Pharmacy Commons vocabulary.'],
              ['API index', `${API_BASE}/v1`, 'Record types, counts, data sources and every endpoint, as JSON.'],
              ['Source code', 'https://github.com/JoshuaSemock/pharmacycommons.org/tree/main/supabase/functions/api', 'The API is open source (GPL-3.0). Issues and pull requests welcome.'],
            ].map(([title, href, text]) => (
              <li key={title} className="grid min-w-0 content-start gap-1 border-t border-mint-200 pt-3">
                <a href={href} target={href.startsWith('/') ? undefined : '_blank'} rel="noreferrer" className={`font-sans text-[15px] font-semibold ${link}`}>
                  {title}
                </a>
                <code className="min-w-0 break-all font-mono text-[11.5px] text-ink">{href.startsWith('/') ? `${SITE_BASE}${href}` : href}</code>
                <p className="font-sans text-[13.5px] text-ink">{text}</p>
              </li>
            ))}
          </ul>
          {index && (
            <p className="font-sans text-[13px] text-ink">
              API {index.api_version} · schema {index.schema_version}
              {index.tracking_since && <> · changes tracked since {new Date(index.tracking_since).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</>}
            </p>
          )}
        </section>
      </div>
    </main>
  )
}

/** Shown until the live /v1 index answers (and if it can't). Counts left blank on purpose. */
const FALLBACK_TYPES: IndexType[] = [
  ['moiety', 'Active moiety'],
  ['combination', 'Combination product'],
  ['precise_form', 'Precise form (salt, ester, stereoisomer)'],
  ['formulation', 'Marketed formulation'],
  ['class', 'Pharmacologic class'],
  ['clinical', 'Clinical concept'],
  ['measurement', 'Measurement'],
  ['target', 'Biological target'],
  ['functional', 'Functional group'],
].map(([type, label], i) => ({ type, label, block: i + 1, pcid_range: [`PCID-${i + 1}000001`, `PCID-${i + 1}999999`] as [string, string], count: 0 }))
