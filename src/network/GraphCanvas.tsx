/**
 * The Cytoscape.js canvas. It draws what the page hands it and reports taps; it
 * owns no data. Cytoscape is imported on demand, so none of it is in the first
 * load bundle, and the instance is destroyed when the page leaves.
 *
 * Look: colorless, like the rest of the site. Kinds differ by shape and border,
 * groups by line style and arrowheads, so nothing relies on hue. Ink and paper
 * come from the site's CSS variables and are re-read when the theme changes.
 *
 * Existing nodes never move when elements are added (see layout.ts); the
 * reader can ask for a fresh arrangement.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useRef } from 'react'
import type { Core, ElementDefinition, StylesheetJson, NodeSingular } from 'cytoscape'
import { GROUPS, nodeKind, predicatePhrase } from './predicates'
import { ringPositions } from './layout'
import type { Visible } from './model'

export type Selection = { type: 'node'; id: number } | { type: 'edge'; id: string } | null

/** A one-shot request from the toolbar. `n` changes on every press so repeats fire. */
export type ViewCommand = { kind: 'fit' | 'center' | 'arrange' | 'tree'; n: number } | null

export type CanvasStatus = 'loading' | 'ready' | 'failed'

type Props = {
  visible: Visible
  rootId: number | null
  selection: Selection
  command: ViewCommand
  onSelectNode: (pcid: number) => void
  onSelectEdge: (id: string) => void
  onClear: () => void
  onStatus: (s: CanvasStatus) => void
  label: string
}

const readVar = (name: string, fallback: string): string => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function buildStyle(): StylesheetJson {
  const ink = readVar('--color-ink', '#3a3a3a')
  const paper = readVar('--color-paper', '#faf9f5')
  const font = readVar('--font-sans', "'IBM Plex Sans Condensed', sans-serif")
  const style: StylesheetJson = [
    {
      selector: 'node',
      style: {
        'background-color': paper,
        'border-color': ink,
        'border-width': 'data(border)' as unknown as number,
        'border-style': 'solid',
        shape: 'data(shape)' as unknown as 'ellipse',
        width: 38,
        height: 38,
        label: 'data(label)',
        color: ink,
        'font-family': font,
        'font-size': 11,
        'text-wrap': 'wrap',
        'text-max-width': '96px',
        'text-valign': 'bottom',
        'text-margin-y': 5,
        'text-background-color': paper,
        'text-background-opacity': 0.85,
        'text-background-padding': '2px',
        'min-zoomed-font-size': 7,
      },
    },
    { selector: 'node.root', style: { width: 54, height: 54, 'border-width': 4, 'border-style': 'double', 'font-size': 13 } },
    { selector: 'node.dim', style: { opacity: 0.3 } },
    { selector: 'node:selected', style: { 'border-width': 5, 'border-style': 'solid', 'overlay-color': ink, 'overlay-opacity': 0.08, 'overlay-padding': 6 } },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'line-color': ink,
        'target-arrow-color': ink,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.9,
        'curve-style': 'bezier',
        opacity: 0.7,
        'font-family': font,
        'font-size': 10,
        color: ink,
        'text-background-color': paper,
        'text-background-opacity': 1,
        'text-background-padding': '2px',
        'text-rotation': 'autorotate',
        label: '',
      },
    },
    { selector: 'edge[line = "dashed"]', style: { 'line-style': 'dashed', 'line-dash-pattern': [8, 4] } },
    { selector: 'edge[line = "dotted"]', style: { 'line-style': 'dotted' } },
    // Contributor-added edges: hollow arrowhead and a double dot pattern, never mistaken for source data.
    { selector: 'edge.community', style: { 'target-arrow-shape': 'triangle-backcurve', 'line-style': 'dotted', width: 2.5 } },
    { selector: 'edge.dim', style: { opacity: 0.12 } },
    { selector: 'edge.hover, edge:selected, edge.nbr', style: { label: 'data(label)', opacity: 1, width: 2.5 } },
    { selector: 'edge:selected', style: { 'overlay-color': ink, 'overlay-opacity': 0.1 } },
  ]
  return style
}

function toElements(v: Visible): ElementDefinition[] {
  const out: ElementDefinition[] = []
  for (const n of v.nodes) {
    const kind = nodeKind(n.entity_type)
    out.push({
      data: {
        id: String(n.pcid),
        label: n.class_type ? `${n.name}\n(${n.class_type.toUpperCase()})` : n.name,
        shape: kind.shape,
        border: kind.border,
      },
    })
  }
  for (const e of v.edges) {
    out.push({
      data: {
        id: e.id,
        source: String(e.subject),
        target: String(e.object),
        label: `${e.community ? 'contributor: ' : ''}${predicatePhrase(e.predicate, 'subject')}`,
        line: GROUPS[e.group].line,
      },
      classes: e.community ? 'community' : '',
    })
  }
  return out
}

