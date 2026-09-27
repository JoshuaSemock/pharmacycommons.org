import { describe, expect, it } from 'vitest'
import { applyFormDefaults, exampleState, newMedication, type Medication } from './model'
import { auditCScore, caffeineMgPerDay, fmt, maxInfo, medColumns, packYears, reviewFlags, sigText, words } from './sig'
import { csvCell, fromCsv, parseCsv, toCsv } from './csv'

const med = (o: Partial<Medication>): Medication => ({
  ...newMedication(),
  ...o,
})

describe('number wording', () => {
  it('spells counts, keeps leading zeros, drops trailing zeros, adds thousands separators', () => {
    expect(words(2)).toBe('two')
    expect(words(0.5)).toBe('one-half')
    expect(words(1.5)).toBe('one and one-half')
    expect(words(25)).toBe('25')
    expect(fmt(0.5)).toBe('0.5')
    expect(fmt(1.0)).toBe('1')
    expect(fmt(2000)).toBe('2,000')
  })
})

describe('directions', () => {
  it("writes Joshua's as-needed example with a calculated maximum", () => {
    const m = med({
      drug: 'Hydroxyzine',
      sv: '25',
      qty: '2',
      freq: 'twice-daily',
      prn: true,
      indication: 'anxiety',
    })
    expect(sigText(m)).toBe(
      'Take two tablets (50 mg) by mouth up to twice daily as needed for anxiety. Do not take more than four tablets (100 mg) in 24 hours.',
    )
  })

  it('writes a scheduled dose with no maximum', () => {
    expect(sigText(med({ sv: '50', indication: 'depression' }))).toBe('Take one tablet (50 mg) by mouth once daily for depression.')
  })

  it('uses a hand-set maximum over the calculated one', () => {
    const m = med({
      sv: '200',
      qty: '2',
      freq: 'q6h',
      prn: true,
      indication: 'pain',
      maxOverride: '6',
    })
    expect(maxInfo(m)).toMatchObject({ q: 6, auto: false, dose: '1,200 mg' })
    expect(sigText(m)).toContain('Do not take more than six tablets (1,200 mg) in 24 hours.')
  })

  it('writes creams as a thin layer with no count or maximum', () => {
    const m = applyFormDefaults(
      med({
        form: 'cream',
        sv: '1',
        freq: 'twice-daily',
        prn: true,
        indication: 'itching',
      }),
    )
    expect(m.su).toBe('%')
    expect(sigText(m)).toBe('Apply a thin layer to the affected area up to twice daily as needed for itching.')
  })

  it('instills eye drops and inhales puffs', () => {
    const drops = applyFormDefaults(med({ form: 'eye-drops' }))
    expect(sigText({ ...drops, qty: '1', indication: 'glaucoma', freq: 'bedtime' })).toBe('Instill one drop into both eyes at bedtime for glaucoma.')
    const inhaler = applyFormDefaults(med({ form: 'mdi', sv: '90', su: 'mcg' }))
    expect(
      sigText({
        ...inhaler,
        qty: '2',
        freq: 'q4h',
        prn: true,
        indication: 'wheezing',
      }),
    ).toBe('Inhale two puffs (180 mcg) by mouth every 4 hours as needed for wheezing. Do not use more than twelve puffs (1,080 mcg) in 24 hours.')
  })

  it('calculates liquid doses from a per-5-mL strength, in numerals', () => {
    const m = applyFormDefaults(
      med({
        form: 'liquid',
        sv: '400',
        indication: 'ear infection',
        freq: 'twice-daily',
      }),
    )
    expect(sigText({ ...m, qty: '5', dur: 'days', durN: '10' })).toBe('Take 5 mL (400 mg) by mouth twice daily for 10 days for ear infection.')
  })

  it('spells out units and skips the parenthetical when the dose is already in units', () => {
    const m = med({
      form: 'injection',
      verb: 'Inject',
      unit: 'unit',
      qty: '18',
      route: 'under the skin',
      freq: 'bedtime',
      sv: '100',
      su: 'units',
      sper: 'mL',
    })
    expect(sigText(m)).toBe('Inject 18 units under the skin at bedtime.')
  })

  it('handles ranges and marks a missing quantity', () => {
    expect(
      sigText(
        med({
          sv: '5',
          qty: '1',
          range: true,
          qtyMax: '2',
          freq: 'q6h',
          prn: true,
          indication: 'nausea',
        }),
      ),
    ).toBe('Take one to two tablets (5 to 10 mg) by mouth every 6 hours as needed for nausea. Do not take more than eight tablets (40 mg) in 24 hours.')
    expect(sigText(med({ qty: '' }))).toBe('Take [how many] by mouth once daily.')
  })

  it('never uses abbreviations from the ISMP do-not-use list', () => {
    for (const m of exampleState().meds) {
      const t = sigText(m)
      expect(t).not.toMatch(/\b(QD|QOD|q\.?d\.?|IU|U|MS|MSO4|MgSO4|cc|SC|SQ|HS|TIW|D\/C|AD|AS|AU|OD|OS|OU)\b/)
      expect(t).not.toMatch(/\d\.0\b/)
      expect(t).not.toMatch(/(^|[^\d])\.\d/)
    }
  })
})

