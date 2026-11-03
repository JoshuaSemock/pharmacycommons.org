// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Loadable, Structure } from '../drugPageData'

let state: Loadable<Structure[]> = { data: null, failed: false }
vi.mock('../drugPageData', () => ({ useStructure: () => state }))

const { default: StructureIdentifier, pubchemCompoundUrl } = await import('./StructureIdentifier')

const row = (label: string, source: string, children: React.ReactNode) => (
  <div>
    <span>{label}</span>
    <span>{source}</span>
    {children}
  </div>
)
const show = () => render(<StructureIdentifier pcidCode="PCID-1" row={row} />)

afterEach(cleanup)

describe('pubchemCompoundUrl', () => {
  it('links a positive integer CID only', () => {
    expect(pubchemCompoundUrl(4091)).toBe('https://pubchem.ncbi.nlm.nih.gov/compound/4091')
    expect(pubchemCompoundUrl(null)).toBeNull()
    expect(pubchemCompoundUrl(0)).toBeNull()
  })
})

describe('StructureIdentifier', () => {
  it('shows a PubChem SMILES with its source and compound link', () => {
    state = { data: [{ smiles: 'CN(C)C(=N)N=C(N)N', source: 'PubChem', pubchem_cid: 4091 }], failed: false }
    show()
    expect(screen.getByText('SMILES')).toBeTruthy()
    expect(screen.getByText('PubChem')).toBeTruthy()
    expect(screen.getByTestId('smiles').textContent).toBe('CN(C)C(=N)N=C(N)N')
    expect(screen.getByRole('link', { name: 'CID 4091' }).getAttribute('href')).toBe('https://pubchem.ncbi.nlm.nih.gov/compound/4091')
  })

  it('names FDA GSRS and has no PubChem link for a GSRS row', () => {
    state = { data: [{ smiles: 'CC(=O)O', source: 'FDA GSRS', pubchem_cid: null }], failed: false }
    show()
    expect(screen.getByText('FDA GSRS')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders nothing while loading, on failure, or when no structure is stored', () => {
    for (const s of [{ data: null, failed: false }, { data: null, failed: true }, { data: [], failed: false }] as Loadable<Structure[]>[]) {
      state = s
      const { container } = show()
      expect(container.textContent).toBe('')
      cleanup()
    }
  })
})
