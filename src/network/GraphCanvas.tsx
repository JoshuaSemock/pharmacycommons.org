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
 * reader can ask for a fresh arrangement. Display options (arrows, text fade,
 * line width, size by connections, hover focus) and the optional live physics
 * mode (see physics.ts) follow Obsidian's graph view.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useEffect, useRef } from 'react'
import type { Core, ElementDefinition, StylesheetJson, NodeSingular } from 'cytoscape'
import { GROUPS, nodeKind, predicatePhrase } from './predicates'
import { ringPositions } from './layout'
import { MAX_BODIES, createSim } from './physics'
import type { Sim, SimLink, SimNode } from './physics'
import { degrees, minZoomedFont, nodeSize } from './display'
import type { Display } from './display'
import type { Visible } from './model'

export type Selection = { type: 'node'; id: number } | { type: 'edge'; id: string } | null

/** A one-shot request from the toolbar. `n` changes on every press so repeats fire. */
export type ViewCommand = { kind: 'fit' | 'center' | 'arrange' | 'tree' | 'unpin'; n: number } | null

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
  /** Called when physics wants to run but there are too many concepts (it stays still). */
  onPhysicsLimit?: (over: boolean) => void
  display: Display
  label: string
}

const readVar = (name: string, fallback: string): string => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function buildStyle(display: Display): StylesheetJson {
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
        width: 'data(size)' as unknown as number,
        height: 'data(size)' as unknown as number,
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
        'min-zoomed-font-size': minZoomedFont(display.textZoom),
      },
    },
    { selector: 'node.root', style: { 'border-width': 4, 'border-style': 'double', 'font-size': 13 } },
    // A pinned concept stays where it was put; a dashed border marks it (colorless, like the rest).
    { selector: 'node.pinned', style: { 'border-style': 'dashed' } },
    { selector: 'node.dim', style: { opacity: 0.3 } },
    { selector: 'node.hfade', style: { opacity: 0.18 } },
    { selector: 'node:selected', style: { 'border-width': 5, 'border-style': 'solid', 'overlay-color': ink, 'overlay-opacity': 0.08, 'overlay-padding': 6 } },
    {
      selector: 'edge',
      style: {
        width: display.linkWidth,
        'line-color': ink,
        'target-arrow-color': ink,
        'target-arrow-shape': display.arrows ? 'triangle' : 'none',
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
    { selector: 'edge.community', style: { 'target-arrow-shape': display.arrows ? 'triangle-backcurve' : 'none', 'line-style': 'dotted', width: display.linkWidth + 1 } },
    { selector: 'edge.dim', style: { opacity: 0.12 } },
    { selector: 'edge.hfade', style: { opacity: 0.06 } },
    { selector: 'edge.hover, edge:selected, edge.nbr, edge.hnbr', style: { label: 'data(label)', opacity: 1, width: display.linkWidth + 1 } },
    { selector: 'edge:selected', style: { 'overlay-color': ink, 'overlay-opacity': 0.1 } },
  ]
  return style
}

