import { describe, expect, it } from 'vitest'
import { formatEntityName, formatNameByPcid } from './names'

describe('formatEntityName', () => {
  it('capitalizes brand formulations', () => {
    expect(formatEntityName('GLUCOPHAGE', 'formulation')).toBe('Glucophage')
    expect(formatEntityName('GLUCOPHAGE XR', 'formulation')).toBe('Glucophage XR')
    expect(formatEntityName('Abilify', 'formulation')).toBe('Abilify')
  })
  it('keeps other drug records lower case', () => {
    expect(formatEntityName('METFORMIN HYDROCHLORIDE', 'moiety')).toBe('metformin hydrochloride')
    expect(formatEntityName('METFORMIN', undefined)).toBe('metformin')
  })
  it('reads the kind from a brand-block PCID', () => {
    expect(formatNameByPcid('GLUCOPHAGE', 4000123)).toBe('Glucophage')
    expect(formatNameByPcid('METFORMIN', 1001923)).toBe('metformin')
    expect(formatNameByPcid('METFORMIN', null)).toBe('metformin')
  })
})
