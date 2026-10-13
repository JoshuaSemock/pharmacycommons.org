/**
 * Days supply — "Paste directions": reads typed or pasted directions and
 * proposes values for the directions builder.
 *
 * The builder stays the source of truth (docs/days-supply.md, decision 1).
 * This only proposes field values; the page shows what was read and nothing
 * is calculated until the person applies them, then checks the sentence the
 * builder writes. Anything it can't read with confidence is left alone and
 * named, never guessed.
 *
 * Abbreviations are accepted as input because that is how directions arrive,
 * but the builder writes full words. Abbreviations on the ISMP list of
 * error-prone abbreviations (qd, qod, qhs, hs, u, iu, od, os, ou, ad, as, au,
 * sc, sq, sub q, cc) are never interpreted: the person is told to choose that
 * part by hand.
 *
 * Tapers ("… for 3 days, then …") are recognised but not calculated yet; only
 * the first step is proposed and the person is told so.
 *
 * Pure functions, no React. Tested in parse.test.ts.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { applyFormDefaults, formDef, type FormId, type Medication } from '@/tools/medrec/model'

export type Proposal = {
  /** The form the directions point to, when they name a dosing unit. Null = keep the current form. */
  form: FormId | null
  /** Builder fields to set (after the form's defaults when the form changes). */
  patch: Partial<Medication>
  /** What was read, in plain words, one item per field. */
  read: string[]
  /** What couldn't be read, or needs a person to decide. */
  notes: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Numbers
// ─────────────────────────────────────────────────────────────────────────────

const WORD_NUM: Record<string, number> = {
  'one-half': 0.5,
  half: 0.5,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
}

