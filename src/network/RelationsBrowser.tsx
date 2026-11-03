/**
 * Hub browser: every relationship of one concept, a page at a time.
 *
 * The graph itself shows a concept's neighbors in a round-robin order and stops at a cap, which is
 * fine for a drug and not enough for a class with thousands of members. This panel reads
 * network_relations() (db/phase32a_network_hubs.sql): alphabetical, filterable by relationship
 * group and by name, with a pager. Rows can be put on the graph one at a time or a page at a time;
 * nothing is added unless asked, and the numbers shown are the database's own counts.
 *
 * All database text is rendered as text. Nothing here sets HTML.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../components/Button'
import { RELATIONS_PAGE, fetchRelations } from './api'
import { GROUPS, GROUP_ORDER, nodeKind, predicatePhrase } from './predicates'
import type { NetworkGroup } from './predicates'
import { isNonCore } from './model'
import type { GraphState, NetworkNode, RelationsPage, RelationsRow } from './model'

type Props = {
  graph: GraphState
  node: NetworkNode
  includeCommunity: boolean
  onAdd: (pcid: number, rows: RelationsRow[]) => void
  onClose: () => void
}

type View = { s: 'loading' } | { s: 'ready'; page: RelationsPage } | { s: 'error' }

export default function RelationsBrowser({ graph, node, includeCommunity, onAdd, onClose }: Props) {
  const [group, setGroup] = useState<NetworkGroup | null>(null)
  const [query, setQuery] = useState('')
  const [applied, setApplied] = useState('')
  const [offset, setOffset] = useState(0)
  const [view, setView] = useState<View>({ s: 'loading' })
  const [counts, setCounts] = useState<RelationsPage['group_counts']>({})
  const [attempt, setAttempt] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)

  // Typing waits a moment before it queries, and a new filter always starts at the first page.
  useEffect(() => {
    const q = query.trim()
    if (q === applied) return
    const t = setTimeout(() => {
      setApplied(q)
      setOffset(0)
    }, 300)
    return () => clearTimeout(t)
  }, [query, applied])

  useEffect(() => {
    heading.current?.focus()
  }, [node.pcid])

  useEffect(() => {
    const ac = new AbortController()
    setView({ s: 'loading' })
    fetchRelations(node.pcid, {
      groups: group ? [group] : undefined,
      query: applied,
      includeCommunity,
      offset,
      signal: ac.signal,
    })
      .then(page => {
        if (ac.signal.aborted) return
        setView({ s: 'ready', page })
        setCounts(page.group_counts)
      })
      .catch(() => !ac.signal.aborted && setView({ s: 'error' }))
    return () => ac.abort()
  }, [node.pcid, group, applied, offset, includeCommunity, attempt])

  const groups = useMemo(() => GROUP_ORDER.filter(g => counts[g]), [counts])
  const all = useMemo(() => GROUP_ORDER.reduce((n, g) => n + (counts[g] ?? 0), 0), [counts])
  const page = view.s === 'ready' ? view.page : null
  const total = page?.total ?? 0
  const last = Math.max(0, Math.ceil(total / RELATIONS_PAGE) - 1)
  const pageNo = Math.floor(offset / RELATIONS_PAGE)
  const fresh = page ? page.rows.filter(r => !graph.nodes.has(r.node.pcid) || !graph.edges.has(r.edge.id)) : []

  return (
    <section aria-labelledby="network-browse-title" className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="network-browse-title" ref={heading} tabIndex={-1} className="font-sans text-[18px] text-ink">
          Browse all relationships of {node.name}
        </h2>
        <Button size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <p className="mb-3 text-[13px] text-ink">
        {all.toLocaleString('en-US')} recorded in total, listed alphabetically by the other concept. Adding a row draws it on the
        graph; nothing is added otherwise.
      </p>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-[13px] text-ink">Find by name</span>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            maxLength={80}
            className="lp-sunken w-64 max-w-full rounded-md px-3 py-1.5 font-sans text-[14px] text-ink"
          />
        </label>
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mb-1 text-[13px] text-ink">Relationship</legend>
          <label className="cursor-pointer">
            <input type="radio" name="browse-group" className="peer sr-only" checked={group === null} onChange={() => { setGroup(null); setOffset(0) }} />
            <span className="block rounded-md px-3 py-1 font-sans text-[13px] text-ink lp-chip peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30">
              All ({all.toLocaleString('en-US')})
            </span>
          </label>
          {groups.map(g => (
            <label key={g} className="cursor-pointer">
              <input type="radio" name="browse-group" className="peer sr-only" checked={group === g} onChange={() => { setGroup(g); setOffset(0) }} />
              <span
                className="block rounded-md px-3 py-1 font-sans text-[13px] text-ink lp-chip peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30"
                title={GROUPS[g].meaning}
              >
                {GROUPS[g].label} ({(counts[g] ?? 0).toLocaleString('en-US')})
              </span>
            </label>
          ))}
        </fieldset>
      </div>

      <div aria-live="polite" className="min-h-[1.25rem] text-[13px] text-ink">
        {view.s === 'loading' && 'Loading…'}
        {view.s === 'error' && (
          <>
            These relationships could not be loaded.{' '}
            <button type="button" className="underline decoration-foil decoration-2 underline-offset-2" onClick={() => setAttempt(n => n + 1)}>
              Try again
            </button>
          </>
        )}
        {page && (total === 0
          ? 'Nothing matches those filters.'
          : `Showing ${(offset + 1).toLocaleString('en-US')}–${(offset + page.rows.length).toLocaleString('en-US')} of ${total.toLocaleString('en-US')}.`)}
      </div>

      {page && page.rows.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left font-sans text-[13px] text-ink">
              <caption className="sr-only">Relationships of {node.name}, page {pageNo + 1} of {last + 1}</caption>
              <thead>
                <tr className="lp-rule-b">
                  <th scope="col" className="py-1 pr-3 font-normal">Concept</th>
                  <th scope="col" className="py-1 pr-3 font-normal">Kind</th>
                  <th scope="col" className="py-1 pr-3 font-normal">Relationship</th>
                  <th scope="col" className="py-1 pr-3 font-normal">Source</th>
                  <th scope="col" className="py-1 font-normal"><span className="sr-only">Graph</span></th>
                </tr>
              </thead>
              <tbody className="lp-divide-y">
                {page.rows.map(r => {
                  const onGraph = graph.nodes.has(r.node.pcid) && graph.edges.has(r.edge.id)
                  return (
                    <tr key={r.edge.id}>
                      <td className="py-1.5 pr-3 align-top">
                        {r.node.name}
                        {isNonCore(r.node) && <span className="text-ink"> ({r.node.term_type})</span>}
                      </td>
                      <td className="py-1.5 pr-3 align-top">{nodeKind(r.node.entity_type).label}</td>
                      <td className="py-1.5 pr-3 align-top">
                        {node.name} {predicatePhrase(r.edge.predicate, r.outgoing ? 'subject' : 'object')}
                        {r.edge.community ? ' (contributor-added)' : ''}
                        {r.edge.direct ? '' : ' (inherited)'}
                      </td>
                      <td className="py-1.5 pr-3 align-top">{r.edge.source_agency ?? r.edge.evidence_level ?? '—'}</td>
                      <td className="py-1.5 align-top">
                        {onGraph ? (
                          <span className="text-ink">On the graph</span>
                        ) : (
                          <Button size="sm" onClick={() => onAdd(node.pcid, [r])} aria-label={`Add ${r.node.name} to the graph`}>
                            Add
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setOffset(Math.max(0, offset - RELATIONS_PAGE))} disabled={offset === 0 || view.s === 'loading'}>
              Previous
            </Button>
            <span className="text-[13px] text-ink">
              Page {pageNo + 1} of {last + 1}
            </span>
            <Button size="sm" onClick={() => setOffset(offset + RELATIONS_PAGE)} disabled={pageNo >= last || view.s === 'loading'}>
              Next
            </Button>
            {fresh.length > 0 && (
              <Button size="sm" onClick={() => onAdd(node.pcid, fresh)}>
                Add the {fresh.length} not yet on the graph
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
