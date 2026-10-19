/**
 * Sign-up details (phase 19, db/phase19_signup_profiles.sql).
 *
 * Pure logic for the Register form: account types, the 18+ rule, field
 * validation and the metadata sent to Supabase Auth. The database enforces the
 * same age rule (trigger on auth.users), so this file is the friendly layer,
 * not the only one.
 *
 * Destination: src/signup.ts
 */

export const MINIMUM_AGE = 18

export type AccountType = 'patient' | 'practitioner' | 'researcher'

export const ACCOUNT_TYPES: { value: AccountType; label: string; hint: string }[] = [
  { value: 'patient', label: 'Patient or caregiver', hint: 'Looking up medicines for yourself or someone you care for' },
  { value: 'practitioner', label: 'Practitioner', hint: 'Licensed or student healthcare professional' },
  { value: 'researcher', label: 'Researcher', hint: 'Academic, industry or independent research' },
]

export const PROFESSIONS: string[] = [
  'Pharmacist',
  'Pharmacy technician',
  'Physician',
  'Nurse practitioner',
  'Physician assistant',
  'Nurse',
  'Dentist',
  'Student (health professions)',
  'Other',
]

export const COUNTRIES: { value: string; label: string }[] = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'IE', label: 'Ireland' },
  { value: 'AU', label: 'Australia' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'IN', label: 'India' },
  { value: 'PH', label: 'Philippines' },
  { value: 'NG', label: 'Nigeria' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'BR', label: 'Brazil' },
  { value: 'MX', label: 'Mexico' },
  { value: 'JP', label: 'Japan' },
  { value: 'KR', label: 'South Korea' },
  { value: 'CN', label: 'China' },
]

export type SignupDetails = {
  accountType: AccountType | ''
  firstName: string
  lastName: string
  /** ISO yyyy-mm-dd, '' for none. */
  dateOfBirth: string
  ageConfirmed: boolean
  country: string
  postalCode: string
  phone: string
  npi: string
  profession: string
  organization: string
  researchArea: string
}

export const EMPTY_SIGNUP_DETAILS: SignupDetails = {
  accountType: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  ageConfirmed: false,
  country: 'US',
  postalCode: '',
  phone: '',
  npi: '',
  profession: '',
  organization: '',
  researchArea: '',
}

/** Whole years between an ISO birth date and `today`; null if the date is not real. */
export function ageOn(isoDob: string, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDob)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const check = new Date(Date.UTC(y, mo - 1, d))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null
  let age = today.getFullYear() - y
  const beforeBirthday =
    today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)
  if (beforeBirthday) age -= 1
  return age
}

/** Latest birth date (ISO) that is still 18 or older on `today`. */
export function latestEligibleBirthDate(today: Date = new Date()): string {
  const y = today.getFullYear() - MINIMUM_AGE
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

const NPI_PATTERN = /^\d{10}$/
const PHONE_PATTERN = /^\+?[0-9 ().-]{7,20}$/

/**
 * Returns the first problem with the details, or null when they are fine.
 * Password and consent checks stay in the form.
 */
export function validateSignupDetails(d: SignupDetails, today: Date = new Date()): string | null {
  if (!d.accountType) return 'Choose whether you are a patient, practitioner or researcher.'
  if (!d.firstName.trim() || !d.lastName.trim()) return 'Enter your first and last name.'
  if (!d.dateOfBirth) return 'Enter your date of birth.'
  const age = ageOn(d.dateOfBirth, today)
  if (age === null) return 'That date of birth is not a real date.'
  if (age < 0 || age > 120) return 'Check your date of birth.'
  if (age < MINIMUM_AGE) return `You must be ${MINIMUM_AGE} or older to create an account.`
  if (!d.ageConfirmed) return `Confirm that you are ${MINIMUM_AGE} or older.`
  if (d.phone.trim() && !PHONE_PATTERN.test(d.phone.trim())) return 'That phone number does not look right.'
  if (d.accountType === 'practitioner' && d.npi.trim() && !NPI_PATTERN.test(d.npi.trim())) {
    return 'An NPI is exactly 10 digits. Leave it blank to add it later.'
  }
  return null
}

/** Auth user metadata. Only fields that apply to the chosen account type are sent. */
export function signupMetadata(d: SignupDetails): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {
    account_type: d.accountType,
    first_name: d.firstName.trim(),
    last_name: d.lastName.trim(),
    date_of_birth: d.dateOfBirth,
    age_confirmed: d.ageConfirmed,
  }
  const optional: [string, string][] = [
    ['country', d.country],
    ['postal_code', d.postalCode],
    ['phone', d.phone],
  ]
  if (d.accountType === 'practitioner') {
    optional.push(['npi', d.npi], ['profession', d.profession])
  }
  if (d.accountType === 'researcher') {
    optional.push(['organization', d.organization], ['research_area', d.researchArea])
  }
  for (const [key, value] of optional) {
    const v = value.trim()
    if (v) out[key] = v
  }
  return out
}
