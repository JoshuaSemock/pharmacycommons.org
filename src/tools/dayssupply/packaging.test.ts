import { describe, expect, it, vi } from 'vitest'

// packaging.ts imports the lazy Supabase client; the pure functions don't touch it.
vi.mock('@/db', () => ({ getSupabase: () => Promise.reject(new Error('no client in tests')) }))

import { groupProducts, loadAllPackaging, loadPackaging, packFromRows, type PackagingRow } from './packaging'

const row = (o: Partial<PackagingRow>): PackagingRow => ({
  id: 1,
  entity_pcid: 4000001,
  product_name: 'Example Drops',
  ndc: null,
  basis: 'drops',
  container: null,
  package_size: null,
  volume_ml: null,
  drops_per_ml: null,
  actuations: null,
  prime_actuations: null,
  units_per_container: null,
  prime_units: null,
  doses_per_container: null,
  containers_per_box: null,
  in_use_days: null,
  value_source: 'manufacturer',
  payer_name: null,
  source_name: 'Prescribing information, section 16',
  source_url: 'https://example.org/label',
  source_checked: '2026-10-13',
  note: null,
  ...o,
})

describe('groupProducts', () => {
  it('puts the rows for one product together and keeps other products apart', () => {
    const g = groupProducts([
      row({ id: 1, volume_ml: 5 }),
      row({ id: 2, drops_per_ml: 20 }),
      row({ id: 3, product_name: 'Other Drops', volume_ml: 10 }),
    ])
    expect(g.map(x => [x.label, x.rows.length])).toEqual([
      ['Example Drops', 2],
      ['Other Drops', 1],
    ])
  })
})

describe('groupProducts order', () => {
  it('lists products A to Z for the dropdown', () => {
    const g = groupProducts([row({ id: 1, product_name: 'Zeta' }), row({ id: 2, product_name: 'alpha' })])
    expect(g.map(x => x.label)).toEqual(['alpha', 'Zeta'])
  })
})

describe('packFromRows', () => {
  it('shows manufacturer and payer drops per mL side by side', () => {
    const { pack, provenance } = packFromRows([
      row({ id: 1, volume_ml: 5, drops_per_ml: 20 }),
      row({ id: 2, drops_per_ml: 16, value_source: 'payer', payer_name: 'Example Plan', source_name: 'Plan policy' }),
    ])
    expect(pack.mL).toBe('5')
    expect(pack.dropsPerMl).toBe('20')
    expect(pack.dropsPerMlPayer).toBe('16')
    expect(provenance.find(p => p.field === 'Drops per mL, payer')?.source).toBe('payer (Example Plan)')
  })

  it('prefers a manufacturer value over a general default', () => {
    const { pack } = packFromRows([
      row({ id: 1, drops_per_ml: 20, value_source: 'general_default', source_name: 'General default' }),
      row({ id: 2, drops_per_ml: 25 }),
    ])
    expect(pack.dropsPerMl).toBe('25')
  })

  it('falls back to a general default when there is no manufacturer figure', () => {
    const { pack, provenance } = packFromRows([row({ drops_per_ml: 20, value_source: 'general_default', source_name: 'General default' })])
    expect(pack.dropsPerMl).toBe('20')
    expect(provenance[0].source).toBe('general default')
  })

  it('maps insulin pen facts, including the container', () => {
    const { pack } = packFromRows([
      row({ basis: 'insulin', container: 'pen', units_per_container: 300, prime_units: 2, containers_per_box: 5, in_use_days: 28 }),
    ])
    expect(pack).toMatchObject({ container: 'pen', unitsPer: '300', primeUnits: '2', perBox: '5', inUseDays: '28' })
  })

  it('maps inhaler facts', () => {
    const { pack } = packFromRows([row({ basis: 'inhaler', actuations: 200, prime_actuations: 3 })])
    expect(pack).toMatchObject({ actuations: '200', prime: '3' })
  })

  it('leaves out anything the rows do not say', () => {
    const { pack } = packFromRows([row({ volume_ml: 2.5 })])
    expect(Object.keys(pack)).toEqual(['mL'])
  })
})

describe('loadPackaging', () => {
  it('resolves to no rows, not an error, when the table or client is unavailable', async () => {
    await expect(loadPackaging(1000208)).resolves.toEqual([])
  })
})

describe('loadAllPackaging', () => {
  it('resolves to no rows, not an error, when the table or client is unavailable', async () => {
    await expect(loadAllPackaging()).resolves.toEqual([])
  })
})