/** A number as written: 2, 0.5, 1/2, 1 1/2, "two", "one-half". */
const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+|one-half|half|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`

function toNum(s: string): number | null {
  const t = s.trim().toLowerCase()
  if (t in WORD_NUM) return WORD_NUM[t]
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t)
  if (mixed) return +mixed[1] + +mixed[2] / +mixed[3]
  const frac = /^(\d+)\/(\d+)$/.exec(t)
  if (frac) return +frac[2] ? +frac[1] / +frac[2] : null
  const n = parseFloat(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

const str = (n: number): string => String(Math.round(n * 10000) / 10000)

// ─────────────────────────────────────────────────────────────────────────────
// Dosing units → form and builder unit
// ─────────────────────────────────────────────────────────────────────────────

type UnitHit = { form: FormId; unit: string; label: string }

/** Ordered: the first pattern that matches wins. `current` lets a word fit the form already chosen. */
function unitHit(word: string, current: FormId, text: string): UnitHit | null {
  const w = word.toLowerCase()
  if (/^(tab|tabs|tablet|tablets)$/.test(w)) {
    const keep: FormId[] = ['tablet', 'er-tablet', 'chewable', 'odt']
    return { form: keep.includes(current) ? current : 'tablet', unit: 'tablet', label: 'tablets' }
  }
  if (/^(cap|caps|capsule|capsules)$/.test(w)) {
    return { form: current === 'er-capsule' ? 'er-capsule' : 'capsule', unit: 'capsule', label: 'capsules' }
  }
  if (/^puffs?$/.test(w)) return { form: current === 'dpi' ? 'dpi' : 'mdi', unit: current === 'dpi' ? 'inhalation' : 'puff', label: 'puffs' }
  if (/^inhalations?$/.test(w)) {
    if (current === 'mdi') return { form: 'mdi', unit: 'puff', label: 'puffs (inhalations)' }
    return { form: 'dpi', unit: 'inhalation', label: 'inhalations' }
  }
  if (/^(drop|drops|gtt|gtts)$/.test(w)) {
    const ear = /\bears?\b/i.test(text) || current === 'ear-drops'
    return { form: ear ? 'ear-drops' : 'eye-drops', unit: 'drop', label: 'drops' }
  }
  if (/^sprays?$/.test(w)) return { form: 'nasal-spray', unit: 'spray', label: 'sprays' }
  if (/^(ml|mls|milliliters?|millilitres?)$/.test(w)) {
    if (current === 'injection') return { form: 'injection', unit: 'mL', label: 'mL' }
    return { form: 'liquid', unit: 'mL', label: 'mL' }
  }
  if (/^units?$/.test(w)) return { form: 'injection', unit: 'unit', label: 'units' }
  if (/^pens?$/.test(w)) return { form: 'injection', unit: 'pen', label: 'pens' }
  if (/^syringes?$/.test(w)) return { form: 'injection', unit: 'syringe', label: 'syringes' }
  if (/^patch(es)?$/.test(w)) return { form: 'patch', unit: 'patch', label: 'patches' }
  if (/^suppositor(y|ies)$/.test(w)) return { form: 'rectal-supp', unit: 'suppository', label: 'suppositories' }
  if (/^(lozenges?|troches?)$/.test(w)) return { form: 'lozenge', unit: 'lozenge', label: 'lozenges' }
  if (/^gumm(y|ies)$/.test(w)) return { form: 'gummy', unit: 'gummy', label: 'gummies' }
  return null
}

const UNIT_WORDS = String.raw`tabs?|tablets?|caps?|capsules?|puffs?|inhalations?|drops?|gtts?|sprays?|mls?|milliliters?|millilitres?|units?|pens?|syringes?|patch(?:es)?|suppositor(?:y|ies)|lozenges?|troches?|gumm(?:y|ies)|teaspoons?|tablespoons?|tsp|tbsp|mg`

// ─────────────────────────────────────────────────────────────────────────────
// Error-prone abbreviations (ISMP) — named, never read
// ─────────────────────────────────────────────────────────────────────────────

const ISMP: readonly [RegExp, string, string][] = [
  [/\bq\.?\s?d\.?\b/i, 'qd', 'how often'],
  [/\bq\.?\s?o\.?\s?d\.?\b/i, 'qod', 'how often'],
  [/\bq\.?\s?h\.?\s?s\.?\b/i, 'qhs', 'how often'],
  [/\bh\.?s\.?\b/i, 'hs', 'how often'],
  [/\bi\.?u\.?\b/i, 'IU', 'the unit'],
  [/\d\s*u\b/i, 'u (units)', 'the unit'],
  [/\b(?:od|os|ou|OD|OS|OU)\b|\bo\.[dsu]\./, 'od / os / ou', 'which eye'],
  // Upper case or dotted only: "as" and "ad" are ordinary words ("as needed").
  [/\b(?:AD|AS|AU)\b|\ba\.[dsu]\./, 'ad / as / au', 'which ear'],
  [/\b(s\.?c\.?|s\.?q\.?|sub\s?q)\b/i, 'sc / sq / sub q', 'the route'],
  [/\bcc\b/i, 'cc', 'the unit'],
]

// ─────────────────────────────────────────────────────────────────────────────
// Frequency
// ─────────────────────────────────────────────────────────────────────────────

const HOURLY: Record<number, string> = { 2: 'q2h', 4: 'q4h', 6: 'q6h', 8: 'q8h', 12: 'q12h', 24: 'once-daily', 72: 'q72h' }

type FreqHit = { id: string; label: string; note?: string }

function frequency(t: string): FreqHit | { unread: string } | null {
  // Every N hours, every N to M hours, qNh, qN-Mh. A range is counted at its shortest interval (the most doses).
  const every = new RegExp(String.raw`\b(?:every|q)\s*(${NUM})(?:\s*(?:to|-|–|or)\s*(${NUM}))?\s*(?:hours?|hrs?|h)\b`, 'i').exec(t)
  if (every) {
    const a = toNum(every[1])
    const b = every[2] ? toNum(every[2]) : null
    if (a) {
      const n = b ? Math.min(a, b) : a
      const id = HOURLY[n]
      if (!id) return { unread: `every ${str(n)} hours (not in the builder's list; choose the nearest by hand)` }
      return {
        id,
        label: n === 24 ? 'once daily (every 24 hours)' : `every ${str(n)} hours`,
        note: b ? `"Every ${str(a)} to ${str(b)} hours" is counted at every ${str(n)} hours, the most it allows.` : undefined,
      }
    }
  }
  // "4 times a day", "2 times daily", "1 time a week".
  const times = new RegExp(String.raw`\b(${NUM})\s+times?\s+(?:(?:a|per|each)\s+(day|week)|(daily|weekly))\b`, 'i').exec(t)
  if (times) {
    const n = toNum(times[1])
    const week = /week/i.test(times[2] ?? times[3] ?? '')
    const ids: Record<number, [string, string]> = week
      ? { 1: ['weekly', 'once weekly'], 2: ['twice-weekly', 'twice weekly'] }
      : { 1: ['once-daily', 'once daily'], 2: ['twice-daily', 'twice daily'], 3: ['three-daily', 'three times daily'], 4: ['four-daily', 'four times daily'] }
    const hit = n ? ids[n] : undefined
    if (hit) return { id: hit[0], label: hit[1] }
    if (n) return { unread: `${str(n)} times a ${week ? 'week' : 'day'} (not in the builder's list; choose it by hand)` }
  }
  const table: [RegExp, string, string][] = [
    [/\b(four times (a|per|each) day|four times daily|qid|q\.i\.d\.)\b/i, 'four-daily', 'four times daily'],
    [/\b(three times (a|per|each) day|three times daily|tid|t\.i\.d\.)\b/i, 'three-daily', 'three times daily'],
    [/\b(twice (a|per|each) day|twice daily|two times (a|per|each) day|two times daily|bid|b\.i\.d\.)\b/i, 'twice-daily', 'twice daily'],
    [/\b(every other day|on alternate days)\b/i, 'every-other-day', 'every other day'],
    [/\b(twice (a|per|each) week|twice weekly|two times (a|per) week)\b/i, 'twice-weekly', 'twice weekly'],
    [/\b(once (a|per|each) week|once weekly|weekly|every week|every 7 days|every seven days)\b/i, 'weekly', 'once weekly'],
    [/\b(once (a|per|each) month|once monthly|monthly|every month|every 30 days)\b/i, 'monthly', 'once monthly'],
    [/\b(at bedtime|before bed|before bedtime|nightly at bedtime)\b/i, 'bedtime', 'at bedtime'],
    [/\b(every morning|each morning|in the morning)\b/i, 'morning', 'every morning'],
    [/\b(every evening|each evening|in the evening|every night|nightly)\b/i, 'evening', 'every evening'],
    [/\b(once (a|per|each) day|once daily|daily|every day|each day)\b/i, 'once-daily', 'once daily'],
  ]
  for (const [re, id, label] of table) if (re.test(t)) return { id, label }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────────────────────

