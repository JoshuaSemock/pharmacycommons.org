// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RelationsPage } from './model'
import { emptyGraph, mergePayload } from './model'

const fetchRelations = vi.fn()
vi.mock('./api', () => ({ RELATIONS_PAGE: 25, fetchRelations: (...a: unknown[]) => fetchRelations(...a) }))
const { default: RelationsBrowser } = await import('./RelationsBrowser')

const acetazolamide = { pcid: 1000577, slug: 'acetazolamide', name: 'Acetazolamide', entity_type: 'moiety', class_type: null }
const graph = mergePayload(
  emptyGraph(),
  { center: acetazolamide, nodes: [acetazolamide], edges: [], group_counts: { classification: 60 }, total: 60, offset: 0, limit: 40 },
  1000577,
  true,
)
const mk = (i: number) => ({
  edge: { id: `cm:${5000000 + i}:1000577`, subject: 1000577, predicate: 'member_of', object: 5000000 + i, group: 'classification' as const, evidence_level: null, source_agency: 'ATC', source_doc_id: null, direct: true, community: false, basis: null },
  node: { pcid: 5000000 + i, slug: `c${i}`, name: `Class ${i}`, entity_type: 'class', class_type: 'atc' },
  outgoing: true,
})
const page = (offset: number, n: number, total = 60): RelationsPage => ({
  rows: Array.from({ length: n }, (_, i) => mk(offset + i)),
  group_counts: { classification: 60 },
  total,
  offset,
  limit: 25,
})

beforeEach(() => {
  fetchRelations.mockReset()
})
afterEach(cleanup)

const show = (onAdd = vi.fn()) =>
  render(<RelationsBrowser graph={graph} node={acetazolamide} includeCommunity={false} onAdd={onAdd} onClose={() => {}} />)

describe('RelationsBrowser', () => {
  it('shows the database counts and pages with Next and Previous', async () => {
    fetchRelations.mockImplementation(async (_p: number, o: { offset?: number }) => page(o.offset ?? 0, 25))
    show()
    await screen.findByText('Showing 1–25 of 60.')
    expect(screen.getByText('Page 1 of 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Showing 26–50 of 60.')
    expect(fetchRelations).toHaveBeenLastCalledWith(1000577, expect.objectContaining({ offset: 25 }))
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('filters by relationship group from the first page', async () => {
    fetchRelations.mockImplementation(async (_p: number, o: { offset?: number }) => page(o.offset ?? 0, 3, 3))
    show()
    await screen.findByText('Showing 1–3 of 3.')
    fireEvent.click(screen.getByLabelText(/Classification \(60\)/))
    await waitFor(() => expect(fetchRelations).toHaveBeenLastCalledWith(1000577, expect.objectContaining({ groups: ['classification'], offset: 0 })))
  })

  it('adds one row, or every row not yet on the graph', async () => {
    fetchRelations.mockResolvedValue(page(0, 3, 3))
    const onAdd = vi.fn()
    show(onAdd)
    await screen.findByText('Showing 1–3 of 3.')
    fireEvent.click(screen.getByRole('button', { name: 'Add Class 1 to the graph' }))
    expect(onAdd).toHaveBeenCalledWith(1000577, [expect.objectContaining({ node: expect.objectContaining({ name: 'Class 1' }) })])
    fireEvent.click(screen.getByRole('button', { name: 'Add the 3 not yet on the graph' }))
    expect(onAdd.mock.calls[1][1]).toHaveLength(3)
  })

  it('says so when nothing matches and offers a retry on failure', async () => {
    fetchRelations.mockResolvedValueOnce({ rows: [], group_counts: {}, total: 0, offset: 0, limit: 25 })
    show()
    await screen.findByText('Nothing matches those filters.')
    cleanup()
    fetchRelations.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(page(0, 1, 1))
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await screen.findByText('Showing 1–1 of 1.')
  })
})
