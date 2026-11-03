// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseCompare } from '../network/compare'

const fetchCompare = vi.fn()
const fetchConcepts = vi.fn()
const resolveSlug = vi.fn()
const searchConcepts = vi.fn()

vi.mock('../network/api', async () => {
  const actual = await vi.importActual<typeof import('../network/api')>('../network/api')
  return {
    ...actual,
    fetchCompare: (...a: unknown[]) => fetchCompare(...a),
    fetchConcepts: (...a: unknown[]) => fetchConcepts(...a),
    resolveSlug: (...a: unknown[]) => resolveSlug(...a),
    searchConcepts: (...a: unknown[]) => searchConcepts(...a),
  }
})
vi.mock('../network/GraphCanvas', async () => {
  const React = await import('react')
  return {
    default: function FakeCanvas(props: { visible: { nodes: { name: string }[] }; onStatus: (s: string) => void }) {
      React.useEffect(() => props.onStatus('ready'), [])
      return <div data-testid="canvas" data-nodes={props.visible.nodes.map(n => n.name).sort().join('|')} />
    },
  }
})

const { default: NetworkCompare } = await import('./NetworkCompare')

const n = (pcid: number, name: string, entity_type = 'class') => ({ pcid, slug: name.toLowerCase().replace(/\s+/g, '-'), name, entity_type, class_type: null })
const metformin = n(1001923, 'metformin', 'moiety')
const empa = n(1001318, 'empagliflozin', 'moiety')
const e = (id: string, subject: number, object: number, predicate: string, group: string) => ({ id, subject, predicate, object, group, direct: true, community: false, source_agency: 'FDA' })

const payload = (rowsExtra: unknown[] = [], shared = 1, only = 1) =>
  parseCompare({
    pcids: [1001318, 1001923],
    entities: [empa, metformin],
    between: [],
    sets: [
      { members: [1001318, 1001923], count: shared, groups: { lists: shared } },
      { members: [1001318], count: only, groups: { classification: only } },
    ],
    rows: [
      {
        members: [1001318, 1001923],
        group: 'lists',
        node: n(10000001, 'Notable Drugs', 'list'),
        links: [
          { src: 1001318, outgoing: true, edge: e('li:10000001:1001318', 1001318, 10000001, 'on_list', 'lists') },
          { src: 1001923, outgoing: true, edge: e('li:10000001:1001923', 1001923, 10000001, 'on_list', 'lists') },
        ],
      },
      {
        members: [1001318],
        group: 'classification',
        node: n(5000200, 'SGLT2 inhibitors'),
        links: [{ src: 1001318, outgoing: true, edge: e('cm:5000200:1001318', 1001318, 5000200, 'member_of', 'classification') }],
      },
      ...rowsExtra,
    ],
  })!

function Where() {
  const loc = useLocation()
  return <output data-testid="where">{loc.pathname + loc.search}</output>
}
const show = (url = '/network/compare?c=1001923,1001318') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/network/compare" element={<><NetworkCompare /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  fetchCompare.mockReset()
  fetchConcepts.mockReset()
  resolveSlug.mockReset()
  searchConcepts.mockReset()
  fetchConcepts.mockResolvedValue([metformin, empa])
})
afterEach(cleanup)

describe('NetworkCompare', () => {
  it('asks for a second concept and compares nothing with fewer than two', async () => {
    fetchConcepts.mockResolvedValue([metformin])
    show('/network/compare?c=1001923')
    await screen.findByText('Add a second concept to compare')
    expect(fetchCompare).not.toHaveBeenCalled()
  })

  it('shows shared and only-one sections with each concept’s own relationship', async () => {
    fetchCompare.mockResolvedValue(payload())
    show()
    await screen.findByRole('heading', { name: /In common: empagliflozin and metformin/ })
    expect(screen.getByRole('heading', { name: /Only empagliflozin/ })).toBeTruthy()
    const shared = screen.getByRole('table', { name: /In common/ })
    expect(within(shared).getByText(/empagliflozin is on the list Notable Drugs|empagliflozin .*Notable Drugs/)).toBeTruthy()
    expect(within(shared).getByText(/metformin .*Notable Drugs/)).toBeTruthy()
    expect(screen.getByText(/No relationship is recorded directly between/)).toBeTruthy()
    expect(fetchCompare).toHaveBeenCalledWith([1001923, 1001318], expect.objectContaining({ includeCommunity: false }))
  })

  it('pages one set with its members and appends without repeats', async () => {
    const more = ['Class A', 'Class B'].map((name, i) => ({
      members: [1001318],
      group: 'classification',
      node: n(5000300 + i, name),
      links: [{ src: 1001318, outgoing: true, edge: e(`cm:${5000300 + i}:1001318`, 1001318, 5000300 + i, 'member_of', 'classification') }],
    }))
    fetchCompare.mockResolvedValueOnce(payload([], 1, 3)).mockResolvedValueOnce(payload(more, 1, 3))
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Show 2 more' }))
    await screen.findByText('Class B')
    expect(fetchCompare).toHaveBeenLastCalledWith([1001923, 1001318], expect.objectContaining({ members: [1001318], offset: 1 }))
    expect(screen.getAllByText('SGLT2 inhibitors')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /more/ })).toBeNull()
  })

  it('removes a concept from the URL', async () => {
    fetchCompare.mockResolvedValue(payload())
    show()
    await screen.findByRole('heading', { name: /Only empagliflozin/ })
    fireEvent.click(screen.getByRole('button', { name: 'Remove empagliflozin from the comparison' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/network/compare?c=1001923'))
  })

  it('compares a brand as the drug it contains and says so', async () => {
    fetchConcepts.mockResolvedValue([metformin])
    fetchCompare.mockResolvedValue(payload())
    searchConcepts.mockResolvedValue([{ key: 'p1001318', name: 'empagliflozin', hint: 'Brand: Jardiance', pcid: 1001318, slug: 'empagliflozin' }])
    show('/network/compare?c=1001923')
    const box = await screen.findByRole('combobox')
    fireEvent.change(box, { target: { value: 'jardiance' } })
    fireEvent.click(await screen.findByRole('option', { name: /empagliflozin/ }))
    await screen.findByText(/Jardiance is compared as empagliflozin/)
    expect(screen.getByTestId('where').textContent).toBe('/network/compare?c=1001923,1001318')
  })

  it('reports an unavailable service and offers a retry on failure', async () => {
    const { NetworkUnavailable } = await import('../network/api')
    fetchCompare.mockRejectedValueOnce(new NetworkUnavailable('x', true))
    show()
    await screen.findByText('The comparison service is not switched on yet.')
    cleanup()
    fetchCompare.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(payload())
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: /Only empagliflozin/ })
  })

  it('draws the graph only when asked', async () => {
    fetchCompare.mockResolvedValue(payload())
    show()
    await screen.findByRole('heading', { name: /Only empagliflozin/ })
    expect(screen.queryByTestId('canvas')).toBeNull()
    const details = screen.getByText('Show as a graph').closest('details')!
    details.open = true
    fireEvent(details, new Event('toggle'))
    const canvas = await screen.findByTestId('canvas')
    expect(canvas.getAttribute('data-nodes')).toBe('Notable Drugs|SGLT2 inhibitors|empagliflozin|metformin')
  })
})
