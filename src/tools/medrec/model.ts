/**
 * Medication reconciliation — data model and vocabularies.
 *
 * Everything the tool records lives in one `MedRecState` object that stays in
 * the browser (localStorage) and round-trips through a CSV file (csv.ts).
 * Nothing here is sent to Supabase. The only network use is the drug-name
 * search, which reads the public catalog the rest of the site already loads.
 *
 * Wording rules (Joshua, 2026-09-27): no sig shorthand and no abbreviations
 * other than units of measure (mg, mcg, g, mL, mEq), and nothing from the
 * ISMP do-not-use list — "units" is always spelled out, never "U" or "IU";
 * "once daily", never "QD"; no trailing zeros; leading zero on decimals.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// ─────────────────────────────────────────────────────────────────────────────
// Medications
// ─────────────────────────────────────────────────────────────────────────────

export type CategoryId = 'rx' | 'otc' | 'supplement' | 'herbal' | 'alternative'

export const CATEGORIES: readonly [CategoryId, string][] = [
  ['rx', 'Prescription'],
  ['otc', 'Over the counter'],
  ['supplement', 'Supplement'],
  ['herbal', 'Herbal'],
  ['alternative', 'Alternative medicine'],
]
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES) as Record<CategoryId, string>

export type UnitKind = 'count' | 'measure'
/** A dosing unit. Counted units are written as words ("two tablets"), measured ones as numerals ("5 mL"). */
export type UnitDef = { sg: string; pl: string; kind: UnitKind }

export type StrengthUnit = 'mg' | 'mcg' | 'g' | 'units' | 'mEq' | '%'
export const STRENGTH_UNITS: readonly StrengthUnit[] = ['mg', 'mcg', 'g', 'units', 'mEq', '%']

/** What one strength value is measured against. `each` = one dosing unit (tablet, puff, spray…). */
export type StrengthPer = 'each' | 'mL' | '5 mL' | 'hour' | 'none'
export const STRENGTH_PERS: readonly StrengthPer[] = ['each', 'mL', '5 mL', 'hour', 'none']

export type InstructionId = 'food' | 'empty' | 'water' | 'whole' | 'shake' | 'rinse' | 'patch' | 'mix' | 'wash' | 'drowsy'

export const INSTRUCTIONS: readonly [InstructionId, string][] = [
  ['food', 'Take with food.'],
  ['empty', 'Take on an empty stomach.'],
  ['water', 'Take with a full glass of water.'],
  ['whole', 'Swallow whole. Do not crush, chew, or split.'],
  ['shake', 'Shake well before each use.'],
  ['rinse', 'Rinse your mouth with water after each use.'],
  ['patch', 'Remove the old patch before applying a new one.'],
  ['mix', 'Mix in 4 to 8 ounces of water or juice before taking.'],
  ['wash', 'Wash your hands after applying.'],
  ['drowsy', 'May cause drowsiness. Use caution when driving.'],
]
export const INSTRUCTION_TEXT = Object.fromEntries(INSTRUCTIONS) as Record<InstructionId, string>
export const isInstructionId = (k: string): k is InstructionId => k in INSTRUCTION_TEXT

export type FormDef = {
  label: string
  /** First verb is the default. */
  verbs: string[]
  /** Dosing units; first is the default. Absent for forms written as "a thin layer". */
  units?: UnitDef[]
  /** Set for creams and ointments: the amount phrase used in place of a count. */
  thin?: string
  /** First route is the default. An empty string means no route is written ("Drink one cup"). */
  routes: string[]
  /** Default "per" for the strength. */
  per: StrengthPer
  /** Extra instructions switched on when this form is chosen. */
  suggest?: InstructionId[]
}

const u = (sg: string, pl: string, kind: UnitKind = 'count'): UnitDef => ({
  sg,
  pl,
  kind,
})
const THIN_ROUTES = ['to the affected area', 'to the skin', 'to the face', 'to the scalp', 'to the hands', 'to the feet']

