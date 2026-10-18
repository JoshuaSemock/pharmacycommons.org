/**
 * The Network page's details panel and its text alternative to the canvas.
 *
 * Details: for a selected node, what it is, where its page is, and how to grow
 * or shrink its neighborhood; for a selected edge, the sentence it states, what
 * that kind of edge does and does not claim, and its provenance. Provenance that
 * is missing is said to be missing, never filled in.
 *
 * RelationTable: every drawn relationship of the selected concept as a table.
 * It is the same information as the canvas, so nothing is reachable only by
 * pointing at a picture.
 *
 * All database text is rendered as text. Nothing here sets HTML.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Link } from 'react-router-dom'
import Button from '../components/Button'
import Stamp from '../components/Stamp'
import { GROUPS, GROUP_ORDER, nodeKind, pagePath, predicateDefinition, predicatePhrase } from './predicates'
import { hasMore, relationsOf } from './model'
import type { Filters, GraphState, NetworkEdge, NetworkNode } from './model'
import type { EvidenceRecord } from './api'

export type EvidenceView = { state: 'idle' } | { state: 'loading' } | { state: 'ready'; record: EvidenceRecord | null }

type DetailsProps = {
  graph: GraphState
  selectedNode: NetworkNode | null
  selectedEdge: NetworkEdge | null
  evidence: EvidenceView
  busy: boolean
  onExpand: (pcid: number) => void
  onCollapse: (pcid: number) => void
  onSelectNode: (pcid: number) => void
  onRecenter: (pcid: number) => void
}

const LABEL_KEYS: [string, string][] = [
  ['evidence_level', 'Evidence level'],
  ['source_agency', 'Source'],
  ['source_doc_id', 'Document'],
  ['source_section', 'Section'],
  ['risk_profile', 'Risk profile'],
  ['qualifier_key', 'Qualifier'],
  ['qualifier_value', 'Qualifier value'],
  ['object_label', 'Written in the source as'],
  ['membership_source', 'Membership from'],
  ['match_basis', 'Matched by'],
  ['class_system', 'Classification system'],
  ['class_code', 'Class code'],
  ['effect', 'What the contributor wrote'],
  ['block', 'Page section'],
]

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3 py-1">
      <dt className="w-32 shrink-0 text-[12.5px] text-ink">{k}</dt>
      <dd className="min-w-0 break-words text-[13px] text-ink">{v}</dd>
    </div>
  )
}

function EdgeDetails({ edge, graph, evidence }: { edge: NetworkEdge; graph: GraphState; evidence: EvidenceView }) {
  const a = graph.nodes.get(edge.subject)
  const b = graph.nodes.get(edge.object)
  const group = GROUPS[edge.group]
  const record = evidence.state === 'ready' ? evidence.record : null
  const quote = text(record?.source_quote)
  const citations = Array.isArray(record?.citations) ? (record?.citations as unknown[]).filter((c): c is string => typeof c === 'string') : []

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Stamp>{group.label}</Stamp>
        {edge.community && <Stamp sunken>Contributor-added</Stamp>}
        {edge.direct === false && <Stamp>Inherited</Stamp>}
      </div>
      <p className="font-sans text-[15px] text-ink">
        <strong className="font-normal underline decoration-foil decoration-2 underline-offset-2">{a?.name ?? 'Unknown'}</strong>{' '}
        {predicatePhrase(edge.predicate, 'subject')}{' '}
        <strong className="font-normal underline decoration-foil decoration-2 underline-offset-2">{b?.name ?? 'Unknown'}</strong>
      </p>
      <p className="text-[13px] text-ink">{predicateDefinition(edge.predicate)}</p>
      <p className="text-[13px] text-ink">{group.meaning}</p>

      <div>
        <p className="mb-1 font-sans text-[13px] font-medium text-ink">Where this comes from</p>
        {evidence.state === 'loading' && <p className="text-[13px] text-ink">Loading the source record…</p>}
        <dl>
          {!record && edge.evidence_level && <Row k="Evidence level" v={edge.evidence_level} />}
          {!record && edge.source_agency && <Row k="Source" v={edge.source_agency} />}
          {!record && edge.source_doc_id && <Row k="Document" v={edge.source_doc_id} />}
          {!record && edge.basis && <Row k="How matched" v={edge.basis} />}
          {record &&
            LABEL_KEYS.map(([key, label]) => {
              const v = text(record[key])
              return v ? <Row key={key} k={label} v={v} /> : null
            })}
          {record && typeof record.direct === 'boolean' && <Row k="Membership" v={record.direct ? 'Direct' : 'Inherited from a parent class'} />}
          {citations.length > 0 && <Row k="Citations" v={citations.join(', ')} />}
        </dl>
        {quote && <blockquote className="lp-score mt-2 pl-3 text-[13px] italic text-ink">{quote}</blockquote>}
        {evidence.state === 'ready' && !record && !edge.evidence_level && !edge.source_agency && !edge.source_doc_id && (
          <p className="text-[13px] text-ink">No source details are recorded for this relationship.</p>
        )}
        {evidence.state === 'ready' && record && !quote && edge.group !== 'classification' && (
          <p className="text-[13px] text-ink">No quotation from the source is stored for this relationship.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {a && (
          <PageLink node={a} label={`Open ${a.name}`} />
        )}
        {b && (
          <PageLink node={b} label={`Open ${b.name}`} />
        )}
      </div>
    </div>
  )
}

function PageLink({ node, label }: { node: NetworkNode; label: string }) {
  const to = pagePath(node.entity_type, node.slug)
  if (!to) return null
  return (
    <Link to={to} className="lp-press rounded-md px-3 py-1 font-sans text-[12.5px] text-ink">
      {label}
    </Link>
  )
}

function NodeDetails({
  graph,
  node,
  busy,
  onExpand,
  onCollapse,
  onRecenter,
}: {
  graph: GraphState
  node: NetworkNode
  busy: boolean
  onExpand: (p: number) => void
  onCollapse: (p: number) => void
  onRecenter: (p: number) => void
}) {
  const kind = nodeKind(node.entity_type)
  const info = graph.expanded.get(node.pcid)
  const more = hasMore(graph, node.pcid)
  const path = pagePath(node.entity_type, node.slug)
  const counts = info?.groupCounts ?? {}

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-sans text-[18px] leading-snug text-ink">{node.name}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Stamp>{kind.label}</Stamp>
          {node.class_type && <Stamp>{node.class_type.toUpperCase()}</Stamp>}
          <span className="font-mono text-[12px] text-ink">PCID-{node.pcid}</span>
        </div>
      </div>

      {info ? (
        <p className="text-[13px] text-ink">
          Showing {Math.min(info.shown, info.total)} of {info.total} relationships.
          {GROUP_ORDER.some(g => counts[g]) && (
            <>
              {' '}
              {GROUP_ORDER.filter(g => counts[g])
                .map(g => `${GROUPS[g].label}: ${counts[g]}`)
                .join(' · ')}
            </>
          )}
        </p>
      ) : (
        <p className="text-[13px] text-ink">Its relationships have not been loaded yet.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {!info && (
          <Button size="sm" onClick={() => onExpand(node.pcid)} disabled={busy}>
            Show its relationships
          </Button>
        )}
        {info && more > 0 && (
          <Button size="sm" onClick={() => onExpand(node.pcid)} disabled={busy}>
            Show {Math.min(more, 40)} more
          </Button>
        )}
        {info && (
          <Button size="sm" onClick={() => onCollapse(node.pcid)} disabled={busy}>
            Collapse
          </Button>
        )}
        <Button size="sm" onClick={() => onRecenter(node.pcid)} disabled={busy}>
          Start a new graph here
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {path && (
          <Link to={path} className="lp-press rounded-md px-3 py-1 font-sans text-[12.5px] text-ink">
            Open its page
          </Link>
        )}
        <Link to={`/id/PCID-${node.pcid}`} className="lp-press rounded-md px-3 py-1 font-sans text-[12.5px] text-ink">
          Permanent link
        </Link>
      </div>
    </div>
  )
}

export function Details(props: DetailsProps) {
  const { graph, selectedNode, selectedEdge, evidence, busy, onExpand, onCollapse, onRecenter } = props
  if (selectedEdge) return <EdgeDetails edge={selectedEdge} graph={graph} evidence={evidence} />
  if (selectedNode) {
    return <NodeDetails graph={graph} node={selectedNode} busy={busy} onExpand={onExpand} onCollapse={onCollapse} onRecenter={onRecenter} />
  }
  return (
    <p className="text-[13px] text-ink">
      Select a concept or a line to see what it is and where it comes from. A line is a single recorded statement; being near
      another concept on the canvas means nothing.
    </p>
  )
}

export function RelationTable({
  graph,
  pcid,
  filters,
  onSelectNode,
  onSelectEdge,
}: {
  graph: GraphState
  pcid: number | null
  filters: Filters
  onSelectNode: (pcid: number) => void
  onSelectEdge: (id: string) => void
}) {
  const node = pcid !== null ? graph.nodes.get(pcid) : undefined
  if (!node) return null
  const rows = relationsOf(graph, node.pcid, filters)
  return (
    <section aria-labelledby="network-table-title" className="mt-6">
      <h2 id="network-table-title" className="font-sans text-[18px] text-ink">
        Relationships of {node.name}
      </h2>
      <p className="mb-2 text-[13px] text-ink">The same relationships as the graph, as a table. {rows.length} shown with the current filters.</p>
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink">No relationships are loaded for this concept with the current filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left font-sans text-[13px] text-ink">
            <caption className="sr-only">Relationships of {node.name}</caption>
            <thead>
              <tr className="lp-rule-b">
                <th scope="col" className="py-1 pr-3 font-normal">Relationship</th>
                <th scope="col" className="py-1 pr-3 font-normal">Concept</th>
                <th scope="col" className="py-1 pr-3 font-normal">Kind</th>
                <th scope="col" className="py-1 pr-3 font-normal">Type</th>
                <th scope="col" className="py-1 font-normal">Source</th>
              </tr>
            </thead>
            <tbody className="lp-divide-y">
              {rows.map(r => (
                <tr key={r.edge.id}>
                  <td className="py-1.5 pr-3 align-top">
                    <button type="button" className="lp-press rounded px-1 text-left" onClick={() => onSelectEdge(r.edge.id)}>
                      {node.name} {r.phrase}
                    </button>
                  </td>
                  <td className="py-1.5 pr-3 align-top">
                    <button type="button" className="lp-press rounded px-1 text-left" onClick={() => onSelectNode(r.other.pcid)}>
                      {r.other.name}
                    </button>
                  </td>
                  <td className="py-1.5 pr-3 align-top">{nodeKind(r.other.entity_type).label}</td>
                  <td className="py-1.5 pr-3 align-top">
                    {GROUPS[r.edge.group].label}
                    {r.edge.community ? ' (contributor-added)' : ''}
                    {r.edge.direct ? '' : ' (inherited)'}
                  </td>
                  <td className="py-1.5 align-top">{r.edge.source_agency ?? r.edge.evidence_level ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
