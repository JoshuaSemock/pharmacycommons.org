// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LasaPair, Loadable } from '../drugPageData'

let state: Loadable<LasaPair[]> = { data: null, failed: false }
vi.mock('../drugPageData', () => ({ useLasa: () => state }))

const { default: LasaFact, groupLasa } = await import('./LasaFact')

// Live get_lasa(clonazepam) output, 2026-11-01.
const CLONAZEPAM: LasaPair[] = [
  { name: 'clonazePAM', name_pcid: 1003084, has_tall_man: true, confused_with: 'ALPRAZolam', confused_with_pcid: 1003083 },
  { name: 'clonazePAM', name_pcid: 1003084, has_tall_man: true, confused_with: 'cloBAZam', confused_with_pcid: 1000079 },
  { name: 'clonazePAM', name_pcid: 1003084, has_tall_man: true, confused_with: 'cloNIDine', confused_with_pcid: 1001044 },
  { name: 'KlonoPIN', name_pcid: 4002978, has_tall_man: true, confused_with: 'cloNIDine', confused_with_pcid: 1001044 },
  { name: 'clonazePAM', name_pcid: 1003084, has_tall_man: true, confused_with: 'cloZAPine', confused_with_pcid: 1001048 },
  { name: 'clonazePAM', name_pcid: 1003084, has_tall_man: true, confused_with: 'LORazepam', confused_with_pcid: 1003087 },
]

const show = () =>
  render(
    <MemoryRouter>
      <LasaFact pcidCode="PCID-1003084" />
    </MemoryRouter>,
  )

afterEach(cleanup)

describe('groupLasa', () => {
  it('groups by name, Tall Man names first, alphabetical', () => {
    const groups = groupLasa([
      { name: 'Percocet', name_pcid: 1, has_tall_man: false, confused_with: 'Procet', confused_with_pcid: null },
      ...CLONAZEPAM,
    ])
    expect(groups.map(g => g.name)).toEqual(['clonazePAM', 'KlonoPIN', 'Percocet'])
    expect(groups[0].others).toHaveLength(5)
  })
})

describe('LasaFact', () => {
  it('shows each name with linked confused-with names', () => {
    state = { data: CLONAZEPAM, failed: false }
    show()
    expect(screen.getByText('clonazePAM')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'ALPRAZolam' }).getAttribute('href')).toBe('/id/PCID-1003083')
    expect(screen.getAllByText('Tall Man')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Look-alike/sound-alike list' }).getAttribute('href')).toBe('/lists/look-alike-sound-alike')
  })

  it('leaves unresolved names as plain text', () => {
    state = { data: [{ name: 'Percocet', name_pcid: 1, has_tall_man: false, confused_with: 'Procet', confused_with_pcid: null }], failed: false }
    show()
    expect(screen.getByText('Procet', { exact: false })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Procet' })).toBeNull()
  })

  it('caps the names shown and points to the list for the rest', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      name: 'Zantac', name_pcid: 1, has_tall_man: false, confused_with: `Name${i}`, confused_with_pcid: null,
    }))
    state = { data: many, failed: false }
    show()
    expect(screen.getByRole('link', { name: '3 more on the list' })).toBeTruthy()
  })

  it('says when the drug is not listed', () => {
    state = { data: [], failed: false }
    show()
    expect(screen.getByText('Not listed')).toBeTruthy()
  })
})