const ROUTES: readonly [RegExp, string][] = [
  [/\b(in|into) (both|each) eyes?\b/i, 'into both eyes'],
  [/\b(in|into) the right eye\b|\bright eye\b/i, 'into the right eye'],
  [/\b(in|into) the left eye\b|\bleft eye\b/i, 'into the left eye'],
  [/\b(in|into) (both|each) ears?\b/i, 'into both ears'],
  [/\b(in|into) the right ear\b|\bright ear\b/i, 'into the right ear'],
  [/\b(in|into) the left ear\b|\bleft ear\b/i, 'into the left ear'],
  [/\b(in|into) (each|both) nostrils?\b/i, 'into each nostril'],
  [/\b(in|into) (one|a|the) nostril\b/i, 'into one nostril'],
  [/\b(under the skin|subcutaneous(ly)?)\b/i, 'under the skin'],
  [/\b(into the muscle|intramuscular(ly)?|i\.?m\.?)\b/i, 'into the muscle'],
  [/\b(into a vein|intravenous(ly)?|i\.?v\.?)\b/i, 'into a vein'],
  [/\b(under the tongue|sublingual(ly)?)\b/i, 'under the tongue'],
  [/\b(by mouth|orally|po|p\.o\.)\b/i, 'by mouth'],
  [/\b(into the rectum|rectally|pr)\b/i, 'into the rectum'],
]

// ─────────────────────────────────────────────────────────────────────────────
// The reader
// ─────────────────────────────────────────────────────────────────────────────

/** Splits "… for 3 days, then …" into steps. One step means no taper. */
export function taperSteps(text: string): string[] {
  return text
    .split(/(?:[,;.]\s*)?\bthen\b/i)
    .map(s => s.trim())
    .filter(Boolean)
}

