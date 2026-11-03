// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkUnavailable } from '../network/api'
import { parseHierarchy } from '../network/hierarchy'

const fetchHierarchy = vi.fn()
const fetchConcepts = vi.fn()
const resolveSlug = vi.fn()
const searchConcepts = vi.fn()

vi.mock('../network/api', async () => {
  const actual = await vi.importActual<typeof import('../network/api')>('../network/api')
  return {
    ...actual,
    fetchHierarchy: (...a: unknown[]) => fetchHierarchy(...a),
    fetchConcepts: (...a: unknown[]) => fetchConcepts(...a),
    resolveSlug: (...a: unknown[]) => resolveSlug(...a),
    searchConcepts: (...a: unknown[]) => searchConcepts(...a),
  }
})

const { default: NetworkHierarchy } = await import('./NetworkHierarchy')

const MET = 1001923
const EMPA = 1001318
const metformin = { pcid: MET, slug: 'metformin', name: 'metformin', entity_type: 'moiety', class_type: null }
const empa = { pcid: EMPA, slug: 'empagliflozin', name: 'empagliflozin', entity_type: 'moiety', class_type: null }

const both = () =>
  parseHierarchy({
    pcids: [EMPA, MET],
    entities: [empa, metformin],
    anchors: [
      { concept: EMPA, class: 5001830 },
      { concept: MET, class: 5001822 },
    ],
    nodes: [
      { pcid: 5000568, slug: 'diabetes-drugs', name: 'Drugs used in diabetes', class_type: 'atc', parent: null, members: [EMPA, MET], meeting: false },
      { pcid: 5001574, slug: 'bgl', name: 'Blood glucose lowering drugs, excl. insulins', class_type: 'atc', parent: 5000568, members: [EMPA, MET], meeting: true },
      { pcid: 5001822, slug: 'biguanides', name: 'Biguanides', class_type: 'atc', parent: 5001574, members: [MET], meeting: false },
      { pcid: 5001830, slug: 'sglt2', name: 'SGLT2 inhibitors', class_type: 'atc', parent: 5001574, members: [EMPA], meeting: false },
      { pcid: 5009999, slug: 'only-empa', name: 'Only empagliflozin class', class_type: 'epc', parent: null, members: [EMPA], meeting: false },
    ],
  })!

const one = () =>
  parseHierarchy({
    pcids: [MET],
    entities: [metformin],
    anchors: [{ concept: MET, class: 5001822 }],
    nodes: [
      { pcid: 5001574, slug: 'bgl', name: 'Blood glucose lowering drugs, excl. insulins', class_type: 'atc', parent: null, members: [MET], meeting: false },
      { pcid: 5001822, slug: 'biguanides', name: 'Biguanides', class_type: 'atc', parent: 5001574, members: [MET], meeting: false },
    ],
  })!

function Where() {
  const loc = useLocation()
  return <output data-testid="where">{loc.pathname + loc.search}</output>
}
const show = (url = '/network/hierarchy?c=1001923,1001318') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/network/hierarchy" element={<><NetworkHierarchy /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  fetchHierarchy.mockReset()
  fetchConcepts.mockReset()
  resolveSlug.mockReset()
  searchConcepts.mockReset()
  fetchConcepts.mockResolvedValue([metformin, empa])
})
afterEach(cleanup)

describe('NetworkHierarchy', () => {
  it('asks for a concept and loads nothing without one', async () => {
    fetchConcepts.mockResolvedValue([])
    show('/network/hierarchy')
    await screen.findByText('Add a drug or class')
    expect(fetchHierarchy).not.toHaveBeenCalled()
  })

  it('leads with the lowest class two concepts share, then the path above it', async () => {
    fetchHierarchy.mockResolvedValue(both())
    show()
    const card = (await screen.findByRole('heading', { name: 'In common' })).closest('div') as HTMLElement
    expect(within(card).getByText('Blood glucose lowering drugs, excl. insulins', { selector: 'span.font-semibold' })).toBeTruthy()
    expect(within(card).getByText(/All of them in/)).toBeTruthy()
    // path, top-down, ending at the lowest class
    expect(card.textContent).toContain('Drugs used in diabetes › Blood glucose lowering drugs, excl. insulins')
  })

  it('draws each system as a tree with the drugs under their own classes, as links', async () => {
    fetchHierarchy.mockResolvedValue(both())
    show()
    const svg = await screen.findByRole('group', { name: /WHO ATC classification of empagliflozin, metformin/ })
    const labels = Array.from(svg.querySelectorAll('text')).map(t => t.textContent)
    expect(labels).toEqual(expect.arrayContaining(['Drugs used in diabetes', 'Biguanides', 'metformin', 'SGLT2 inhibitors', 'empagliflozin']))
    const link = svg.querySelector('a[href="/drugs/metformin"]')
    expect(link).toBeTruthy()
    expect(svg.querySelector('a[href="/classifications/biguanides"]')).toBeTruthy()
  })

  it('opens systems where they meet and leaves the others folded', async () => {
    fetchHierarchy.mockResolvedValue(both())
    show()
    await screen.findByRole('group', { name: /WHO ATC/ })
    const open = Array.from(document.querySelectorAll('details')).map(d => [d.textContent?.includes('FDA EPC'), d.open])
    expect(open).toEqual([
      [false, true],
      [true, false],
    ])
  })

  it('says so when nothing is shared', async () => {
    const d = both()
    d.nodes.forEach(n => (n.meeting = false))
    d.nodes = d.nodes.filter(n => n.members.length === 1)
    fetchHierarchy.mockResolvedValue(d)
    show()
    await screen.findByText('No classification system places more than one of these concepts in the same class.')
  })

  it('works for one concept without an In common card', async () => {
    fetchConcepts.mockResolvedValue([metformin])
    fetchHierarchy.mockResolvedValue(one())
    show('/network/hierarchy?c=1001923')
    await screen.findByRole('group', { name: /WHO ATC classification of metformin/ })
    expect(screen.queryByRole('heading', { name: 'In common' })).toBeNull()
    expect(screen.queryByText('Compare all their connections')).toBeNull()
  })

  it('removes a concept by rewriting the address', async () => {
    fetchHierarchy.mockResolvedValue(both())
    show()
    await screen.findByRole('heading', { name: 'In common' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove empagliflozin' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/network/hierarchy?c=1001923'))
  })

  it('adds a picked concept and explains a brand pick', async () => {
    fetchHierarchy.mockResolvedValue(one())
    fetchConcepts.mockResolvedValue([metformin])
    searchConcepts.mockResolvedValue([{ key: 'k', name: 'empagliflozin', hint: 'Brand: Jardiance', pcid: EMPA, slug: 'empagliflozin' }])
    show('/network/hierarchy?c=1001923')
    await screen.findByRole('group', { name: /WHO ATC/ })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'jard' } })
    fireEvent.click(await screen.findByText('empagliflozin', { selector: '[role="option"] *' }).catch(() => screen.findByRole('option')))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/network/hierarchy?c=1001923,1001318'))
    expect(screen.getByText('Jardiance is shown as empagliflozin, the drug it contains.')).toBeTruthy()
  })

  it('offers a retry on an error and a notice when the service is missing', async () => {
    fetchHierarchy.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(both())
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: 'In common' })
    cleanup()
    fetchHierarchy.mockRejectedValue(new NetworkUnavailable('missing', true))
    show()
    await screen.findByText('The hierarchy service is not switched on yet.')
  })
})