export const FORMS = {
  tablet: {
    label: 'Tablet',
    verbs: ['Take', 'Give'],
    units: [u('tablet', 'tablets')],
    routes: ['by mouth', 'under the tongue', 'through a feeding tube'],
    per: 'each',
  },
  'er-tablet': {
    label: 'Extended-release tablet',
    verbs: ['Take', 'Give'],
    units: [u('tablet', 'tablets')],
    routes: ['by mouth'],
    per: 'each',
    suggest: ['whole'],
  },
  capsule: {
    label: 'Capsule',
    verbs: ['Take', 'Give'],
    units: [u('capsule', 'capsules')],
    routes: ['by mouth', 'through a feeding tube'],
    per: 'each',
  },
  'er-capsule': {
    label: 'Extended-release capsule',
    verbs: ['Take', 'Give'],
    units: [u('capsule', 'capsules')],
    routes: ['by mouth'],
    per: 'each',
    suggest: ['whole'],
  },
  chewable: {
    label: 'Chewable tablet',
    verbs: ['Chew', 'Give'],
    units: [u('tablet', 'tablets')],
    routes: ['by mouth'],
    per: 'each',
  },
  odt: {
    label: 'Orally disintegrating tablet',
    verbs: ['Dissolve', 'Give'],
    units: [u('tablet', 'tablets')],
    routes: ['on the tongue'],
    per: 'each',
  },
  liquid: {
    label: 'Oral liquid (solution or suspension)',
    verbs: ['Take', 'Give'],
    units: [u('mL', 'mL', 'measure')],
    routes: ['by mouth', 'through a feeding tube'],
    per: '5 mL',
  },
  tincture: {
    label: 'Oral drops or tincture',
    verbs: ['Take', 'Give'],
    units: [u('mL', 'mL', 'measure'), u('drop', 'drops')],
    routes: ['under the tongue', 'by mouth'],
    per: 'mL',
  },
  powder: {
    label: 'Oral powder',
    verbs: ['Take', 'Give'],
    units: [u('gram', 'grams', 'measure'), u('packet', 'packets'), u('capful', 'capfuls'), u('scoop', 'scoops')],
    routes: ['by mouth'],
    per: 'each',
    suggest: ['mix'],
  },
  gummy: {
    label: 'Gummy',
    verbs: ['Chew', 'Give'],
    units: [u('gummy', 'gummies')],
    routes: ['by mouth'],
    per: 'each',
  },
  lozenge: {
    label: 'Lozenge or troche',
    verbs: ['Dissolve'],
    units: [u('lozenge', 'lozenges')],
    routes: ['in the mouth'],
    per: 'each',
  },
  tea: {
    label: 'Tea or infusion',
    verbs: ['Drink'],
    units: [u('cup', 'cups')],
    routes: [''],
    per: 'none',
  },
  cream: {
    label: 'Cream',
    verbs: ['Apply'],
    thin: 'a thin layer',
    routes: THIN_ROUTES,
    per: 'none',
  },
  ointment: {
    label: 'Ointment',
    verbs: ['Apply'],
    thin: 'a thin layer',
    routes: THIN_ROUTES,
    per: 'none',
  },
  gel: {
    label: 'Gel',
    verbs: ['Apply'],
    thin: 'a thin layer',
    routes: THIN_ROUTES,
    per: 'none',
  },
  lotion: {
    label: 'Lotion',
    verbs: ['Apply'],
    thin: 'a thin layer',
    routes: THIN_ROUTES,
    per: 'none',
  },
  patch: {
    label: 'Patch',
    verbs: ['Apply'],
    units: [u('patch', 'patches')],
    routes: ['to the skin'],
    per: 'hour',
    suggest: ['patch'],
  },
  'eye-drops': {
    label: 'Eye drops',
    verbs: ['Instill'],
    units: [u('drop', 'drops')],
    routes: ['into both eyes', 'into the right eye', 'into the left eye'],
    per: 'none',
  },
  'eye-ointment': {
    label: 'Eye ointment',
    verbs: ['Apply'],
    thin: 'a thin ribbon (about one-half inch)',
    routes: ['inside the lower eyelid of both eyes', 'inside the lower eyelid of the right eye', 'inside the lower eyelid of the left eye'],
    per: 'none',
  },
  'ear-drops': {
    label: 'Ear drops',
    verbs: ['Instill'],
    units: [u('drop', 'drops')],
    routes: ['into both ears', 'into the right ear', 'into the left ear'],
    per: 'none',
  },
  'nasal-spray': {
    label: 'Nasal spray',
    verbs: ['Use', 'Spray'],
    units: [u('spray', 'sprays')],
    routes: ['into each nostril', 'into one nostril'],
    per: 'each',
  },
  mdi: {
    label: 'Inhaler (metered-dose)',
    verbs: ['Inhale'],
    units: [u('puff', 'puffs')],
    routes: ['by mouth'],
    per: 'each',
  },
  dpi: {
    label: 'Inhaler (dry powder)',
    verbs: ['Inhale'],
    units: [u('inhalation', 'inhalations')],
    routes: ['by mouth'],
    per: 'each',
  },
  neb: {
    label: 'Nebulizer solution',
    verbs: ['Inhale', 'Give'],
    units: [u('vial', 'vials'), u('mL', 'mL', 'measure')],
    routes: ['by nebulizer'],
    per: 'each',
  },
  injection: {
    label: 'Injection',
    verbs: ['Inject', 'Give'],
    units: [u('unit', 'units', 'measure'), u('mL', 'mL', 'measure'), u('mg', 'mg', 'measure'), u('pen', 'pens'), u('syringe', 'syringes')],
    routes: ['under the skin', 'into the muscle', 'into a vein'],
    per: 'mL',
  },
  'rectal-supp': {
    label: 'Rectal suppository',
    verbs: ['Insert'],
    units: [u('suppository', 'suppositories')],
    routes: ['into the rectum'],
    per: 'each',
  },
  vaginal: {
    label: 'Vaginal cream or gel',
    verbs: ['Insert'],
    units: [u('applicatorful', 'applicatorfuls')],
    routes: ['into the vagina'],
    per: 'none',
  },
} satisfies Record<string, FormDef>

