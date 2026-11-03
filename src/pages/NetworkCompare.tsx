/**
 * /network/compare — two to four concepts side by side.
 *
 * Shows what the compared concepts share (the same class, list, product or condition) and what
 * only one of them has, from the relationships recorded in the database. "Shared" means both
 * point at the same concept; it does not mean the two statements say the same thing, so every row
 * keeps each concept's own relationship and source. A relationship that is missing here is not
 * evidence that none exists.
 *
 * Data: network_compare() (db/phase32b_network_compare.sql). Model: src/network/compare.ts.
 * Design and limits: docs/network.md.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../components/Button'
import Card from '../components/Card'
import Stamp from '../components/Stamp'
import GraphCanvas from '../network/GraphCanvas'
import type { CanvasStatus, Selection, ViewCommand } from '../network/GraphCanvas'
import NetworkSearch from '../network/NetworkSearch'
import { loadDisplay } from '../network/display'
import { COMPARE_PAGE, NetworkUnavailable, fetchCompare, fetchConcepts, resolveSlug } from '../network/api'
import type { SearchHit } from '../network/api'
import { MAX_COMPARE, MIN_COMPARE, compareGraph, linkPhrase, mergeRows, orderSets, parseCompareParam, setKey, setKind, setTitle } from '../network/compare'
import type { ComparePayload, CompareRow, CompareSet } from '../network/compare'
import { isNonCore } from '../network/model'
import type { NetworkNode } from '../network/model'
import { GROUPS, GROUP_ORDER, nodeKind, pagePath } from '../network/predicates'

const TITLE = 'Compare in Network'

type Load = { s: 'idle' } | { s: 'loading' } | { s: 'ready'; data: ComparePayload } | { s: 'unavailable' } | { s: 'error' }

function SetSection({
  set,
  entities,
  rows,
  loading,
  onMore,
}: {
  set: CompareSet
  entities: NetworkNode[]
  rows: CompareRow[]
  loading: boolean
  onMore: () => void
}) {
  const title = setTitle(set.members, entities)
  const groups = GROUP_ORDER.filter(g => set.groups[g])
  const id = `compare-${setKey(set.members).replace(/,/g, '-')}`
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="font-sans text-[18px] text-ink">
        {title} <span className="text-[14px]">({set.count.toLocaleString('en-US')})</span>
      </h2>
      {groups.length > 0 && (
        <p className="mb-2 text-[13px] text-ink">{groups.map(g => `${GROUPS[g].label}: ${set.groups[g]}`).join(' · ')}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left font-sans text-[13px] text-ink">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="lp-rule-b">
              <th scope="col" className="py-1 pr-3 font-normal">Concept</th>
              <th scope="col" className="py-1 pr-3 font-normal">Kind</th>
              <th scope="col" className="py-1 pr-3 font-normal">Type</th>
              <th scope="col" className="py-1 font-normal">How {set.members.length > 1 ? 'each connects' : 'it connects'}</th>
            </tr>
          </thead>
          <tbody className="lp-divide-y">
            {rows.map(r => {
              const to = pagePath(r.node.entity_type, r.node.slug)
              return (
                <tr key={r.node.pcid}>
                  <td className="py-1.5 pr-3 align-top">
                    {to ? (
                      <Link to={to} className="underline decoration-foil decoration-2 underline-offset-2">
                        {r.node.name}
                      </Link>
                    ) : (
                      r.node.name
                    )}
                    {isNonCore(r.node) && <span> ({r.node.term_type})</span>}
                  </td>
                  <td className="py-1.5 pr-3 align-top">{nodeKind(r.node.entity_type).label}</td>
                  <td className="py-1.5 pr-3 align-top">{GROUPS[r.group].label}</td>
                  <td className="py-1.5 align-top">
                    <ul className="space-y-0.5">
                      {r.links.map(l => (
                        <li key={l.edge.id}>
                          {linkPhrase(l, entities)} {r.node.name}
                          {l.edge.community ? ' (contributor-added)' : ''}
                          {l.edge.direct ? '' : ' (inherited)'}
                          {l.edge.source_agency || l.edge.evidence_level ? ` · ${l.edge.source_agency ?? l.edge.evidence_level}` : ''}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length < set.count && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onMore} disabled={loading}>
            {loading ? 'Loading…' : `Show ${Math.min(COMPARE_PAGE, set.count - rows.length)} more`}
          </Button>
          <span className="text-[13px] text-ink">
            Showing {rows.length.toLocaleString('en-US')} of {set.count.toLocaleString('en-US')}.
          </span>
        </div>
      )}
    </section>
  )
}

export default function NetworkCompare() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const pcids = useMemo(() => parseCompareParam(params.get('c')), [params])
  const idsKey = pcids.join(',')

  const [concepts, setConcepts] = useState<NetworkNode[]>([])
  const [load, setLoad] = useState<Load>({ s: 'idle' })
  const [community, setCommunity] = useState(false)
  const [extra, setExtra] = useState<CompareRow[]>([])
  const [paging, setPaging] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [graphOpen, setGraphOpen] = useState(false)
  const [canvas, setCanvas] = useState<CanvasStatus>('loading')
  const [selection, setSelection] = useState<Selection>(null)
  const [command, setCommand] = useState<ViewCommand>(null)
  const display = useMemo(loadDisplay, [])

  useEffect(() => {
    document.title = `${TITLE} · Pharmacy Commons`
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    fetchConcepts(pcids, ac.signal).then(c => !ac.signal.aborted && setConcepts(c)).catch(() => undefined)
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  useEffect(() => {
    setExtra([])
    setSelection(null)
    if (pcids.length < MIN_COMPARE) {
      setLoad({ s: 'idle' })
      return
    }
    const ac = new AbortController()
    setLoad({ s: 'loading' })
    fetchCompare(pcids, { includeCommunity: community, signal: ac.signal })
      .then(data => !ac.signal.aborted && setLoad({ s: 'ready', data }))
      .catch(err => {
        if (ac.signal.aborted) return
        setLoad({ s: err instanceof NetworkUnavailable && err.notDeployed ? 'unavailable' : 'error' })
      })
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, community, reload])

  const setIds = useCallback(
    // A literal comma keeps the address readable and shareable: ?c=1001923,1001318
    (next: number[]) => navigate({ search: next.length === 0 ? '' : `?c=${next.join(',')}` }),
    [navigate],
  )

  const pick = useCallback(
    async (hit: SearchHit) => {
      const pcid = hit.pcid ?? (await resolveSlug(hit.slug))
      if (pcid === null) {
        setNote(`Could not find a record for ${hit.name}.`)
        return
      }
      if (pcids.includes(pcid)) {
        setNote(`${hit.name} is already in the comparison.`)
        return
      }
      setNote(hit.hint.startsWith('Brand:') ? `${hit.hint.replace('Brand:', '').trim()} is compared as ${hit.name}, the drug it contains.` : null)
      setIds([...pcids, pcid])
    },
    [pcids, setIds],
  )

  const more = useCallback(
    async (set: CompareSet, have: number) => {
      const key = setKey(set.members)
      setPaging(key)
      try {
        const page = await fetchCompare(pcids, { includeCommunity: community, members: set.members, offset: have })
        setExtra(prev => mergeRows(prev, page.rows))
      } catch {
        setNote('That page could not be loaded. Try again in a moment.')
      } finally {
        setPaging(null)
      }
    },
    [pcids, community],
  )

  const data = load.s === 'ready' ? load.data : null
  const entities = data?.entities ?? concepts
  const sets = useMemo(() => (data ? orderSets(data.sets, data.pcids) : []), [data])
  const allRows = useMemo(() => (data ? mergeRows(data.rows, extra) : []), [data, extra])
  const rowsFor = (set: CompareSet) => allRows.filter(r => setKey(r.members) === setKey(set.members))
  const graph = useMemo(() => (data && graphOpen ? compareGraph(data.entities, allRows, data.between) : null), [data, allRows, graphOpen])
  const shared = sets.filter(s => setKind(s.members, entities.length) !== 'only').reduce((n, s) => n + s.count, 0)
  const names = entities.map(e => e.name)

  return (
    <main className="mx-auto w-full max-w-page px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-6 max-w-[48rem]">
        <h1 className="font-sans text-ink">{TITLE}</h1>
        <p className="mt-2 text-[15px] text-ink">
          Pick two to four concepts, such as two drugs or two classes, and see what they have in common and what only one of them
          has: shared classes, lists, products, uses and safety statements. A brand name compares as the drug it contains.
        </p>
        <p className="mt-2 text-[13px] text-ink">
          Shared means both point at the same concept, not that the two statements say the same thing. What is missing here is
          missing from the database, not necessarily from the world. See the{' '}
          <Link to="/disclaimer" className="underline decoration-foil decoration-2 underline-offset-2">
            medical disclaimer
          </Link>
          .
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {entities.map(e => (
          <span key={e.pcid} className="lp-chip inline-flex items-center gap-2 rounded-md px-3 py-1 font-sans text-[13px] text-ink">
            <Link to={`/network?c=${e.pcid}`} className="underline decoration-foil decoration-2 underline-offset-2" title="Open this concept in the Network">
              {e.name}
            </Link>
            <button
              type="button"
              className="lp-press rounded px-1"
              aria-label={`Remove ${e.name} from the comparison`}
              onClick={() => setIds(pcids.filter(p => p !== e.pcid))}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {pcids.length < MAX_COMPARE ? (
        <div className="mb-2 max-w-[40rem]">
          <p className="mb-1 text-[13px] text-ink">
            {pcids.length === 0 ? 'Add the first concept' : pcids.length === 1 ? 'Add a second concept to compare' : 'Add another concept'}
          </p>
          <NetworkSearch onPick={pick} disabled={load.s === 'loading'} />
        </div>
      ) : (
        <p className="mb-2 text-[13px] text-ink">Four concepts is the most that fit side by side. Remove one to add another.</p>
      )}

      <label className="mb-2 mt-3 flex cursor-pointer items-center gap-2 text-[13px] text-ink">
        <input type="checkbox" checked={community} onChange={() => setCommunity(c => !c)} />
        Include contributor-added relationships
      </label>

      <div aria-live="polite" className="min-h-[1.25rem] text-[13px] text-ink">
        {load.s === 'loading' && 'Comparing…'}
        {note}
      </div>

      {load.s === 'idle' && pcids.length < MIN_COMPARE && (
        <Card className="mt-2 max-w-[40rem]">
          <p className="text-[14px] text-ink">
            Try <Link to="/network/compare?c=1001923,1001318" className="underline decoration-foil decoration-2 underline-offset-2">metformin and empagliflozin</Link>{' '}
            (the drug in Jardiance).
          </p>
        </Card>
      )}

      {load.s === 'unavailable' && (
        <Card className="mt-2 max-w-[40rem]">
          <p className="text-[14px] text-ink">The comparison service is not switched on yet.</p>
        </Card>
      )}

      {load.s === 'error' && (
        <Card className="mt-2 max-w-[40rem]">
          <p className="text-[14px] text-ink">The comparison could not be loaded.</p>
          <div className="mt-2">
            <Button size="sm" onClick={() => setReload(n => n + 1)}>
              Try again
            </Button>
          </div>
        </Card>
      )}

      {data && (
        <>
          <Card className="mt-2 max-w-[48rem]">
            <p className="font-sans text-[15px] text-ink">
              {names.join(', ')}: {shared.toLocaleString('en-US')} {shared === 1 ? 'concept is' : 'concepts are'} linked to more than one of them.
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {sets.map(s => (
                <li key={setKey(s.members)}>
                  <Stamp sunken={setKind(s.members, entities.length) === 'only'}>
                    {setTitle(s.members, entities)}: {s.count.toLocaleString('en-US')}
                  </Stamp>
                </li>
              ))}
            </ul>
          </Card>

          {data.between.length > 0 ? (
            <section aria-labelledby="compare-between" className="mt-8">
              <h2 id="compare-between" className="font-sans text-[18px] text-ink">
                Recorded directly between them
              </h2>
              <ul className="mt-1 space-y-0.5 text-[13px] text-ink">
                {data.between.map(e => {
                  const a = entities.find(n => n.pcid === e.subject)
                  const b = entities.find(n => n.pcid === e.object)
                  return (
                    <li key={e.id}>
                      {a?.name} {e.predicate.replace(/_/g, ' ')} {b?.name}
                      {e.source_agency ? ` · ${e.source_agency}` : ''}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : (
            <p className="mt-4 text-[13px] text-ink">
              No relationship is recorded directly between {names.length === 2 ? `${names[0]} and ${names[1]}` : 'these concepts'}. That does
              not mean none exists; for example, interactions are only as complete as the sources loaded so far.
            </p>
          )}

          {sets.length === 0 && <p className="mt-6 text-[13px] text-ink">Nothing is recorded for these concepts yet.</p>}

          {sets.map(s => {
            const rows = rowsFor(s)
            return (
              <SetSection
                key={setKey(s.members)}
                set={s}
                entities={entities}
                rows={rows}
                loading={paging === setKey(s.members)}
                onMore={() => more(s, rows.length)}
              />
            )
          })}

          <details
            className="mt-8"
            onToggle={e => {
              const open = (e.currentTarget as HTMLDetailsElement).open
              setGraphOpen(open)
              if (open) setCommand({ kind: 'fit', n: Date.now() })
            }}
          >
            <summary className="lp-toggle inline-block cursor-pointer rounded-md px-3 py-1 font-sans text-[12.5px] text-ink">
              Show as a graph
            </summary>
            <p className="mt-2 text-[13px] text-ink">
              Draws the compared concepts and the concepts listed above, as far as they are loaded. A concept with lines to more than one
              compared concept is a shared one.
            </p>
            {graph && (
              <div className="lp-sunken relative mt-2 h-[58vh] min-h-[22rem] overflow-hidden rounded-md lg:h-[36rem]">
                <GraphCanvas
                  visible={graph}
                  rootId={data.pcids[0] ?? null}
                  selection={selection}
                  command={command}
                  onSelectNode={pcid => setSelection({ type: 'node', id: pcid })}
                  onSelectEdge={id => setSelection({ type: 'edge', id })}
                  onClear={() => setSelection(null)}
                  onStatus={setCanvas}
                  display={display}
                  label={`Graph comparing ${names.join(', ')}: ${graph.nodes.length} concepts and ${graph.edges.length} relationships. The same relationships are listed in the tables above.`}
                />
                {canvas === 'loading' && <p className="absolute inset-0 grid place-items-center text-[13px] text-ink">Preparing the graph…</p>}
                {canvas === 'failed' && (
                  <p className="absolute inset-0 grid place-items-center p-6 text-center text-[13px] text-ink">
                    The graph could not be drawn in this browser. The tables above list the same relationships.
                  </p>
                )}
              </div>
            )}
          </details>
        </>
      )}
    </main>
  )
}
