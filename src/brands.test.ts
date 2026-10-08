import { describe, expect, it } from 'vitest'
import type { BrandName } from './api.generated'
import { applyBrandEdits, brandActionText, brandKey } from './brands'
import type { BrandEdit } from './brands'

const src = (name: string): BrandName => ({ name, marketed: true, appl_nos: [], rxcui: null, sources: ['drugsfda'] })
let id = 0
const edit = (over: Partial<BrandEdit>): BrandEdit => ({
  id: ++id,
  pcid: 1001900,
  slug: 'metformin',
  name: 'Metformin',
  entity_type: 'moiety',
  brand_key: 'X',
  brand_display: 'X',
  action: 'add',
  citation: 'FDA',
  summary: 's',
  is_current: true,
  created_at: '2026-10-07T00:00:00Z',
  patrol_status: 'unpatrolled',
  review_note: null,
  handle: 'alice_md',
  credential: null,
  ...over,
})

describe('brandKey', () => {
  it('matches pc_brand_key()', () => {
    expect(brandKey('  Glucophage   xr ')).toBe('GLUCOPHAGE XR')
  })
})

describe('applyBrandEdits', () => {
  const source = [src('GLUCOPHAGE'), src('FORTAMET'), src('Riomet')]

  it('adds community brands, moves hidden ones to removed, ignores cleared and stale edits', () => {
    const v = applyBrandEdits(source, [
      edit({ brand_key: 'GLUMETZA', brand_display: 'Glumetza' }),
      edit({ brand_key: 'FORTAMET', brand_display: 'Fortamet', action: 'hide', summary: 'wrong page' }),
      edit({ brand_key: 'RIOMET', brand_display: 'Riomet', action: 'clear' }),
      edit({ brand_key: 'DIABEX', brand_display: 'Diabex', is_current: false }),
    ])
    expect(v.shown.map(b => b.name)).toEqual(['GLUCOPHAGE', 'Glumetza', 'Riomet'])
    expect(v.shown.find(b => b.name === 'Glumetza')?.added?.handle).toBe('alice_md')
    expect(v.removed.map(r => [r.brand.name, r.edit.summary])).toEqual([['FORTAMET', 'wrong page']])
  })

  it('lists pending changes without applying them', () => {
    const v = applyBrandEdits(source, [edit({ brand_key: 'DIABEX', brand_display: 'Diabex', is_current: false, patrol_status: 'pending' })])
    expect(v.shown).toHaveLength(3)
    expect(v.pending).toHaveLength(1)
  })

  it('never duplicates a source brand that was also added', () => {
    const v = applyBrandEdits(source, [edit({ brand_key: 'RIOMET', brand_display: 'Riomet' })])
    expect(v.shown.filter(b => b.name.toUpperCase() === 'RIOMET')).toHaveLength(1)
  })
})

describe('brandActionText', () => {
  it('reads as a change', () => {
    expect(brandActionText('add', 'Glumetza')).toBe('added Glumetza')
    expect(brandActionText('hide', 'Fortamet')).toBe('removed Fortamet')
    expect(brandActionText('clear', 'Riomet')).toBe('undid a change to Riomet')
  })
})