export type FormId = keyof typeof FORMS
export const isFormId = (k: string): k is FormId => k in FORMS
export const formDef = (id: FormId): FormDef => FORMS[id]

export const FORM_GROUPS: readonly [string, FormId[]][] = [
  ['By mouth', ['tablet', 'er-tablet', 'capsule', 'er-capsule', 'chewable', 'odt', 'liquid', 'tincture', 'powder', 'gummy', 'lozenge', 'tea']],
  ['On the skin', ['cream', 'ointment', 'gel', 'lotion', 'patch']],
  ['Eyes, ears, nose', ['eye-drops', 'eye-ointment', 'ear-drops', 'nasal-spray']],
  ['Inhaled', ['mdi', 'dpi', 'neb']],
  ['Other', ['injection', 'rectal-supp', 'vaginal']],
]

/** Forms whose strength is usually a percentage. */
export const PERCENT_FORMS: ReadonlySet<FormId> = new Set<FormId>(['cream', 'ointment', 'gel', 'lotion', 'eye-drops', 'ear-drops', 'eye-ointment', 'vaginal'])

export type FreqDef = {
  id: string
  text: string
  /** Administrations per 24 hours, for the maximum. Below 1 means less often than daily. */
  perDay: number
  /** "N times daily/weekly" wording, which takes "up to" when as needed. */
  count: boolean
}
export const FREQS: readonly FreqDef[] = [
  { id: 'once-daily', text: 'once daily', perDay: 1, count: true },
  { id: 'twice-daily', text: 'twice daily', perDay: 2, count: true },
  { id: 'three-daily', text: 'three times daily', perDay: 3, count: true },
  { id: 'four-daily', text: 'four times daily', perDay: 4, count: true },
  { id: 'morning', text: 'every morning', perDay: 1, count: false },
  { id: 'evening', text: 'every evening', perDay: 1, count: false },
  { id: 'bedtime', text: 'at bedtime', perDay: 1, count: false },
  { id: 'q2h', text: 'every 2 hours', perDay: 12, count: false },
  { id: 'q4h', text: 'every 4 hours', perDay: 6, count: false },
  { id: 'q6h', text: 'every 6 hours', perDay: 4, count: false },
  { id: 'q8h', text: 'every 8 hours', perDay: 3, count: false },
  { id: 'q12h', text: 'every 12 hours', perDay: 2, count: false },
  { id: 'every-other-day', text: 'every other day', perDay: 0.5, count: false },
  { id: 'q72h', text: 'every 72 hours', perDay: 1 / 3, count: false },
  { id: 'twice-weekly', text: 'twice weekly', perDay: 2 / 7, count: true },
  { id: 'weekly', text: 'once weekly', perDay: 1 / 7, count: true },
  { id: 'monthly', text: 'once monthly', perDay: 1 / 30, count: true },
]
export const FREQ_BY_ID: ReadonlyMap<string, FreqDef> = new Map(FREQS.map(f => [f.id, f]))

