// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentStructure, Loadable } from '../drugPageData'
import type { Drawing } from '../structureDraw'

let state: Loadable<ComponentStructure[]> = { data: null, failed: false }
let drawing: Drawing = { ok: true, light: 'data:light', dark: 'data:dark' }
vi.mock('../drugPageData', () => ({ useStructures: () => state }))
vi.mock('../structureDraw', () => ({ drawStructure: async () => drawing }))

const { default: StructureDrawing } = await import('./StructureDrawing')

const part = (n: number, name: string, smiles: string | null): ComponentStructure => ({
  moiety_pcid: 1000000 + n,
  slug: `pc:moiety:${name}`,
  name,
  smiles,
  source: smiles ? 'PubChem' : null,
  pubchem_cid: null,
})
const show = () =>
  render(
    <MemoryRouter>
      <StructureDrawing pcidCode="PCID-1" />
    </MemoryRouter>,
  )

afterEach(() => {
  cleanup()
  drawing = { ok: true, light: 'data:light', dark: 'data:dark' }
})

describe('StructureDrawing', () => {
  it('draws one moiety without a caption', async () => {
    state = { data: [part(1, 'metformin', 'CN(C)C(=N)N=C(N)N')], failed: false }
    show()
    await waitFor(() => expect(screen.getByAltText('Structure of metformin')).toBeTruthy())
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('draws a combination as one named, linked drawing per component and lists the missing one', async () => {
    state = { data: [part(1, 'bacitracin', 'CC'), part(2, 'neomycin', null), part(3, 'polymyxin b', 'CCC')], failed: false }
    show()
    await waitFor(() => expect(screen.getByAltText('Structure of bacitracin')).toBeTruthy())
    expect(screen.getByAltText('Structure of polymyxin b')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'bacitracin' }).getAttribute('href')).toBe('/drugs/pc:moiety:bacitracin')
    expect(screen.getByTestId('structure-missing').textContent).toBe('No structure on file: neomycin')
  })

  it('says so, in the well, when a structure is too large to draw', async () => {
    drawing = { ok: false, reason: 'too_large' }
    state = { data: [part(1, 'tirzepatide', 'CC')], failed: false }
    show()
    await waitFor(() => expect(screen.getByText(/Too large to draw/)).toBeTruthy())
  })

  it('renders nothing while loading, on failure, with no rows, or when no component has a structure', () => {
    for (const s of [
      { data: null, failed: false },
      { data: null, failed: true },
      { data: [], failed: false },
      { data: [part(1, 'ethinyl estradiol', null), part(2, 'ferrous', null)], failed: false },
    ] as Loadable<ComponentStructure[]>[]) {
      state = s
      const { container } = show()
      expect(container.firstChild).toBeNull()
      cleanup()
    }
  })
})