export default function GraphCanvas({
  visible,
  rootId,
  selection,
  command,
  onSelectNode,
  onSelectEdge,
  onClear,
  onStatus,
  label,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  // The handlers change every render; the Cytoscape listeners read them from here.
  const handlers = useRef({ onSelectNode, onSelectEdge, onClear })
  handlers.current = { onSelectNode, onSelectEdge, onClear }
  const latest = useRef({ visible, rootId, selection })
  latest.current = { visible, rootId, selection }

  // Create once, destroy on leave.
  useEffect(() => {
    let cancelled = false
    let observer: MutationObserver | null = null
    onStatus('loading')
    import('cytoscape')
      .then(mod => {
        if (cancelled || !hostRef.current) return
        const cytoscape = mod.default
        const cy = cytoscape({
          container: hostRef.current,
          elements: [],
          style: buildStyle(),
          minZoom: 0.15,
          maxZoom: 2.5,
          wheelSensitivity: 0.25,
          boxSelectionEnabled: false,
          autounselectify: false,
        })
        cyRef.current = cy

        cy.on('tap', 'node', evt => handlers.current.onSelectNode(Number((evt.target as NodeSingular).id())))
        cy.on('tap', 'edge', evt => handlers.current.onSelectEdge(evt.target.id()))
        cy.on('tap', evt => {
          if (evt.target === cy) handlers.current.onClear()
        })
        cy.on('mouseover', 'edge', evt => evt.target.addClass('hover'))
        cy.on('mouseout', 'edge', evt => evt.target.removeClass('hover'))

        observer = new MutationObserver(() => cy.style(buildStyle()))
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })

        sync(cy, latest.current.visible, latest.current.rootId)
        if (cy.nodes().length > 0) cy.fit(undefined, 40)
        applySelection(cy, latest.current.selection)
        onStatus('ready')
      })
      .catch(() => {
        if (!cancelled) onStatus('failed')
      })
    return () => {
      cancelled = true
      observer?.disconnect()
      cyRef.current?.destroy()
      cyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; later changes flow through the effects below
  }, [])

  // Elements: add and remove, never reposition what is already there.
  useEffect(() => {
    const cy = cyRef.current
    if (cy) sync(cy, visible, rootId)
  }, [visible, rootId])

  useEffect(() => {
    const cy = cyRef.current
    if (cy) applySelection(cy, selection)
  }, [selection, visible])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !command) return
    if (command.kind === 'fit') cy.fit(undefined, 40)
    else if (command.kind === 'center') {
      const sel = latest.current.selection
      const node = sel?.type === 'node' ? cy.getElementById(String(sel.id)) : cy.getElementById(String(latest.current.rootId))
      if (node.nonempty()) cy.center(node)
    } else if (command.kind === 'arrange') {
      cy.layout({ name: 'cose', animate: false, fit: true, padding: 40, nodeRepulsion: () => 12000, idealEdgeLength: () => 110, randomize: false }).run()
    } else if (command.kind === 'tree') {
      const root = cy.getElementById(String(latest.current.rootId))
      cy.layout({ name: 'breadthfirst', animate: false, fit: true, padding: 40, directed: false, spacingFactor: 1.15, roots: root.nonempty() ? [root.id()] : undefined }).run()
    }
  }, [command])

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={label}
      className="h-full w-full touch-none"
      data-testid="network-canvas"
    />
  )
}

/** Brings the canvas to `v`: removes what is gone, adds what is new beside its neighbor. */
function sync(cy: Core, v: Visible, rootId: number | null): void {
  const want = toElements(v)
  const wantIds = new Set(want.map(e => String(e.data.id)))

  cy.batch(() => {
    cy.elements().forEach(el => {
      if (!wantIds.has(el.id())) cy.remove(el)
    })

    const existing = new Set(cy.elements().map(el => el.id()))
    const newNodes = want.filter(e => !('source' in e.data) && !existing.has(String(e.data.id)))
    const newEdges = want.filter(e => 'source' in e.data && !existing.has(String(e.data.id)))

    if (newNodes.length > 0) {
      // Each new node goes beside whichever drawn node it connects to.
      const anchorOf = new Map<string, string>()
      const drawn = new Set(cy.nodes().map(n => n.id()))
      for (const e of newEdges) {
        const s = String(e.data.source)
        const t = String(e.data.target)
        if (drawn.has(s) && !drawn.has(t)) anchorOf.set(t, s)
        else if (drawn.has(t) && !drawn.has(s)) anchorOf.set(s, t)
      }
      const byAnchor = new Map<string, ElementDefinition[]>()
      const orphans: ElementDefinition[] = []
      for (const n of newNodes) {
        const a = anchorOf.get(String(n.data.id))
        if (a) byAnchor.set(a, [...(byAnchor.get(a) ?? []), n])
        else orphans.push(n)
      }
      const firstDraw = cy.nodes().length === 0
      for (const [anchorId, group] of byAnchor) {
        const a = cy.getElementById(anchorId).position()
        ringPositions(a, group.length).forEach((p, i) => cy.add({ ...group[i], position: p }))
      }
      // The first node (the root), or nodes that connect only to each other: start at the middle.
      if (orphans.length > 0) {
        const pts = firstDraw && orphans.length === 1 ? [{ x: 0, y: 0 }] : ringPositions({ x: 0, y: 0 }, orphans.length)
        orphans.forEach((n, i) => cy.add({ ...n, position: pts[i] }))
      }
    }
    for (const e of newEdges) cy.add(e)
  })

  cy.nodes().removeClass('root')
  if (rootId !== null) cy.getElementById(String(rootId)).addClass('root')
  for (const e of want) {
    if (!('source' in e.data)) continue
    cy.getElementById(String(e.data.id)).toggleClass('community', e.classes === 'community')
  }
}

function applySelection(cy: Core, s: Selection): void {
  cy.batch(() => {
    cy.elements().removeClass('dim nbr').unselect()
    if (!s) return
    const el = s.type === 'node' ? cy.getElementById(String(s.id)) : cy.getElementById(s.id)
    if (el.empty()) return
    el.select()
    const keep = s.type === 'node' ? el.closedNeighborhood() : el.connectedNodes().union(el)
    cy.elements().not(keep).addClass('dim')
    if (s.type === 'node') el.connectedEdges().addClass('nbr')
  })
}