export type DurationMode = 'ongoing' | 'days' | 'weeks' | 'months' | 'until-finished'
export const DURATIONS: readonly [DurationMode, string][] = [
  ['ongoing', 'Ongoing'],
  ['days', 'Days'],
  ['weeks', 'Weeks'],
  ['months', 'Months'],
  ['until-finished', 'Until finished'],
]
export const isDurationMode = (k: string): k is DurationMode => DURATIONS.some(([d]) => d === k)

export type StatusId = 'taking' | 'differently' | 'not-taking' | 'stopped'
export type Tone = 'ok' | 'caution' | 'warn' | 'info' | 'muted'
export const STATUSES: readonly [StatusId, string, Tone][] = [
  ['taking', 'Taking as prescribed', 'ok'],
  ['differently', 'Taking differently than prescribed', 'caution'],
  ['not-taking', 'Not taking', 'muted'],
  ['stopped', 'Stopped', 'muted'],
]
export const STATUS: Record<StatusId, { label: string; tone: Tone }> = Object.fromEntries(STATUSES.map(([id, label, tone]) => [id, { label, tone }])) as Record<
  StatusId,
  { label: string; tone: Tone }
>
export const isStatusId = (k: string): k is StatusId => k in STATUS

export type Medication = {
  id: string
  category: CategoryId
  /** Display name as entered or picked. */
  drug: string
  /** Set when the name was picked from the Pharmacy Commons catalog. */
  pcid: number | null
  /** Strength value as typed (kept as a string so partial input survives). */
  sv: string
  su: StrengthUnit
  sper: StrengthPer
  form: FormId
  verb: string
  qty: string
  range: boolean
  qtyMax: string
  /** Singular name of the dosing unit, e.g. "tablet". */
  unit: string
  /** One of the form's routes, or "other" with `routeOther`. */
  route: string
  routeOther: string
  freq: string
  prn: boolean
  indication: string
  dur: DurationMode
  durN: string
  instr: InstructionId[]
  instrOther: string
  /** null = follow the default (shown when as needed). */
  showMax: boolean | null
  /** Hand-set maximum dosing units per 24 hours; blank = calculated. */
  maxOverride: string
  status: StatusId
  prescriber: string
  lastDose: string
  notes: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Allergies
// ─────────────────────────────────────────────────────────────────────────────

export type AllergyType = 'allergy' | 'intolerance' | 'side-effect' | 'unsure'
export const ALLERGY_TYPES: readonly [AllergyType, string][] = [
  ['allergy', 'Allergy'],
  ['intolerance', 'Intolerance'],
  ['side-effect', 'Side effect'],
  ['unsure', 'Not sure'],
]
export const isAllergyType = (k: string): k is AllergyType => ALLERGY_TYPES.some(([t]) => t === k)

export const REACTIONS: readonly string[] = [
  'Hives',
  'Rash',
  'Itching',
  'Swelling of the face, lips, tongue, or throat',
  'Trouble breathing or wheezing',
  'Anaphylaxis (severe whole-body reaction)',
  'Severe skin reaction with blistering or peeling',
  'Nausea or vomiting',
  'Diarrhea',
  'Stomach pain or upset',
  'Dizziness or lightheadedness',
  'Headache',
  'Muscle aches',
  'Cough',
  'Not sure',
]
/** Reactions that make an allergy severe whatever the treatment was. */
export const SEVERE_REACTIONS: ReadonlySet<string> = new Set([
  'Swelling of the face, lips, tongue, or throat',
  'Trouble breathing or wheezing',
  'Anaphylaxis (severe whole-body reaction)',
  'Severe skin reaction with blistering or peeling',
])

/** "How severe was it", told as what happened. `level`: 0 mild/unknown, 1 moderate, 2 severe. */
export const SEVERITIES: readonly {
  id: string
  label: string
  level: 0 | 1 | 2
}[] = [
  { id: 'mild', label: 'Mild, no treatment needed', level: 0 },
  { id: 'changed', label: 'Stopped or changed the medication', level: 1 },
  {
    id: 'home',
    label: 'Treated at home (for example, an antihistamine)',
    level: 1,
  },
  {
    id: 'clinician',
    label: 'Saw a clinician or went to urgent care',
    level: 1,
  },
  { id: 'er', label: 'Went to the emergency room', level: 2 },
  {
    id: 'epinephrine',
    label: 'Used an epinephrine auto-injector (such as EpiPen)',
    level: 2,
  },
  { id: 'hospital', label: 'Admitted to the hospital', level: 2 },
  { id: 'unsure', label: 'Not sure', level: 0 },
]
export const SEVERITY_BY_ID: ReadonlyMap<string, (typeof SEVERITIES)[number]> = new Map(SEVERITIES.map(s => [s.id, s]))

/** Suggestions offered alongside catalog matches: drug classes and non-drug allergens the catalog doesn't hold. */
export const ALLERGEN_SUGGESTIONS: readonly string[] = [
  'Penicillin antibiotics (class)',
  'Cephalosporin antibiotics (class)',
  'Sulfonamide antibiotics (class)',
  'Fluoroquinolone antibiotics (class)',
  'Nonsteroidal anti-inflammatory drugs (class)',
  'ACE inhibitors (class)',
  'Statins (class)',
  'Opioids (class)',
  'Iodinated contrast dye',
  'Gadolinium contrast',
  'Latex',
  'Adhesive tape',
  'Egg',
  'Peanut',
  'Tree nuts',
  'Shellfish',
  'Soy',
  'Bee or wasp stings',
]

export type Allergy = {
  id: string
  substance: string
  pcid: number | null
  type: AllergyType
  /** One of REACTIONS, "other", or blank. */
  reaction: string
  reactionOther: string
  /** A SEVERITIES id, "other", or blank. */
  severity: string
  severityOther: string
  when: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Substance use
// ─────────────────────────────────────────────────────────────────────────────

export type UseStatus = '' | 'never' | 'current' | 'former'
export const USE_STATUSES: readonly [Exclude<UseStatus, ''>, string][] = [
  ['never', 'Never'],
  ['current', 'Current'],
  ['former', 'Former'],
]
export const isUseStatus = (k: string): k is UseStatus => k === '' || USE_STATUSES.some(([s]) => s === k)

/** Typical caffeine per serving (mg). Users edit mg to match a label. */
export const CAFFEINE_SOURCES: readonly {
  id: string
  label: string
  mg: number
}[] = [
  { id: 'coffee', label: 'Brewed coffee, 8 ounces', mg: 95 },
  { id: 'espresso', label: 'Espresso, 1 shot', mg: 63 },
  { id: 'black-tea', label: 'Black tea, 8 ounces', mg: 47 },
  { id: 'green-tea', label: 'Green tea, 8 ounces', mg: 28 },
  { id: 'cola', label: 'Cola, 12-ounce can', mg: 34 },
  { id: 'energy-small', label: 'Energy drink, 8.4-ounce can', mg: 80 },
  { id: 'energy-large', label: 'Energy drink, 16-ounce can', mg: 160 },
  { id: 'pill', label: 'Caffeine tablet', mg: 200 },
  { id: 'preworkout', label: 'Pre-workout, 1 scoop', mg: 200 },
  { id: 'other', label: 'Other', mg: 0 },
]
export const CAFFEINE_BY_ID: ReadonlyMap<string, (typeof CAFFEINE_SOURCES)[number]> = new Map(CAFFEINE_SOURCES.map(c => [c.id, c]))

export const NICOTINE_PRODUCTS: readonly {
  id: string
  label: string
  unit: string
}[] = [
  { id: 'cigarettes', label: 'Cigarettes', unit: 'cigarettes' },
  { id: 'cigars', label: 'Cigars or cigarillos', unit: 'cigars' },
  { id: 'pipe', label: 'Pipe', unit: 'bowls' },
  { id: 'vape', label: 'E-cigarette or vape', unit: 'pods or cartridges' },
  { id: 'smokeless', label: 'Chewing tobacco or snuff', unit: 'tins' },
  { id: 'pouches', label: 'Nicotine pouches', unit: 'pouches' },
  {
    id: 'nrt',
    label: 'Nicotine replacement (gum, lozenge, patch)',
    unit: 'pieces or patches',
  },
]
export const NICOTINE_BY_ID: ReadonlyMap<string, (typeof NICOTINE_PRODUCTS)[number]> = new Map(NICOTINE_PRODUCTS.map(n => [n.id, n]))

export type DrinkType = 'beer' | 'wine' | 'spirits'
export const DRINKS: readonly [DrinkType, string, string][] = [
  ['beer', 'Beer', '12 ounces at about 5% alcohol'],
  ['wine', 'Wine', '5 ounces at about 12% alcohol'],
  ['spirits', 'Spirits or liquor', '1.5 ounces at about 40% alcohol'],
]

/** AUDIT-C: three questions, each scored 0–4 by answer position. */
export const AUDIT_C: readonly [string, string[]][] = [
  ['How often do you have a drink containing alcohol?', ['Never', 'Monthly or less', '2 to 4 times a month', '2 to 3 times a week', '4 or more times a week']],
  ['How many standard drinks do you have on a typical day when you are drinking?', ['1 or 2', '3 or 4', '5 or 6', '7 to 9', '10 or more']],
  ['How often do you have 6 or more drinks on one occasion?', ['Never', 'Less than monthly', 'Monthly', 'Weekly', 'Daily or almost daily']],
]

export const REC_SUGGESTIONS: readonly string[] = [
  'Cannabis',
  'Cannabidiol (CBD) products',
  'Delta-8 THC',
  'Kratom',
  'Cocaine',
  'Methamphetamine',
  'MDMA (ecstasy)',
  'Psilocybin mushrooms',
  'LSD',
  'Ketamine',
  'Opioids not prescribed to me',
  'Benzodiazepines not prescribed to me',
  'Stimulants not prescribed to me',
  'Inhalants',
  'Heroin or fentanyl',
]
export const REC_HOW: readonly [string, string][] = [
  ['smoked', 'Smoked'],
  ['vaped', 'Vaped'],
  ['edible', 'Eaten or drunk'],
  ['pill', 'Swallowed as a pill'],
  ['snorted', 'Snorted'],
  ['injected', 'Injected'],
  ['other', 'Other'],
]
export const REC_OFTEN: readonly [string, string][] = [
  ['daily', 'Daily or almost daily'],
  ['weekly-plus', 'Several times a week'],
  ['weekly', 'About once a week'],
  ['monthly', 'About once a month'],
  ['rarely', 'Less than once a month'],
]

export type CaffeineItem = {
  id: string
  source: string
  servings: string
  mg: string
}
export type NicotineItem = {
  id: string
  product: string
  amount: string
  per: 'day' | 'week'
  years: string
}
export type RecItem = {
  id: string
  substance: string
  how: string
  often: string
  last: string
}

export type Substances = {
  caffeine: { status: UseStatus; items: CaffeineItem[] }
  nicotine: { status: UseStatus; quitYear: string; items: NicotineItem[] }
  alcohol: {
    status: UseStatus
    quitYear: string
    beer: string
    wine: string
    spirits: string
    audit: [string, string, string]
  }
  recreational: { status: UseStatus; items: RecItem[] }
}
export type SubstanceKey = keyof Substances
export const SUBSTANCE_KEYS: readonly [SubstanceKey, string][] = [
  ['caffeine', 'Caffeine'],
  ['nicotine', 'Nicotine and tobacco'],
  ['alcohol', 'Alcohol'],
  ['recreational', 'Recreational substances'],
]

// ─────────────────────────────────────────────────────────────────────────────
// Whole list
// ─────────────────────────────────────────────────────────────────────────────

export type MedRecState = {
  v: 1
  /** True while the built-in example is loaded and untouched. */
  example: boolean
  name: string
  dob: string
  /** "No known drug allergies" — records that the question was asked. */
  nkda: boolean
  allergies: Allergy[]
  meds: Medication[]
  subs: Substances
}

export const uid = (): string => Math.random().toString(36).slice(2, 9)

export function newAllergy(): Allergy {
  return {
    id: uid(),
    substance: '',
    pcid: null,
    type: 'allergy',
    reaction: '',
    reactionOther: '',
    severity: '',
    severityOther: '',
    when: '',
  }
}

export function newMedication(category: CategoryId = 'rx'): Medication {
  return {
    id: uid(),
    category,
    drug: '',
    pcid: null,
    sv: '',
    su: 'mg',
    sper: 'each',
    form: 'tablet',
    verb: 'Take',
    qty: '1',
    range: false,
    qtyMax: '',
    unit: 'tablet',
    route: 'by mouth',
    routeOther: '',
    freq: 'once-daily',
    prn: false,
    indication: '',
    dur: 'ongoing',
    durN: '',
    instr: [],
    instrOther: '',
    showMax: null,
    maxOverride: '',
    status: 'taking',
    prescriber: '',
    lastDose: '',
    notes: '',
  }
}

export const newCaffeineItem = (): CaffeineItem => ({
  id: uid(),
  source: 'coffee',
  servings: '1',
  mg: '95',
})
export const newNicotineItem = (): NicotineItem => ({
  id: uid(),
  product: 'cigarettes',
  amount: '',
  per: 'day',
  years: '',
})
export const newRecItem = (): RecItem => ({
  id: uid(),
  substance: '',
  how: 'smoked',
  often: 'weekly',
  last: '',
})

export function newSubstances(): Substances {
  return {
    caffeine: { status: '', items: [] },
    nicotine: { status: '', quitYear: '', items: [] },
    alcohol: {
      status: '',
      quitYear: '',
      beer: '',
      wine: '',
      spirits: '',
      audit: ['', '', ''],
    },
    recreational: { status: '', items: [] },
  }
}

export function blankState(): MedRecState {
  return {
    v: 1,
    example: false,
    name: '',
    dob: '',
    nkda: false,
    allergies: [],
    meds: [],
    subs: newSubstances(),
  }
}

/**
 * Applies a form's defaults (verb, unit, route, strength basis, suggested
 * instructions). Called when the form changes, never on load, so a user's
 * own choices are not overwritten when a saved list is reopened.
 */
export function applyFormDefaults(m: Medication): Medication {
  const f = formDef(m.form)
  const next: Medication = {
    ...m,
    verb: f.verbs[0],
    unit: f.units ? f.units[0].sg : m.unit,
    route: f.routes[0],
    sper: f.per,
    su: PERCENT_FORMS.has(m.form) ? '%' : m.su === '%' ? 'mg' : m.su,
    range: f.thin ? false : m.range,
    instr: [...m.instr],
  }
  for (const k of f.suggest ?? []) if (!next.instr.includes(k)) next.instr.push(k)
  return next
}

/** The built-in example list. Clearly labelled in the UI as not a real person's medications. */
export function exampleState(): MedRecState {
  const med = (o: Partial<Medication>): Medication => ({
    ...newMedication(),
    ...o,
  })
  const s = blankState()
  s.example = true
  s.allergies = [
    {
      ...newAllergy(),
      substance: 'penicillin',
      type: 'allergy',
      reaction: 'Hives',
      severity: 'er',
      when: 'Childhood',
    },
    {
      ...newAllergy(),
      substance: 'codeine',
      type: 'intolerance',
      reaction: 'Nausea or vomiting',
      severity: 'changed',
      when: '2018',
    },
    {
      ...newAllergy(),
      substance: 'Latex',
      type: 'allergy',
      reaction: 'Itching',
      severity: 'mild',
    },
  ]
  s.meds = [
    med({
      drug: 'sertraline',
      sv: '50',
      indication: 'depression',
      prescriber: 'Primary care clinic',
      lastDose: 'This morning',
    }),
    med({
      drug: 'hydroxyzine hydrochloride',
      sv: '25',
      qty: '2',
      freq: 'twice-daily',
      prn: true,
      indication: 'anxiety',
      instr: ['drowsy'],
      lastDose: 'Yesterday evening',
    }),
    med({
      drug: 'metformin',
      sv: '500',
      form: 'er-tablet',
      qty: '2',
      freq: 'evening',
      indication: 'type 2 diabetes',
      instr: ['food', 'whole'],
      status: 'differently',
      notes: 'Often skips the evening dose',
    }),
    med({
      drug: 'insulin glargine',
      sv: '100',
      su: 'units',
      sper: 'mL',
      form: 'injection',
      verb: 'Inject',
      unit: 'unit',
      qty: '18',
      route: 'under the skin',
      freq: 'bedtime',
      indication: 'type 2 diabetes',
    }),
    med({
      drug: 'albuterol',
      sv: '90',
      su: 'mcg',
      form: 'mdi',
      verb: 'Inhale',
      unit: 'puff',
      qty: '2',
      freq: 'q4h',
      prn: true,
      indication: 'wheezing or shortness of breath',
      instr: ['shake'],
    }),
    med({
      category: 'otc',
      drug: 'ibuprofen',
      sv: '200',
      qty: '2',
      freq: 'q6h',
      prn: true,
      indication: 'pain',
      instr: ['food'],
      maxOverride: '6',
      dur: 'days',
      durN: '10',
    }),
    med({
      category: 'otc',
      drug: 'hydrocortisone',
      sv: '1',
      su: '%',
      sper: 'none',
      form: 'cream',
      verb: 'Apply',
      route: 'to the affected area',
      freq: 'twice-daily',
      prn: true,
      indication: 'itching',
    }),
    med({
      category: 'supplement',
      drug: 'cholecalciferol (vitamin D3)',
      sv: '2000',
      su: 'units',
      form: 'capsule',
      unit: 'capsule',
      indication: 'low vitamin D',
    }),
    med({
      category: 'herbal',
      drug: 'ashwagandha',
      sv: '300',
      form: 'capsule',
      unit: 'capsule',
      freq: 'bedtime',
      indication: 'sleep',
      prescriber: 'Self',
    }),
    med({
      category: 'alternative',
      drug: 'cannabidiol (CBD) oil',
      sv: '25',
      sper: 'mL',
      form: 'tincture',
      unit: 'mL',
      route: 'under the tongue',
      freq: 'bedtime',
      indication: 'sleep',
      prescriber: 'Self',
    }),
  ]
  s.subs.caffeine = {
    status: 'current',
    items: [
      { id: uid(), source: 'coffee', servings: '2', mg: '95' },
      { id: uid(), source: 'cola', servings: '1', mg: '34' },
    ],
  }
  s.subs.nicotine = {
    status: 'former',
    quitYear: '2019',
    items: [
      {
        id: uid(),
        product: 'cigarettes',
        amount: '10',
        per: 'day',
        years: '8',
      },
    ],
  }
  s.subs.alcohol = {
    status: 'current',
    quitYear: '',
    beer: '3',
    wine: '2',
    spirits: '',
    audit: ['2', '0', '1'],
  }
  s.subs.recreational = {
    status: 'current',
    items: [
      {
        id: uid(),
        substance: 'Cannabis',
        how: 'edible',
        often: 'weekly',
        last: 'Last weekend',
      },
    ],
  }
  return s
}