export function readDirections(text: string, current: FormId): Proposal {
  const read: string[] = []
  const notes: string[] = []
  const patch: Partial<Medication> = {}
  let form: FormId | null = null
  const whole = text.replace(/\s+/g, ' ').trim()
  if (!whole) return { form, patch, read, notes: ['Nothing to read yet.'] }

  const steps = taperSteps(whole)
  if (steps.length > 1) {
    notes.push(
      `These directions have ${steps.length} steps ("then"). Tapers aren't calculated yet; only the first step was read. Work out each step separately for now.`,
    )
  }
  const t = steps[0]

  for (const [re, abbr, what] of ISMP) {
    if (re.test(whole)) notes.push(`"${abbr}" is on the ISMP list of error-prone abbreviations, so it wasn't read. Choose ${what} by hand.`)
  }

  // Amount and unit: "2 puffs", "1 to 2 tablets", "one-half tablet", "0.5 mg", "1 tsp".
  // The first amount that names a dosing unit wins; "500 mg" on a tablet is the strength, so it is skipped.
  const amountRe = new RegExp(String.raw`(${NUM})(?:\s*(?:to|-|–|or)\s*(${NUM}))?\s*(${UNIT_WORDS})\b`, 'gi')
  for (const amount of t.matchAll(amountRe)) {
    let q = toNum(amount[1])
    let q2 = amount[2] ? toNum(amount[2]) : null
    const word = amount[3].toLowerCase()
    let hit: UnitHit | null
    if (/^(teaspoons?|tsp|tablespoons?|tbsp)$/.test(word)) {
      const per = /^(teaspoons?|tsp)$/.test(word) ? 5 : 15
      hit = { form: 'liquid', unit: 'mL', label: 'mL' }
      if (q) q *= per
      if (q2) q2 *= per
      notes.push(`${per === 5 ? 'Teaspoons' : 'Tablespoons'} were changed to mL (${per} mL each). Check the dosing device dispensed.`)
    } else if (word === 'mg') {
      hit = current === 'injection' || /\binject|under the skin|subcutaneous/i.test(t) ? { form: 'injection', unit: 'mg', label: 'mg' } : null
    } else {
      hit = unitHit(word, current, whole)
    }
    if (!hit || !q) continue
    form = hit.form === current ? null : hit.form
    patch.unit = hit.unit
    patch.qty = str(q)
    if (q2 && q2 > q) {
      patch.range = true
      patch.qtyMax = str(q2)
      read.push(`${str(q)} to ${str(q2)} ${hit.label} each time`)
    } else {
      patch.range = false
      patch.qtyMax = ''
      read.push(`${str(q)} ${hit.label} each time`)
    }
    break
  }
  if (patch.qty == null) {
    // "Take 2 by mouth": a number straight after the action word.
    const bare = new RegExp(String.raw`\b(?:take|give|use|inhale|instill|inject|apply|insert|chew|dissolve)\s+(${NUM})\b`, 'i').exec(t)
    const q = bare ? toNum(bare[1]) : null
    if (q) {
      patch.qty = str(q)
      patch.range = false
      read.push(`${str(q)} each time (no unit named; the form's unit is kept)`)
    } else {
      notes.push('No amount was found. Enter how many each time.')
    }
  }

  // Frequency.
  const fr = frequency(t)
  if (fr && 'id' in fr) {
    patch.freq = fr.id
    read.push(fr.label)
    if (fr.note) notes.push(fr.note)
  } else if (fr && 'unread' in fr) {
    notes.push(`How often: ${fr.unread}.`)
  } else {
    notes.push('How often was not found. Choose it by hand.')
  }

  // As needed, and what for.
  const prn = /\b(as needed|if needed|when needed|as required|prn|p\.r\.n\.)\b/i.exec(t)
  if (prn) {
    patch.prn = true
    read.push('as needed')
    const forWhat = /\b(?:as needed|if needed|when needed|as required|prn|p\.r\.n\.)\s+for\s+([^.,;]+)/i.exec(t)
    if (forWhat) {
      patch.indication = forWhat[1].trim()
      read.push(`for ${patch.indication}`)
    }
  } else {
    patch.prn = false
    patch.indication = ''
  }
  patch.showMax = null
  patch.maxOverride = ''

  // Most in 24 hours: "not to exceed 8 puffs in 24 hours", "max 12 per day", "no more than 4 a day".
  const max = new RegExp(
    String.raw`\b(?:not to exceed|do not exceed|no more than|max(?:imum)?(?:\s+of)?|up to)\s+(${NUM})\s*(?:${UNIT_WORDS})?\s*(?:in|per|a|each|every)\s*(?:24 hours|day|24h|24 hrs)`,
    'i',
  ).exec(whole)
  if (max) {
    const n = toNum(max[1])
    if (n) {
      patch.maxOverride = str(n)
      read.push(`at most ${str(n)} in 24 hours`)
    }
  }

  // Route.
  for (const [re, route] of ROUTES) {
    if (re.test(t)) {
      patch.route = route
      read.push(route)
      break
    }
  }

  return { form, patch, read, notes }
}

/**
 * Applies a proposal to the builder: the new form's defaults first (as picking
 * the form by hand does), then the fields read. A route or unit the form
 * doesn't offer is left at the form's default and named.
 */
export function applyProposal(m: Medication, p: Proposal): { med: Medication; notes: string[] } {
  const notes: string[] = []
  const base = p.form ? applyFormDefaults({ ...m, form: p.form, instr: [] }) : m
  const f = formDef(base.form)
  const patch: Partial<Medication> = { ...p.patch }
  if (patch.route != null && !f.routes.includes(patch.route)) {
    notes.push(`"${patch.route}" isn't a route for ${f.label.toLowerCase()}; the form's route was kept.`)
    delete patch.route
  }
  if (patch.unit != null && !(f.units ?? []).some(u => u.sg === patch.unit)) delete patch.unit
  return { med: { ...base, ...patch }, notes }
}
