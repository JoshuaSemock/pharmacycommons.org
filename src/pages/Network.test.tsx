// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NetworkPayload } from '../network/model'

const fetchNeighborhood = vi.fn()
const fetchEvidence = vi.fn()
const resolveSlug = vi.fn()
const searchConcepts = vi.fn()

vi.mock('../network/api', async () => {
  const actual = await vi.importActual<typeof import('../network/api')>('../network/api')
  return {
    ...actual,
    fetchNeighborhood: (...a: unknown[]) => fetchNeighborhood(...a),
    fetchEvidence: (...a: unknown[]) => fetchEvidence(...a),
    resolveSlug: (...a: unknown[]) => resolveSlug(...a),
    searchConcepts: (...a: unknown[]) => searchConcepts(...a),
  }
})

// The canvas is covered by GraphCanvas.test.tsx; here it just shows what it was handed.
vi.mock('../network/GraphCanvas', async () => {
  const React = await import('react')
  return {
    default: function FakeCanvas(props: {
      visible: { nodes: { pcid: number; name: string }[]; edges: { id: string }[] }
      onStatus: (s: string) => void
      onSelectNode: (p: number) => void
      onSelectEdge: (id: string) => void
      label: string
    }) {
      React.useEffect(() => props.onStatus('ready'), [])
      return (
        <div data-testid="canvas" aria-label={props.label} data-nodes={props.visible.nodes.map(n => n.name).join('|')} data-edges={props.visible.edges.map(e => e.id).join('|')}>
          <button onClick={() => props.onSelectEdge(props.visible.edges[0]?.id)}>tap-edge</button>
        </div>
      )
    },
  }
})

const { default: Network } = await import('./Network')
const { NetworkUnavailable } = await import('../network/api')

const n = (pcid: number, name: string, entity_type = 'moiety', class_type: string | null = null) => ({ pcid, slug: name.toLowerCase().replace(/\W+/g, '-'), name, entity_type, class_type })
const e = (id: string, subject: number, predicate: string, object: number, group: string, extra = {}) => ({
  id, subject, predicate, object, group, evidence_level: null, source_agency: null, source_doc_id: null, direct: true, community: false, basis: null, ...extra,
})

const metformin = n(1001923, 'metformin')
const biguanides = n(5000100, 'Biguanides', 'class', 'epc')
const lactic = n(6000010, 'Lactic acidosis', 'clinical')
const combo = n(2000010, 'sitagliptin; metformin', 'combination')

const rootPayload = (): NetworkPayload => ({
  center: metformin,
  nodes: [metformin, biguanides, lactic, combo],
  edges: [
    e('cm:5000100:1001923', 1001923, 'member_of', 5000100, 'classification', { source_agency: 'rxclass' }),
    e('cs:9', 2000010, 'has_component', 1001923, 'composition', { source_agency: 'FDA' }),
    e('cs:30', 1001923, 'has_warning', 6000010, 'safety', { evidence_level: 'curator_assertion' }),
  ],
  group_counts: { classification: 1, composition: 1, safety: 1 },
  total: 3, offset: 0, limit: 40,
}) as NetworkPayload

function Where() {
  const l = useLocation()
  return <output data-testid="where">{l.pathname + l.search}</output>
}
const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Where />
      <Routes>
        <Route path="/network" element={<Network />} />
        <Route path="*" element={<div>elsewhere</div>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  fetchNeighborhood.mockReset()
  fetchEvidence.mockReset().mockResolvedValue(null)
  resolveSlug.mockReset()
  searchConcepts.mockReset().mockResolvedValue([])
})
afterEach(cleanup)

