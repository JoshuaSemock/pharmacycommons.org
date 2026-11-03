/**
 * One classification tree, drawn left to right: the root of the system at the left, the compared
 * concepts at the leaves. Classes shared by more than one concept are filled, a class holding only
 * one is hollow, and the lowest class the concepts have in common (the "meeting point") is ringed and
 * bold. Marks are shape and weight, not color, so the drawing reads in print and for color-blind readers.
 *
 * Plain SVG: the layout is exact and deterministic (hierarchy.ts), the labels are real links, and no
 * graph library is loaded. Every name is rendered as text.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Link } from 'react-router-dom'
import { layoutTree } from './hierarchy'
import type { SystemTree } from './hierarchy'
import { pagePath } from './predicates'

const DOT = 5
const LINE = 15

type Props = { tree: SystemTree; label: string }

export default function HierarchyView({ tree, label }: Props) {
  const layout = layoutTree(tree.roots, { dot: DOT })
  return (
    <div>
      <p className="mb-1 text-[12.5px] text-ink sm:hidden">Drag sideways to see the whole tree.</p>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${label}, scrollable`}>
      <svg
        role="group"
        aria-label={label}
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="block max-w-none text-ink"
      >
        <g fill="none" stroke="currentColor" strokeWidth={1} opacity={0.55}>
          {layout.edges.map(e => {
            const x1 = e.from.right + 4
            const x2 = e.to.x - DOT - 3
            const mid = (x1 + x2) / 2
            return <path key={`${e.from.node.pcid}-${e.to.node.pcid}-${e.to.y}`} d={`M${x1} ${e.from.y}H${mid}V${e.to.y}H${x2}`} />
          })}
        </g>
        {layout.placed.map((p, i) => {
          const n = p.node
          const shared = n.members.length > 1
          const to = pagePath(n.entityType, n.slug)
          const title =
            n.kind === 'concept'
              ? `${n.name} (compared concept)`
              : n.meeting
                ? `${n.name}: the lowest class they have in common`
                : shared
                  ? `${n.name}: holds ${n.members.length} of the compared concepts`
                  : `${n.name}: holds one of the compared concepts`
          const first = -((p.lines.length - 1) * LINE) / 2
          const text = (
            <text x={p.x + DOT + 6} y={p.y} fontSize={13} fill="currentColor" fontWeight={n.meeting || n.isConcept ? 600 : 400}>
              {p.lines.map((line, k) => (
                <tspan key={k} x={p.x + DOT + 6} dy={k === 0 ? first + 4.5 : LINE}>
                  {k < p.lines.length - 1 ? `${line} ` : line}
                </tspan>
              ))}
            </text>
          )
          return (
            <g key={`${n.kind}-${n.pcid}-${i}`}>
              {n.kind === 'concept' ? (
                <rect x={p.x - DOT} y={p.y - DOT} width={DOT * 2} height={DOT * 2} fill="currentColor">
                  <title>{title}</title>
                </rect>
              ) : (
                <>
                  {n.meeting && <circle cx={p.x} cy={p.y} r={DOT + 3} fill="none" stroke="currentColor" strokeWidth={1.25} />}
                  <circle cx={p.x} cy={p.y} r={DOT} fill={shared ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.25}>
                    <title>{title}</title>
                  </circle>
                </>
              )}
              {to ? (
                <Link to={to} className="underline decoration-foil decoration-2 underline-offset-2">
                  {text}
                </Link>
              ) : (
                text
              )}
            </g>
          )
        })}
      </svg>
      </div>
    </div>
  )
}
