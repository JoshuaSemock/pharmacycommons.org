import { describe, expect, it } from 'vitest'
import {
  EMPTY_SIGNUP_DETAILS,
  ageOn,
  latestEligibleBirthDate,
  signupMetadata,
  validateSignupDetails,
} from './signup'
import type { SignupDetails } from './signup'

const TODAY = new Date(2026, 9, 18) // 18 Oct 2026

const valid: SignupDetails = {
  ...EMPTY_SIGNUP_DETAILS,
  accountType: 'practitioner',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1990-05-01',
  ageConfirmed: true,
  npi: '1234567893',
  profession: 'Pharmacist',
}

describe('ageOn', () => {
  it('counts whole years and respects the birthday', () => {
    expect(ageOn('2008-10-18', TODAY)).toBe(18)
    expect(ageOn('2008-10-19', TODAY)).toBe(17)
    expect(ageOn('2000-01-01', TODAY)).toBe(26)
  })
  it('rejects impossible dates', () => {
    expect(ageOn('2001-02-30', TODAY)).toBeNull()
    expect(ageOn('', TODAY)).toBeNull()
    expect(ageOn('01/02/2000', TODAY)).toBeNull()
  })
})

describe('latestEligibleBirthDate', () => {
  it('is exactly 18 years before today', () => {
    expect(latestEligibleBirthDate(TODAY)).toBe('2008-10-18')
  })
})

describe('validateSignupDetails', () => {
  it('accepts complete details', () => {
    expect(validateSignupDetails(valid, TODAY)).toBeNull()
  })
  it('requires an account type and names', () => {
    expect(validateSignupDetails({ ...valid, accountType: '' }, TODAY)).toMatch(/patient, practitioner/)
    expect(validateSignupDetails({ ...valid, lastName: ' ' }, TODAY)).toMatch(/name/)
  })
  it('blocks anyone under 18, even with the box ticked', () => {
    expect(validateSignupDetails({ ...valid, dateOfBirth: '2008-10-19' }, TODAY)).toMatch(/18 or older/)
  })
  it('requires the age confirmation', () => {
    expect(validateSignupDetails({ ...valid, ageConfirmed: false }, TODAY)).toMatch(/Confirm/)
  })
  it('checks the NPI format only for practitioners, and lets it be blank', () => {
    expect(validateSignupDetails({ ...valid, npi: '123' }, TODAY)).toMatch(/10 digits/)
    expect(validateSignupDetails({ ...valid, npi: '' }, TODAY)).toBeNull()
    expect(validateSignupDetails({ ...valid, accountType: 'patient', npi: '123' }, TODAY)).toBeNull()
  })
  it('checks phone format when given', () => {
    expect(validateSignupDetails({ ...valid, phone: 'abc' }, TODAY)).toMatch(/phone/)
    expect(validateSignupDetails({ ...valid, phone: '+1 (404) 555-0100' }, TODAY)).toBeNull()
  })
})

describe('signupMetadata', () => {
  it('sends practitioner fields only for practitioners', () => {
    const m = signupMetadata(valid)
    expect(m.npi).toBe('1234567893')
    expect(m.profession).toBe('Pharmacist')
    expect(m.organization).toBeUndefined()
    expect(m.age_confirmed).toBe(true)
  })
  it('drops practitioner and researcher fields for patients', () => {
    const m = signupMetadata({ ...valid, accountType: 'patient', organization: 'X', researchArea: 'Y' })
    expect(m.npi).toBeUndefined()
    expect(m.organization).toBeUndefined()
    expect(m.research_area).toBeUndefined()
  })
  it('omits blank optional fields', () => {
    const m = signupMetadata({ ...valid, country: '', postalCode: '  ' })
    expect('country' in m).toBe(false)
    expect('postal_code' in m).toBe(false)
  })
})
