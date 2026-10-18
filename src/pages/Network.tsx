/**
 * /network — the Commons as a graph.
 *
 * Pick a drug, class, condition or target and see what the database records
 * about it as a small network: the classes it belongs to, the products that
 * contain it, and any uses, safety statements and interactions that have been
 * entered. Every line is one stored statement with a defined meaning, a
 * direction and (where it exists) a source; the page never infers a
 * relationship from layout or adds one of its own.
 *
 * Data: network_neighborhood() / network_edge_evidence() (db/phase19_network.sql),
 * read through the public client. State: src/network/model.ts. Drawing:
 * src/network/GraphCanvas.tsx (Cytoscape, loaded on demand). Design and
 * limits: docs/network.md.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '../components/Button'
import Card from '../components/Card'
import GraphCanvas from '../network/GraphCanvas'
import type { CanvasStatus, Selection, ViewCommand } from '../network/GraphCanvas'
import NetworkSearch from '../network/NetworkSearch'
import { Details, RelationTable } from '../network/Details'
import type { EvidenceView } from '../network/Details'
import { NetworkUnavailable, fetchEvidence, fetchNeighborhood, resolveSlug } from '../network/api'
import type { SearchHit } from '../network/api'
import { classTypesPresent, collapse, defaultFilters, emptyGraph, kindsPresent, mergePayload, visibleGraph } from '../network/model'
import { SYSTEMS, systemBadge } from '../classifications'
import type { Filters, GraphState } from '../network/model'
import { GROUPS, GROUP_ORDER, nodeKind } from '../network/predicates'
import type { NetworkGroup } from '../network/predicates'

const TITLE = 'Network'
const STARTERS = ['metformin', 'acetazolamide', 'digoxin']

const CHIP =
  'block rounded-md px-3 py-1 font-sans text-[13px] text-ink lp-chip peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30'

type Load =
  | { s: 'idle' }
  | { s: 'loading' }
  | { s: 'ready' }
  | { s: 'missing' }
  | { s: 'unavailable' }
  | { s: 'error' }

const pageSize = (): number =>
  typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches ? 18 : 40

function parsePcid(raw: string | null): number | null {
  if (!raw) return null
  const m = /^(?:PCID-)?(\d{7,8})$/i.exec(raw.trim())
  return m ? Number(m[1]) : null
}

function LineSample({ style }: { style: 'solid' | 'dashed' | 'dotted' }) {
  const dash = style === 'dashed' ? '8 4' : style === 'dotted' ? '1.5 3.5' : undefined
  return (
    <svg width="30" height="8" aria-hidden="true" className="inline-block shrink-0">
      <line x1="1" y1="4" x2="29" y2="4" stroke="currentColor" strokeWidth="1.6" strokeDasharray={dash} strokeLinecap="round" />
    </svg>
  )
}

export default function Network() {
  const [params, setParams] = useSearchParams()
  const centerPcid = parsePcid(params.get('c'))

  const [graph, setGraph] = useState<GraphState>(emptyGraph)
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [selection, setSelection] = useState<Selection>(null)
  const [load, setLoad] = useState<Load>({ s: 'idle' })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [canvas, setCanvas] = useState<CanvasStatus>('loading')
  const [command, setCommand] = useState<ViewCommand>(null)
  const [evidence, setEvidence] = useState<EvidenceView>({ state: 'idle' })
  const [reload, setReload] = useState(0)
  const cmdN = useRef(0)

  useEffect(() => {
    document.title = `${TITLE} · Pharmacy Commons`
  }, [])

  const send = useCallback((kind: NonNullable<ViewCommand>['kind']) => {
    cmdN.current += 1
    setCommand({ kind, n: cmdN.current })
  }, [])

  // Load the starting concept whenever ?c= changes (or Reset is pressed).
  useEffect(() => {
    setNote(null)
    setSelection(null)
    setFilters(defaultFilters())
    if (centerPcid === null) {
      setGraph(emptyGraph())
      setLoad({ s: 'idle' })
      return
    }
    const ac = new AbortController()
    setLoad({ s: 'loading' })
    fetchNeighborhood(centerPcid, { includeCommunity: true, limit: pageSize(), signal: ac.signal })
      .then(p => {
        if (ac.signal.aborted) return
        if (!p.center) {
          setGraph(emptyGraph())
          setLoad({ s: 'missing' })
          return
        }
        setGraph(mergePayload(emptyGraph(), p, centerPcid, true))
        setSelection({ type: 'node', id: centerPcid })
        setLoad({ s: 'ready' })
        send('fit')
      })
      .catch(err => {
        if (ac.signal.aborted) return
        setGraph(emptyGraph())
        setLoad({ s: err instanceof NetworkUnavailable && err.notDeployed ? 'unavailable' : 'error' })
      })
    return () => ac.abort()
  }, [centerPcid, reload, send])

  // Provenance for a selected line, fetched on demand.
  useEffect(() => {
    if (selection?.type !== 'edge') {
      setEvidence({ state: 'idle' })
      return
    }
    const ac = new AbortController()
    setEvidence({ state: 'loading' })
    fetchEvidence(selection.id, ac.signal)
      .then(record => !ac.signal.aborted && setEvidence({ state: 'ready', record }))
      .catch(() => !ac.signal.aborted && setEvidence({ state: 'ready', record: null }))
    return () => ac.abort()
  }, [selection])

  const expand = useCallback(
    async (pcid: number) => {
      setBusy(true)
      setNote(null)
      try {
        const offset = graph.expanded.get(pcid)?.shown ?? 0
        const p = await fetchNeighborhood(pcid, { includeCommunity: true, limit: pageSize(), offset })
        setGraph(g => mergePayload(g, p, pcid))
        if (p.edges.length === 0) setNote('Nothing more is recorded for this concept.')
      } catch {
        setNote('Those relationships could not be loaded. Try again in a moment.')
      } finally {
        setBusy(false)
      }
    },
    [graph.expanded],
  )

  const pick = useCallback(
    async (hit: SearchHit) => {
      const pcid = hit.pcid ?? (await resolveSlug(hit.slug))
      if (pcid === null) {
        setNote(`Could not find a record for ${hit.name}.`)
        return
      }
      setParams({ c: String(pcid) })
    },
    [setParams],
  )

  const startFresh = useCallback((pcid: number) => setParams({ c: String(pcid) }), [setParams])

  const visible = useMemo(() => visibleGraph(graph, filters), [graph, filters])
  const kinds = useMemo(() => kindsPresent(graph), [graph])
  const systems = useMemo(() => {
    const order = new Map(SYSTEMS.map((x, i) => [x.type, i]))
    return classTypesPresent(graph).sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
  }, [graph])

  // Only offer groups the loaded data actually contains.
  const availableGroups = useMemo(() => {
    const seen = new Set<NetworkGroup>()
    for (const info of graph.expanded.values()) for (const g of GROUP_ORDER) if (info.groupCounts[g]) seen.add(g)
    for (const e of graph.edges.values()) seen.add(e.group)
    return GROUP_ORDER.filter(g => seen.has(g))
  }, [graph])
  const hasCommunity = useMemo(() => [...graph.edges.values()].some(e => e.community), [graph])

  const selectedNode = selection?.type === 'node' ? (graph.nodes.get(selection.id) ?? null) : null
  const selectedEdge = selection?.type === 'edge' ? (graph.edges.get(selection.id) ?? null) : null
  const tablePcid = selectedNode?.pcid ?? (selectedEdge ? selectedEdge.subject : graph.root)
  const root = graph.root !== null ? graph.nodes.get(graph.root) : undefined

  const toggleGroup = (g: NetworkGroup) =>
    setFilters(f => {
      const next = new Set(f.groups)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return { ...f, groups: next }
    })
  const toggleSystem = (t: string) =>
    setFilters(f => {
      const next = new Set(f.hiddenClassTypes)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return { ...f, hiddenClassTypes: next }
    })
  const toggleKind = (k: string) =>
    setFilters(f => {
      const next = new Set(f.hiddenKinds)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return { ...f, hiddenKinds: next }
    })

  const canvasLabel = root
    ? `Graph of ${root.name}: ${visible.nodes.length} concepts and ${visible.edges.length} relationships. The same relationships are listed in the table below the graph.`
    : 'Graph canvas'

  const ready = load.s === 'ready' && root
  const filtersActive = availableGroups.some(g => !filters.groups.has(g)) || filters.hiddenKinds.size > 0 || filters.hiddenClassTypes.size > 0

  return (
    <main className="mx-auto w-full max-w-page px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-6 max-w-[48rem]">
        <h1 className="font-sans text-ink">{TITLE}</h1>
        <p className="mt-2 text-[15px] text-ink">
          The Commons as a graph. Start from a drug, class, condition or target and see what is recorded about it: the
          classes it belongs to, the products that contain it, and the uses, safety statements and interactions that have been
          entered. Each line is one stored statement. It has a direction, a stated meaning and, where one exists, a source.
        </p>
        <p className="mt-2 text-[13px] text-ink">
          A line is not a treatment recommendation, and two concepts sitting near each other on the canvas means nothing.
          Classes with many members show a page at a time. See the{' '}
          <Link to="/disclaimer" className="underline decoration-foil decoration-2 underline-offset-2">
            medical disclaimer
          </Link>
          .
        </p>
      </header>

      <div className="mb-4 max-w-[40rem]">
        <NetworkSearch onPick={pick} disabled={load.s === 'loading'} />
      </div>

      <div aria-live="polite" className="min-h-[1.25rem] text-[13px] text-ink">
        {load.s === 'loading' && 'Loading the network…'}
        {note}
      </div>

      {load.s === 'idle' && (
        <Card className="mt-2 max-w-[40rem]">
          <h2 className="font-sans text-[18px] text-ink">Nothing selected yet</h2>
          <p className="mt-1 text-[13px] text-ink">
            Search above, or open one of these. The graph is built from the relationships stored in the database as they
            stand today; for many drugs that is mostly classes and products, and the page says so rather than filling gaps.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {STARTERS.map(slug => (
              <Button
                key={slug}
                size="sm"
                onClick={async () => {
                  const pcid = await resolveSlug(slug)
                  if (pcid !== null) setParams({ c: String(pcid) })
                  else setNote('That starting point could not be found. Use the search box.')
                }}
              >
                {slug}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {load.s === 'missing' && (
        <Card className="mt-2 max-w-[40rem]">
          <p className="text-[14px] text-ink">There is no record with that PCID. Use the search box to find a concept.</p>
        </Card>
      )}

      {load.s === 'unavailable' && (
        <Card className="mt-2 max-w-[40rem]">
          <h2 className="font-sans text-[18px] text-ink">The network service is not switched on yet</h2>
          <p className="mt-1 text-[13px] text-ink">
            This page reads relationships through database functions that have not been installed on this site. Every
            concept still has its own page, with its classes and products listed there.
          </p>
        </Card>
      )}

      {load.s === 'error' && (
        <Card className="mt-2 max-w-[40rem]">
          <p className="text-[14px] text-ink">The network could not be loaded.</p>
          <div className="mt-2">
            <Button size="sm" onClick={() => setReload(n => n + 1)}>
              Try again
            </Button>
          </div>
        </Card>
      )}

      {ready && root && (
        <div className="mt-2 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <section aria-label="Graph" className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Graph controls">
              <Button size="sm" onClick={() => send('fit')}>Fit to screen</Button>
              <Button size="sm" onClick={() => send('center')}>Center on selection</Button>
              <Button size="sm" onClick={() => send('arrange')}>Re-arrange</Button>
              <Button size="sm" onClick={() => send('tree')}>Tree layout</Button>
              <Button size="sm" onClick={() => setReload(n => n + 1)}>Reset</Button>
            </div>

            <div className="mb-3 space-y-2">
              {availableGroups.length > 0 && (
                <fieldset className="flex flex-wrap items-center gap-2">
                  <legend className="mb-1 text-[13px] text-ink">Show relationships</legend>
                  {availableGroups.map(g => (
                    <label key={g} className="cursor-pointer">
                      <input type="checkbox" className="peer sr-only" checked={filters.groups.has(g)} onChange={() => toggleGroup(g)} />
                      <span className={`${CHIP} inline-flex items-center gap-2`} title={GROUPS[g].meaning}>
                        <LineSample style={GROUPS[g].line} />
                        {GROUPS[g].label}
                      </span>
                    </label>
                  ))}
                  {hasCommunity && (
                    <label className="cursor-pointer">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={filters.includeCommunity}
                        onChange={() => setFilters(f => ({ ...f, includeCommunity: !f.includeCommunity }))}
                      />
                      <span className={CHIP} title="Written by contributors, not from the source data">
                        Contributor-added
                      </span>
                    </label>
                  )}
                </fieldset>
              )}
              {kinds.length > 1 && (
                <fieldset className="flex flex-wrap items-center gap-2">
                  <legend className="mb-1 text-[13px] text-ink">Show kinds of concept</legend>
                  {kinds.map(k => (
                    <label key={k} className="cursor-pointer">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={!filters.hiddenKinds.has(k)}
                        onChange={() => toggleKind(k)}
                        disabled={k === root.entity_type}
                      />
                      <span className={CHIP}>{nodeKind(k).label}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {systems.length > 1 && (
                <fieldset className="flex flex-wrap items-center gap-2">
                  <legend className="mb-1 text-[13px] text-ink">Show classification systems</legend>
                  {systems.map(t => (
                    <label key={t} className="cursor-pointer">
                      <input type="checkbox" className="peer sr-only" checked={!filters.hiddenClassTypes.has(t)} onChange={() => toggleSystem(t)} />
                      <span className={CHIP}>{systemBadge(t)}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {filtersActive && (
                <p className="text-[12.5px] text-ink">
                  Some relationships are hidden by these filters. Nothing is removed; turn them back on to see them.
                </p>
              )}
            </div>

            <div className="lp-sunken relative h-[58vh] min-h-[22rem] overflow-hidden rounded-md lg:h-[36rem]">
              <GraphCanvas
                visible={visible}
                rootId={graph.root}
                selection={selection}
                command={command}
                onSelectNode={pcid => setSelection({ type: 'node', id: pcid })}
                onSelectEdge={id => setSelection({ type: 'edge', id })}
                onClear={() => setSelection(graph.root !== null ? { type: 'node', id: graph.root } : null)}
                onStatus={setCanvas}
                label={canvasLabel}
              />
              {canvas === 'loading' && <p className="absolute inset-0 grid place-items-center text-[13px] text-ink">Preparing the graph…</p>}
              {canvas === 'failed' && (
                <p className="absolute inset-0 grid place-items-center p-6 text-center text-[13px] text-ink">
                  The graph could not be drawn in this browser. The table below lists the same relationships.
                </p>
              )}
            </div>

            <details className="mt-3">
              <summary className="lp-toggle inline-block cursor-pointer rounded-md px-3 py-1 font-sans text-[12.5px] text-ink">
                How to read the graph
              </summary>
              <div className="mt-2 grid gap-4 text-[13px] text-ink sm:grid-cols-2">
                <div>
                  <p className="mb-1 font-sans text-[13px] font-medium text-ink">Concepts</p>
                  <ul className="space-y-0.5">
                    {kinds.map(k => (
                      <li key={k}>
                        {nodeKind(k).label}: {nodeKind(k).shape.replace('-', ' ')}
                      </li>
                    ))}
                    <li>The starting concept has a double border.</li>
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-sans text-[13px] font-medium text-ink">Lines</p>
                  <ul className="space-y-1">
                    {availableGroups.map(g => (
                      <li key={g} className="flex items-start gap-2">
                        <span className="pt-1.5"><LineSample style={GROUPS[g].line} /></span>
                        <span>
                          {GROUPS[g].label}. {GROUPS[g].meaning}
                        </span>
                      </li>
                    ))}
                    <li>The arrow points from the subject of a statement to its object, as recorded.</li>
                  </ul>
                </div>
              </div>
            </details>
          </section>

          <aside aria-label="Details" className="min-w-0">
            <Card className="lg:sticky lg:top-24">
              <Details
                graph={graph}
                selectedNode={selectedNode}
                selectedEdge={selectedEdge}
                evidence={evidence}
                busy={busy}
                onExpand={expand}
                onCollapse={pcid => {
                  setGraph(g => collapse(g, pcid))
                  setNote(null)
                }}
                onSelectNode={pcid => setSelection({ type: 'node', id: pcid })}
                onRecenter={startFresh}
              />
            </Card>
          </aside>
        </div>
      )}

      {ready && (
        <RelationTable
          graph={graph}
          pcid={tablePcid}
          filters={filters}
          onSelectNode={pcid => {
            setSelection({ type: 'node', id: pcid })
            send('center')
          }}
          onSelectEdge={id => setSelection({ type: 'edge', id })}
        />
      )}
    </main>
  )
}