describe('Network page', () => {
  it('renders the route with an empty, searchable state and loads nothing', async () => {
    renderAt('/network')
    expect(screen.getByRole('heading', { level: 1, name: 'Network' })).toBeTruthy()
    expect(screen.getByRole('combobox')).toBeTruthy()
    expect(screen.getByText('Nothing selected yet')).toBeTruthy()
    expect(fetchNeighborhood).not.toHaveBeenCalled()
    expect(document.title).toBe('Network · Pharmacy Commons')
  })

  it('loads the concept in ?c=, draws it, and selects it', async () => {
    fetchNeighborhood.mockResolvedValue(rootPayload())
    renderAt('/network?c=PCID-1001923')
    await screen.findByTestId('canvas')
    expect(fetchNeighborhood).toHaveBeenCalledWith(1001923, expect.objectContaining({ includeCommunity: true }))
    expect(screen.getByTestId('canvas').getAttribute('data-nodes')).toContain('metformin')
    expect(screen.getByRole('heading', { name: 'metformin' })).toBeTruthy() // details panel
    expect(screen.getByText('PCID-1001923')).toBeTruthy()
  })

  it('offers a table of the same relationships, read in the right direction', async () => {
    fetchNeighborhood.mockResolvedValue(rootPayload())
    renderAt('/network?c=1001923')
    const table = await screen.findByRole('table', { name: /Relationships of metformin/ })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    const text = rows.map(r => r.textContent)
    expect(text.some(t => t?.includes('metformin is a member of') && t.includes('Biguanides'))).toBe(true)
    expect(text.some(t => t?.includes('metformin is a component of') && t.includes('sitagliptin; metformin'))).toBe(true)
    expect(text.some(t => t?.includes('metformin has warning') && t.includes('Lactic acidosis'))).toBe(true)
  })

  it('links to the canonical page and the permanent PCID link, with safe hrefs', async () => {
    fetchNeighborhood.mockResolvedValue(rootPayload())
    renderAt('/network?c=1001923')
    await screen.findByTestId('canvas')
    expect(screen.getByRole('link', { name: 'Open its page' }).getAttribute('href')).toBe('/drugs/metformin')
    expect(screen.getByRole('link', { name: 'Permanent link' }).getAttribute('href')).toBe('/id/PCID-1001923')
  })

  it('shows loading, then recovers from an error with Try again', async () => {
    fetchNeighborhood.mockRejectedValueOnce(new NetworkUnavailable('The network could not be loaded.', false))
    renderAt('/network?c=1001923')
    expect(screen.getByText('Loading the network…')).toBeTruthy()
    const retry = await screen.findByRole('button', { name: 'Try again' })
    expect(screen.getByText('The network could not be loaded.')).toBeTruthy()
    fetchNeighborhood.mockResolvedValueOnce(rootPayload())
    fireEvent.click(retry)
    await screen.findByTestId('canvas')
    expect(fetchNeighborhood).toHaveBeenCalledTimes(2)
  })

  it('says plainly when the database functions are not installed', async () => {
    fetchNeighborhood.mockRejectedValue(new NetworkUnavailable('The network service is not available yet.', true))
    renderAt('/network?c=1001923')
    await screen.findByText('The network service is not switched on yet')
    expect(screen.queryByTestId('canvas')).toBeNull()
  })

  it('handles a PCID that does not exist, and a malformed one', async () => {
    fetchNeighborhood.mockResolvedValue({ ...rootPayload(), center: null, nodes: [], edges: [] })
    renderAt('/network?c=9999999')
    await screen.findByText(/no record with that PCID/i)
    cleanup()
    fetchNeighborhood.mockClear()
    renderAt('/network?c=drop-table')
    expect(screen.getByText('Nothing selected yet')).toBeTruthy()
    expect(fetchNeighborhood).not.toHaveBeenCalled()
  })

  it('filters by relationship type without losing the underlying graph', async () => {
    fetchNeighborhood.mockResolvedValue(rootPayload())
    renderAt('/network?c=1001923')
    const canvas = await screen.findByTestId('canvas')
    expect(canvas.getAttribute('data-nodes')).toContain('Lactic acidosis')

    const safety = screen.getByRole('checkbox', { name: /Safety/ })
    fireEvent.click(safety)
    await waitFor(() => expect(screen.getByTestId('canvas').getAttribute('data-nodes')).not.toContain('Lactic acidosis'))
    expect(screen.getByText(/Some relationships are hidden/)).toBeTruthy()

    fireEvent.click(safety)
    await waitFor(() => expect(screen.getByTestId('canvas').getAttribute('data-nodes')).toContain('Lactic acidosis'))
    expect(screen.queryByText(/Some relationships are hidden/)).toBeNull()
  })

  it('only offers filters for relationship types the data actually has', async () => {
    fetchNeighborhood.mockResolvedValue(rootPayload())
    renderAt('/network?c=1001923')
    await screen.findByTestId('canvas')
    expect(screen.getByRole('checkbox', { name: /Classification/ })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /Chemical lineage/ })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /Interactions and genes/ })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /Contributor-added/ })).toBeNull()
  })

  it('expands a neighbor without duplicating nodes or edges that overlap', async () => {
    fetchNeighborhood.mockResolvedValueOnce(rootPayload())
    renderAt('/network?c=1001923')
    await screen.findByTestId('canvas')

    // Select Biguanides from the table, then expand it.
    fireEvent.click(screen.getAllByRole('button', { name: 'Biguanides' })[0])
    fetchNeighborhood.mockResolvedValueOnce({
      center: biguanides,
      nodes: [biguanides, metformin, n(1002000, 'sitagliptin')],
      edges: [
        e('cm:5000100:1001923', 1001923, 'member_of', 5000100, 'classification'), // already drawn
        e('cm:5000100:1002000', 1002000, 'member_of', 5000100, 'classification'),
      ],
      group_counts: { classification: 2 }, total: 2, offset: 0, limit: 40,
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Show its relationships' }))
    await waitFor(() => expect(screen.getByTestId('canvas').getAttribute('data-nodes')).toContain('sitagliptin'))

    const nodes = screen.getByTestId('canvas').getAttribute('data-nodes')!.split('|')
    const edges = screen.getByTestId('canvas').getAttribute('data-edges')!.split('|')
    expect(new Set(nodes).size).toBe(nodes.length)
    expect(new Set(edges).size).toBe(edges.length)
    expect(edges.filter(id => id === 'cm:5000100:1001923')).toHaveLength(1)
    expect(edges).toHaveLength(4)
    expect(fetchNeighborhood).toHaveBeenLastCalledWith(5000100, expect.objectContaining({ offset: 0 }))
  })

  it('resumes where it stopped when a hub has more relationships', async () => {
    const hub = { ...rootPayload(), total: 130 }
    fetchNeighborhood.mockResolvedValueOnce(hub)
    renderAt('/network?c=1001923')
    const more = await screen.findByRole('button', { name: /Show 40 more/ })
    fetchNeighborhood.mockResolvedValueOnce({ ...rootPayload(), edges: [], nodes: [metformin], total: 130, offset: 3 })
    fireEvent.click(more)
    await waitFor(() => expect(fetchNeighborhood).toHaveBeenCalledTimes(2))
    expect(fetchNeighborhood).toHaveBeenLastCalledWith(1001923, expect.objectContaining({ offset: 3 }))
  })

  it('collapses a branch and keeps the starting concept', async () => {
    fetchNeighborhood.mockResolvedValueOnce(rootPayload())
    renderAt('/network?c=1001923')
    await screen.findByTestId('canvas')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))
    await waitFor(() => expect(screen.getByTestId('canvas').getAttribute('data-nodes')).toBe('metformin'))
  })

  it('shows what a selected line claims and where it comes from, and copes with missing evidence', async () => {
    fetchNeighborhood.mockResolvedValue(rootPayload())
    fetchEvidence.mockResolvedValue({ kind: 'clinical_statement', evidence_level: 'curator_assertion', source_doc_id: 'Sandbox dispatch RUN-1', source_quote: null })
    renderAt('/network?c=1001923')
    await screen.findByTestId('canvas')
    fireEvent.click(screen.getByRole('button', { name: 'tap-edge' }))
    await screen.findByText('Where this comes from')
    expect((await screen.findAllByText('curator_assertion')).length).toBeGreaterThan(0)
    expect(fetchEvidence).toHaveBeenCalledWith('cm:5000100:1001923', expect.anything())

    fetchEvidence.mockResolvedValue(null)
    fireEvent.click(screen.getByRole('button', { name: 'metformin is a member of' }))
    // Missing evidence never blocks rendering: the sentence and the definition are still there.
    expect(await screen.findAllByText(/Class membership under a named classification system/)).not.toHaveLength(0)
  })

  it('searches by keyboard, lists every match, and opens the picked concept', async () => {
    const user = userEvent.setup()
    searchConcepts.mockResolvedValue([
      { key: 'p1', name: 'metformin', hint: 'Drug', pcid: 1001923, slug: 'metformin' },
      { key: 'p2', name: 'metformin; sitagliptin', hint: 'Combination product', pcid: 2000010, slug: 'metformin-sitagliptin' },
      { key: 'cbiguanides', name: 'Biguanides', hint: 'EPC class · 4 members', pcid: null, slug: 'biguanides' },
    ])
    fetchNeighborhood.mockResolvedValue({ ...rootPayload(), center: combo, nodes: [combo, metformin], edges: [e('cs:9', 2000010, 'has_component', 1001923, 'composition')] })
    renderAt('/network')
    const box = screen.getByRole('combobox')
    await user.type(box, 'metf')
    const options = await screen.findAllByRole('option')
    // Ambiguity is shown, not silently resolved.
    expect(options).toHaveLength(3)
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(3)
    expect(box.getAttribute('aria-activedescendant')).toBeTruthy()

    await user.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/network?c=2000010'))
  })

  it('resolves a class pick (which has no PCID in search) from its slug', async () => {
    const user = userEvent.setup()
    searchConcepts.mockResolvedValue([{ key: 'cbiguanides', name: 'Biguanides', hint: 'EPC class', pcid: null, slug: 'biguanides' }])
    resolveSlug.mockResolvedValue(5000100)
    fetchNeighborhood.mockResolvedValue({ ...rootPayload(), center: biguanides, nodes: [biguanides, metformin], edges: [e('cm:5000100:1001923', 1001923, 'member_of', 5000100, 'classification')] })
    renderAt('/network')
    await user.type(screen.getByRole('combobox'), 'bigu')
    await user.click(await screen.findByRole('option', { name: /Biguanides/ }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/network?c=5000100'))
    expect(resolveSlug).toHaveBeenCalledWith('biguanides')
  })

  it('never renders database text as HTML', async () => {
    const hostile = n(1001923, '<img src=x onerror=alert(1)>')
    fetchNeighborhood.mockResolvedValue({ ...rootPayload(), center: hostile, nodes: [hostile, biguanides], edges: [] })
    renderAt('/network?c=1001923')
    await screen.findByTestId('canvas')
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getAllByText('<img src=x onerror=alert(1)>').length).toBeGreaterThan(0)
  })
})
