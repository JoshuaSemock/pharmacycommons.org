import { beforeEach, describe, expect, it, vi } from 'vitest'

const SVG = "<svg><path stroke:#000000 /><text fill='#0000FF'>N</text><rect fill='#FF0000'/></svg>"
let atoms = 12
let molValid = true
const deleted = vi.fn()
const getMol = vi.fn((s: string) =>
  s === 'bad'
    ? null
    : {
        is_valid: () => molValid,
        get_num_atoms: () => atoms,
        get_svg_with_highlights: () => SVG,
        delete: deleted,
      },
)
vi.mock('@rdkit/rdkit', () => ({ default: async () => ({ get_mol: getMol }) }))
vi.mock('@rdkit/rdkit/RDKit_minimal.wasm?url', () => ({ default: '/rdkit.wasm' }))

async function fresh() {
  vi.resetModules()
  return await import('./structureDraw')
}

beforeEach(() => {
  atoms = 12
  molValid = true
  getMol.mockClear()
  deleted.mockClear()
})

describe('helpers', () => {
  it('counts dot-separated parts', async () => {
    const { fragmentCount } = await fresh()
    expect(fragmentCount('CCO')).toBe(1)
    expect(fragmentCount('CC(=O)[O-].[Na+]')).toBe(2)
    expect(fragmentCount('C.')).toBe(1)
  })

  it('paints every colour in one ink', async () => {
    const { inkSvg } = await fresh()
    const out = inkSvg(SVG, '#3a3a3a')
    expect(out).not.toMatch(/#(000000|0000FF|FF0000)/)
    expect(out.match(/#3a3a3a/g)).toHaveLength(3)
  })

  it('encodes an image source', async () => {
    const { svgDataUri } = await fresh()
    expect(svgDataUri('<svg a="1"/>')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%20a%3D%221%22%2F%3E')
  })
})

describe('drawStructure', () => {
  it('returns a light and a dark drawing and frees the molecule', async () => {
    const { drawStructure, INK } = await fresh()
    const d = await drawStructure('CCO')
    expect(d.ok).toBe(true)
    if (d.ok) {
      expect(decodeURIComponent(d.light)).toContain(INK.light)
      expect(decodeURIComponent(d.dark)).toContain(INK.dark)
    }
    expect(deleted).toHaveBeenCalledTimes(1)
  })

  it('draws a SMILES once however often it is asked', async () => {
    const { drawStructure } = await fresh()
    await Promise.all([drawStructure('CCO'), drawStructure(' CCO '), drawStructure('CCO')])
    expect(getMol).toHaveBeenCalledTimes(1)
  })

  it('refuses a structure over the atom limit', async () => {
    const { drawStructure, MAX_ATOMS } = await fresh()
    atoms = MAX_ATOMS + 1
    expect(await drawStructure('CCO')).toEqual({ ok: false, reason: 'too_large' })
    expect(deleted).toHaveBeenCalledTimes(1)
  })

  it('refuses a mixture with too many parts without loading RDKit', async () => {
    const { drawStructure, MAX_FRAGMENTS } = await fresh()
    const smiles = Array.from({ length: MAX_FRAGMENTS + 1 }, () => '[OH-]').join('.')
    expect(await drawStructure(smiles)).toEqual({ ok: false, reason: 'too_many_parts' })
    expect(getMol).not.toHaveBeenCalled()
  })

  it('reports a SMILES RDKit cannot read', async () => {
    const { drawStructure } = await fresh()
    expect(await drawStructure('bad')).toEqual({ ok: false, reason: 'unreadable' })
    molValid = false
    expect(await drawStructure('CCN')).toEqual({ ok: false, reason: 'unreadable' })
  })
})
