// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Loadable, RemsProgram } from '../drugPageData'

let state: Loadable<RemsProgram[]> = { data: null, failed: false }
vi.mock('../drugPageData', () => ({ useRems: () => state }))

const { default: RemsFact, remsElements } = await import('./RemsFact')

const base: RemsProgram = {
  rems_id: 351, program: 'Clozapine REMS', status: 'Inactive', etasu: false, medication_guide: false,
  communication_plan: false, implementation_system: false, shared_system: false, website: null, brands: null, inactive_brands: null,
}
const ISOTRETINOIN: RemsProgram = {
  ...base, rems_id: 1, program: 'Isotretinoin iPLEDGE', status: 'Active', etasu: true, medication_guide: true,
  website: 'https://www.ipledgeprogram.com', brands: 'Absorica, Claravis', inactive_brands: 'Sotret',
}

const show = () =>
  render(
    <MemoryRouter>
      <RemsFact pcidCode="PCID-1" />
    </MemoryRouter>,
  )

afterEach(cleanup)

describe('remsElements', () => {
  it('lists the elements that apply', () => {
    expect(remsElements(ISOTRETINOIN)).toEqual(['ETASU', 'Medication Guide'])
    expect(remsElements(base)).toEqual([])
  })
})

describe('RemsFact', () => {
  it('shows program, status, elements and brands', () => {
    state = { data: [ISOTRETINOIN], failed: false }
    show()
    expect(screen.getByRole('link', { name: 'Isotretinoin iPLEDGE' }).getAttribute('href')).toBe('https://www.ipledgeprogram.com')
    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.getByText('ETASU · Medication Guide')).toBeTruthy()
    expect(screen.getByText('Brands: Absorica, Claravis')).toBeTruthy()
    expect(screen.getByText('Inactive: Sotret')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'REMS products list' }).getAttribute('href')).toBe('/lists/rems-products')
  })

  it('caps programs and points to the list for the rest', () => {
    state = { data: Array.from({ length: 6 }, (_, i) => ({ ...base, rems_id: i, program: `Program ${i} REMS` })), failed: false }
    show()
    expect(screen.getByRole('link', { name: '2 more on the list' })).toBeTruthy()
  })

  it('says when there is no REMS', () => {
    state = { data: [], failed: false }
    show()
    expect(screen.getByText('No REMS on record')).toBeTruthy()
  })
})