describe('table columns', () => {
  it('splits a medication into one value per column', () => {
    const c = medColumns(
      med({
        drug: 'Hydroxyzine',
        sv: '25',
        qty: '2',
        freq: 'twice-daily',
        prn: true,
        indication: 'anxiety',
      }),
    )
    expect(c).toMatchObject({
      strength: '25 mg',
      form: 'Tablet',
      dose: 'Two tablets (50 mg)',
      route: 'By mouth',
      freq: 'Up to twice daily, as needed',
      dur: 'Ongoing',
      reason: 'Anxiety',
    })
  })
})

describe('review flags', () => {
  it('flags a severe allergy and a drug that is also an allergy', () => {
    const s = exampleState()
    s.meds.push(
      med({
        drug: 'penicillin V potassium',
        sv: '500',
        indication: 'strep throat',
      }),
    )
    const text = reviewFlags(s).map(f => f.text)
    expect(text).toContain('Severe reaction on file: penicillin (hives).')
    expect(text.some(t => t.startsWith('penicillin V potassium is on the medication list and also listed as an allergy'))).toBe(true)
  })
})

describe('substance math', () => {
  it('totals caffeine, pack-years and AUDIT-C', () => {
    const s = exampleState().subs
    expect(caffeineMgPerDay(s)).toBe(224)
    expect(packYears(s)).toBe(4)
    expect(auditCScore(s)).toBe(3)
  })
})

describe('CSV', () => {
  it('round-trips the example list', () => {
    const before = exampleState()
    const { state: after, skipped } = fromCsv(toCsv(before))
    expect(skipped).toBe(0)
    expect(after.meds.map(sigText)).toEqual(before.meds.map(sigText))
    expect(after.allergies.map(a => [a.substance, a.reaction, a.severity])).toEqual(before.allergies.map(a => [a.substance, a.reaction, a.severity]))
    expect(after.subs.alcohol.audit).toEqual(before.subs.alcohol.audit)
    expect(caffeineMgPerDay(after.subs)).toBe(224)
  })

  it('quotes commas and neutralizes spreadsheet formulas', () => {
    expect(csvCell('a, b')).toBe('"a, b"')
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(parseCsv('a,"b ""c"", d"\r\n\r\n1,2\n')).toEqual([
      ['a', 'b "c", d'],
      ['1', '2'],
    ])
  })

  it('rejects a file this tool did not write', () => {
    expect(() => fromCsv('rank,drug\n1,metformin\n')).toThrow(/record_type/)
  })
})