function toElements(v: Visible, rootId: number | null, display: Display): ElementDefinition[] {
  const out: ElementDefinition[] = []
  const deg = degrees(v)
  for (const n of v.nodes) {
    const kind = nodeKind(n.entity_type)
    out.push({
      data: {
        id: String(n.pcid),
        size: nodeSize(deg.get(n.pcid) ?? 0, n.pcid === rootId, display.sizeByDegree),
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

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** Writes the simulation's positions to the canvas, leaving a dragged or pinned concept where it is. */
function applyPositions(cy: Core, sim: Sim): void {
  cy.batch(() => {
    for (const p of sim.positions()) {
      const node = cy.getElementById(p.id)
      if (node.nonempty() && !node.grabbed() && !node.hasClass('pinned')) node.position({ x: p.x, y: p.y })
    }
  })
}

function readBodies(cy: Core): { nodes: SimNode[]; links: SimLink[] } {
  const nodes = cy.nodes().map(n => ({ id: n.id(), x: n.position().x, y: n.position().y, fixed: n.hasClass('pinned') || n.grabbed() }))
  const links = cy.edges().map(e => ({ source: String(e.data('source')), target: String(e.data('target')) }))
  return { nodes, links }
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
  onPhysicsLimit,
  display,
  label,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const simRef = useRef<Sim | null>(null)
  const rafRef = useRef<number | null>(null)
  const tickRef = useRef<() => void>(() => {})
  // The handlers change every render; the Cytoscape listeners read them from here.
  const handlers = useRef({ onSelectNode, onSelectEdge, onClear, onPhysicsLimit })
  handlers.current = { onSelectNode, onSelectEdge, onClear, onPhysicsLimit }
  const latest = useRef({ visible, rootId, selection, display })
  latest.current = { visible, rootId, selection, display }

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  tickRef.current = () => {
    rafRef.current = null
    const cy = cyRef.current
    const sim = simRef.current
    if (!cy || !sim || !latest.current.display.physics) return
    sim.step()
    applyPositions(cy, sim)
    if (!sim.settled()) rafRef.current = requestAnimationFrame(() => tickRef.current())
  }

  /** Starts or wakes the physics layout from the canvas's current positions. */
  const wake = useCallback(
    (alpha: number) => {
      const cy = cyRef.current
      const d = latest.current.display
      if (!cy || !d.physics) return
      const over = cy.nodes().length > MAX_BODIES
      handlers.current.onPhysicsLimit?.(over)
      if (over) {
        stopLoop()
        return
      }
      const sim = simRef.current ?? (simRef.current = createSim({ repel: d.repel, linkDistance: d.linkDistance }))
      sim.setOptions({ repel: d.repel, linkDistance: d.linkDistance })
      const { nodes, links } = readBodies(cy)
      sim.sync(nodes, links)
      sim.reheat(alpha)
      if (prefersReducedMotion()) {
        // No animation: settle in one go and draw the result.
        for (let i = 0; i < 250 && !sim.settled(); i++) sim.step()
        applyPositions(cy, sim)
        return
      }
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(() => tickRef.current())
    },
    [stopLoop],
  )

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
          style: buildStyle(latest.current.display),
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

        // Hover focus (Obsidian): everything but the hovered concept and its neighbors fades.
        cy.on('mouseover', 'node', evt => {
          if (!latest.current.display.hoverFocus) return
          const n = evt.target as NodeSingular
          cy.elements().not(n.closedNeighborhood()).addClass('hfade')
          n.connectedEdges().addClass('hnbr')
        })
        cy.on('mouseout', 'node', () => {
          cy.elements().removeClass('hfade hnbr')
        })

        // Dragging with physics on pins the concept under the pointer and the rest follow.
        cy.on('grab', 'node', evt => {
          simRef.current?.pin(evt.target.id())
          wake(0.35)
        })
        cy.on('drag', 'node', evt => {
          const p = evt.target.position()
          simRef.current?.pin(evt.target.id(), p.x, p.y)
        })
        cy.on('free', 'node', evt => {
          if (!evt.target.hasClass('pinned')) simRef.current?.release(evt.target.id())
          wake(0.35)
        })
        // Double-tap pins a concept where it is (dashed border); again releases it.
        cy.on('dbltap', 'node', evt => {
          const n = evt.target as NodeSingular
          n.toggleClass('pinned')
          if (n.hasClass('pinned')) simRef.current?.pin(n.id())
          else simRef.current?.release(n.id())
        })

        observer = new MutationObserver(() => cy.style(buildStyle(latest.current.display)))
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })

        sync(cy, latest.current.visible, latest.current.rootId, latest.current.display)
        if (cy.nodes().length > 0) cy.fit(undefined, 40)
        applySelection(cy, latest.current.selection)
        onStatus('ready')
        if (latest.current.display.physics) wake(0.8)
      })
      .catch(() => {
        if (!cancelled) onStatus('failed')
      })
    return () => {
      cancelled = true
      stopLoop()
      observer?.disconnect()
      cyRef.current?.destroy()
      cyRef.current = null
      simRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; later changes flow through the effects below
  }, [])

  // Elements: add and remove, never reposition what is already there. Sizes follow the display setting.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const changed = sync(cy, visible, rootId, latest.current.display)
    if (changed) wake(0.5)
  }, [visible, rootId, display.sizeByDegree, wake])

  useEffect(() => {
    const cy = cyRef.current
    if (cy) cy.style(buildStyle(latest.current.display))
  }, [display.arrows, display.linkWidth, display.textZoom])

  useEffect(() => {
    if (display.physics) wake(0.8)
    else {
      stopLoop()
      handlers.current.onPhysicsLimit?.(false)
    }
  }, [display.physics, wake, stopLoop])

  useEffect(() => {
    if (display.physics) wake(0.5)
  }, [display.repel, display.linkDistance, display.physics, wake])

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
      // With physics on, "Re-arrange" shakes the layout loose; without it, one force layout runs.
      if (latest.current.display.physics) wake(1)
      else cy.layout({ name: 'cose', animate: false, fit: true, padding: 40, nodeRepulsion: () => 12000, idealEdgeLength: () => 110, randomize: false }).run()
    } else if (command.kind === 'tree') {
      const root = cy.getElementById(String(latest.current.rootId))
      cy.layout({ name: 'breadthfirst', animate: false, fit: true, padding: 40, directed: false, spacingFactor: 1.15, roots: root.nonempty() ? [root.id()] : undefined }).run()
    } else if (command.kind === 'unpin') {
      cy.nodes().removeClass('pinned')
      wake(0.4)
    }
  }, [command, wake])

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

/**
 * Brings the canvas to `v`: removes what is gone, adds what is new beside its
 * neighbor, and refreshes node sizes. Returns true when elements were added or removed.
 */
function sync(cy: Core, v: Visible, rootId: number | null, display: Display): boolean {
  const want = toElements(v, rootId, display)
  const wantIds = new Set(want.map(e => String(e.data.id)))
  let changed = false

  cy.batch(() => {
    cy.elements().forEach(el => {
      if (!wantIds.has(el.id())) {
        cy.remove(el)
        changed = true
      }
    })

    const existing = new Set(cy.elements().map(el => el.id()))
    // Sizes follow the connection count, which changes as lines come and go.
    for (const e of want) if (!('source' in e.data) && existing.has(String(e.data.id))) cy.getElementById(String(e.data.id)).data('size', e.data.size)
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
    if (newNodes.length > 0 || newEdges.length > 0) changed = true
  })

  cy.nodes().removeClass('root')
  if (rootId !== null) cy.getElementById(String(rootId)).addClass('root')
  for (const e of want) {
    if (!('source' in e.data)) continue
    cy.getElementById(String(e.data.id)).toggleClass('community', e.classes === 'community')
  }
  return changed
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
