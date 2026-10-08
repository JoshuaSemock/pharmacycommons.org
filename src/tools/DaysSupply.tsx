import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageTitle } from '@/pages/PageShell'
import { FORMS, FREQS, STRENGTH_UNITS, applyFormDefaults, formDef, isFormId, newMedication, type Medication, type StrengthPer, type StrengthUnit } from '@/tools/medrec/model'
import { fmt, maxInfo, num, sigSegments, sigText, unitOf } from '@/tools/medrec/sig'
import NameSearch from '@/tools/medrec/NameSearch'
import { ChipRadio, Field, SectionHeading, SigText, inputClass, numberClass, quietButton, secondaryButton, selectClass } from '@/tools/medrec/ui'
import PaperSelect from '@/components/PaperSelect'
import PaperDatePicker from '@/components/PaperDatePicker'
import {
  INSULIN_DEFAULTS,
  SUPPORTED_GROUPS,
  basisOf,
  buildPlan,
  daysForQuantity,
  dispenseNounFor,
  newPack,
  quantityForDays,
  type Basis,
  type Container,
  type Pack,
} from '@/tools/dayssupply/calc'
import Results, { type Column } from '@/tools/dayssupply/Results'

/**
 * /tools/days-supply
 *
 * Quantity from directions and a number of days, or days supply from a
 * quantity, with package size, priming, drops per mL and in-use limits
 * counted in. Design and decisions: docs/days-supply.md.
 *
 * Directions are entered with the same vocabularies and sentence engine as
 * the medication reconciliation builder (medrec/model.ts, medrec/sig.ts), so
 * the wording rules are shared. The calculation lives in dayssupply/calc.ts
 * (tested in dayssupply.test.ts); this page only renders it.
 *
 *   ┌──────────────────────────────────────┬────────────────────────────┐
 *   │ Directions (live sentence)           │ Result (sticky on wide     │
 *   │ Package                              │ screens; manufacturer and  │
 *   │ Days or quantity · fill date         │ payer side by side)        │
 *   └──────────────────────────────────────┴────────────────────────────┘
 *
 * Nothing is saved or sent anywhere; the calculation runs in the browser.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const TITLE = 'Days supply and quantity'

type Mode = 'quantity' | 'days'
const PRESETS = ['28', '30', '34', '60', '84', '90', '100'] as const

type Example = { id: string; label: string; med: Partial<Medication>; pack: Partial<Pack>; mode: Mode; target: string; quantity: string }

/** Worked examples. Package values are typical, not a specific product's; the note under the buttons says so. */
const EXAMPLES: Example[] = [
  {
    id: 'inhaler',
    label: 'Rescue inhaler',
    med: { drug: 'albuterol', sv: '90', su: 'mcg', form: 'mdi', qty: '2', freq: 'q4h', prn: true, indication: 'wheezing or shortness of breath' },
    pack: { actuations: '200', prime: '4' },
    mode: 'days',
    target: '30',
    quantity: '1',
  },
  {
    id: 'drops',
    label: 'Eye drops, payer count',
    med: { drug: '', form: 'eye-drops', qty: '1', freq: 'twice-daily', route: 'into both eyes' },
    pack: { mL: '30', dropsPerMl: '20', dropsPerMlPayer: '16' },
    mode: 'days',
    target: '90',
    quantity: '1',
  },
  {
    id: 'insulin',
    label: 'Insulin pen',
    med: { drug: 'insulin glargine', sv: '100', su: 'units', sper: 'mL', form: 'injection', unit: 'unit', qty: '20', freq: 'bedtime', route: 'under the skin' },
    pack: { container: 'pen', unitsPer: '300', primeUnits: '2', perBox: '5', wholeBox: true, inUseDays: '28' },
    mode: 'quantity',
    target: '30',
    quantity: '5',
  },
  {
    id: 'glp1',
    label: 'Weekly GLP-1 pen',
    med: { drug: 'semaglutide', form: 'injection', unit: 'mg', qty: '0.5', freq: 'weekly', route: 'under the skin', indication: 'type 2 diabetes' },
    pack: { container: 'pen', dosesPer: '4', perBox: '1' },
    mode: 'days',
    target: '28',
    quantity: '1',
  },
]

function startMed(): Medication {
  return { ...newMedication(), drug: '', qty: '1', freq: 'once-daily' }
}

function Group({ title, children, hint }: { title: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <fieldset className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t border-dashed border-ink/15 pt-4">
      <legend className="float-left mb-1 w-full font-sans text-[12.5px] font-medium text-ink">{title}</legend>
      {hint && <p className="font-sans text-[13px] leading-snug text-ink">{hint}</p>}
      {children}
    </fieldset>
  )
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 font-sans text-[13.5px] text-ink">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-1 accent-mint-700" />
      <span>{children}</span>
    </label>
  )
}

function NumberInput({ value, onChange, label, step = 'any', placeholder }: { value: string; onChange: (v: string) => void; label?: string; step?: string; placeholder?: string }) {
  return (
    <input
      aria-label={label}
      type="number"
      inputMode="decimal"
      min="0"
      step={step}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={numberClass}
    />
  )
}

const BASIS_NOTE: Record<Basis, string> = {
  count: 'Counted in whole tablets, capsules or pieces.',
  liquid: 'Counted in mL.',
  drops: 'Counted in drops. Drops per mL differ by product and by payer; enter the payer’s figure to see both results.',
  spray: 'Counted in sprays. “Each nostril” doubles the sprays per dose.',
  inhaler: 'Counted in puffs, after priming. As-needed use is counted at the most the directions allow.',
  insulin: 'Counted in units, with pen priming added to every injection.',
  injection: 'Counted in doses. A pen labeled for four doses gives four doses, whatever drug is left in it.',
}

export default function DaysSupply() {
  const [m, setM] = useState<Medication>(startMed)
  const [pack, setPack] = useState<Pack>(newPack)
  const [mode, setMode] = useState<Mode>('quantity')
  const [target, setTarget] = useState('30')
  const [quantity, setQuantity] = useState('1')
  const [fill, setFill] = useState('')
  const [threshold, setThreshold] = useState('75')
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    document.title = `${TITLE} · Pharmacy Commons`
    window.scrollTo(0, 0)
  }, [])

  const patch = (p: Partial<Medication>) => setM(x => ({ ...x, ...p }))
  const patchPack = (p: Partial<Pack>) => setPack(x => ({ ...x, ...p }))

  const changeForm = (form: Medication['form']) => setM(x => applyFormDefaults({ ...x, form, instr: [] }))

  const loadExample = (e: Example) => {
    const base = e.med.form ? applyFormDefaults({ ...startMed(), form: e.med.form }) : startMed()
    setM({ ...base, ...e.med, instr: [] })
    setPack({ ...newPack(), ...e.pack })
    setMode(e.mode)
    setTarget(e.target)
    setQuantity(e.quantity)
    setNotice(null)
  }

  const setContainer = (c: Container) =>
    patchPack(basis === 'insulin' ? { container: c, ...INSULIN_DEFAULTS[c], wholeBox: c === 'pen' } : { container: c })

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => setNotice('Copied.'),
      () => setNotice('This browser blocked copying. Select the line and copy it instead.'),
    )
  }

  // ── Calculation ────────────────────────────────────────────────────────────
  const f = formDef(m.form)
  const unit = unitOf(m)
  const basis = basisOf(m)
  const dn = dispenseNounFor(m, pack)
  const targetN = num(target)
  const qtyN = num(quantity)
  const mx = maxInfo(m)

  const compare = basis === 'drops' && num(pack.dropsPerMlPayer) != null && pack.dropsPerMlPayer !== pack.dropsPerMl
  const variants: { label: string | null; dpm?: string }[] = compare
    ? [
        { label: `Manufacturer: ${fmt(num(pack.dropsPerMl) ?? 0)} drops per mL`, dpm: pack.dropsPerMl },
        { label: `Payer: ${fmt(num(pack.dropsPerMlPayer) ?? 0)} drops per mL`, dpm: pack.dropsPerMlPayer },
      ]
    : [{ label: null }]

  let missing: string[] = []
  const columns: Column[] = []
  for (const v of variants) {
    const pr = buildPlan(m, pack, v.dpm)
    if (!pr.ok) {
      missing = pr.missing
      break
    }
    if (mode === 'quantity') {
      if (!targetN) {
        missing = ['the number of days']
        break
      }
      columns.push({ label: v.label, plan: pr.plan, result: quantityForDays(pr.plan, targetN) })
    } else {
      if (!qtyN) {
        missing = [`how many ${dn.pl}`]
        break
      }
      columns.push({ label: v.label, plan: pr.plan, result: daysForQuantity(pr.plan, qtyN) })
    }
  }
  const thresholdN = num(threshold)

  const perOptions: [StrengthPer, string][] = [
    ['each', unit ? `per ${unit.sg}` : 'per dose'],
    ['mL', 'per mL'],
    ['5 mL', 'per 5 mL'],
    ['none', 'no amount (total only)'],
  ]
  const step = unit?.kind === 'count' ? '0.5' : 'any'

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <header className="grid gap-5 pt-10 pb-8 sm:pt-14">
        <div>
          <Link to="/tools" className="lp-press mb-4 inline-block rounded-md px-2.5 py-1 font-sans text-[13px] text-ink">
            All tools
          </Link>
          <PageTitle
            title={TITLE}
            lede="How much to dispense for a number of days, or how many days a quantity lasts. Package size, priming, drops per mL and in-use limits are counted in, and every step is shown."
          />
        </div>
        <div className="grid gap-2">
          <p className="font-sans text-[13px] font-medium text-ink">Try an example</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map(e => (
              <button key={e.id} type="button" className={secondaryButton} onClick={() => loadExample(e)}>
                {e.label}
              </button>
            ))}
          </div>
          <p className="font-sans text-[12.5px] text-ink">Example package values are typical, not a specific product’s. Check the package you are dispensing.</p>
        </div>
      </header>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-10 border-t border-ink/15 pt-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
        {/* ── Inputs ─────────────────────────────────────────────────────── */}
        <div className="grid min-w-0 content-start gap-6">
          <SectionHeading id="directions" title="Directions" lede="Built the same way as in medication reconciliation: the form decides which actions, units and routes are offered." />

          <div aria-live="polite" className="lp-sunken grid gap-1.5 rounded-md px-4 py-3">
            <span className="font-sans text-[12.5px] font-medium text-ink">Directions as written</span>
            <p className="[overflow-wrap:anywhere] font-display text-[19px] leading-snug text-ink" style={{ fontFamily: 'var(--font-display)' }}>
              <SigText segments={sigSegments(m)} />
            </p>
            <div>
              <button type="button" className={quietButton} onClick={() => copy(sigText(m))}>
                Copy directions
              </button>
            </div>
          </div>

          <Group title="What it is">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid min-w-0 content-start gap-1">
                <label htmlFor="ds-drug" className="font-sans text-[12.5px] font-medium text-ink">
                  Name (optional)
                </label>
                <NameSearch id="ds-drug" value={m.drug} pcid={m.pcid} placeholder="Search by generic or brand name" onChange={(drug, pcid) => patch({ drug, pcid })} />
              </div>
              <Field label="Form" hint={basis ? BASIS_NOTE[basis] : undefined}>
                <PaperSelect value={m.form} onChange={v => isFormId(v) && changeForm(v)} className={selectClass}>
                  {SUPPORTED_GROUPS.map(([group, ids]) => (
                    <optgroup key={group} label={group}>
                      {ids.map(id => (
                        <option key={id} value={id}>
                          {FORMS[id].label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </PaperSelect>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Strength (optional)">
                <NumberInput value={m.sv} onChange={sv => patch({ sv })} />
              </Field>
              <Field label="Strength unit">
                <PaperSelect value={m.su} onChange={v => patch({ su: v as StrengthUnit })} className={selectClass}>
                  {STRENGTH_UNITS.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </PaperSelect>
              </Field>
              <Field label="Per" className="col-span-2 sm:col-span-1">
                <PaperSelect value={m.sper} onChange={v => patch({ sper: v as StrengthPer })} className={selectClass}>
                  {perOptions.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </PaperSelect>
              </Field>
            </div>
          </Group>

          <Group title="How it is used">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Action">
                <PaperSelect value={m.verb} onChange={v => patch({ verb: v })} className={selectClass}>
                  {f.verbs.map(v => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </PaperSelect>
              </Field>
              <div className="grid min-w-0 content-start gap-1">
                <span className="font-sans text-[12.5px] font-medium text-ink">How many</span>
                <div className="flex min-w-0 items-center gap-2">
                  <NumberInput label="Quantity per dose" value={m.qty} step={step} onChange={qty => patch({ qty })} />
                  {m.range && (
                    <>
                      <span className="shrink-0 font-sans text-[13px] text-ink">to</span>
                      <NumberInput label="Upper quantity per dose" value={m.qtyMax} step={step} onChange={qtyMax => patch({ qtyMax })} />
                    </>
                  )}
                </div>
                <Check checked={m.range} onChange={range => patch({ range })}>
                  A range, such as one to two
                </Check>
              </div>
              {f.units && (
                <Field label="Unit" hint={basis === 'insulin' ? 'Units: counted as insulin.' : basis === 'injection' ? 'Counted as one dose per injection.' : undefined}>
                  {f.units.length > 1 ? (
                    <PaperSelect value={m.unit} onChange={v => patch({ unit: v })} className={selectClass}>
                      {f.units.map(x => (
                        <option key={x.sg} value={x.sg}>
                          {x.pl}
                        </option>
                      ))}
                    </PaperSelect>
                  ) : (
                    <input value={f.units[0].pl} disabled className={inputClass} />
                  )}
                </Field>
              )}
              <Field label="Route">
                <PaperSelect value={m.route} onChange={v => patch({ route: v })} className={selectClass}>
                  {f.routes.map(r => (
                    <option key={r} value={r}>
                      {r || 'No route needed'}
                    </option>
                  ))}
                </PaperSelect>
              </Field>
              <Field label="How often">
                <PaperSelect value={m.freq} onChange={v => patch({ freq: v })} className={selectClass}>
                  {FREQS.map(x => (
                    <option key={x.id} value={x.id}>
                      {x.text}
                    </option>
                  ))}
                </PaperSelect>
              </Field>
              <div className="grid min-w-0 content-start gap-1">
                <span className="font-sans text-[12.5px] font-medium text-ink">Scheduled or as needed</span>
                <ChipRadio
                  name="ds-prn"
                  label="Scheduled or as needed"
                  value={m.prn ? 'yes' : 'no'}
                  options={[
                    ['no', 'Scheduled'],
                    ['yes', 'As needed'],
                  ]}
                  onChange={v => patch({ prn: v === 'yes', showMax: null, maxOverride: '' })}
                />
              </div>
              <Field label={m.prn ? 'As needed for (optional)' : 'Reason for use (optional)'}>
                <input value={m.indication} onChange={e => patch({ indication: e.target.value })} className={inputClass} />
              </Field>
              {m.prn && unit && (
                <Field
                  label={`Most ${unit.pl} in 24 hours`}
                  hint={mx?.auto ? `Calculated as ${fmt(mx.q)} from the directions. Type a lower number if the label or prescriber sets one.` : 'Set by hand.'}
                >
                  <NumberInput value={m.maxOverride} step={step} placeholder={mx?.auto ? fmt(mx.q) : ''} onChange={maxOverride => patch({ maxOverride })} />
                </Field>
              )}
            </div>
          </Group>

          <SectionHeading id="package" title="Package" />
          <PackageFields basis={basis} pack={pack} patchPack={patchPack} setContainer={setContainer} unitPl={unit?.pl ?? 'units'} />

          <SectionHeading id="calculate" title="Days or quantity" />
          <div className="grid gap-4">
            <ChipRadio
              name="ds-mode"
              label="What to work out"
              value={mode}
              options={[
                ['quantity', 'Quantity for a number of days'],
                ['days', 'Days supply for a quantity'],
              ]}
              onChange={setMode}
            />
            {mode === 'quantity' ? (
              <div className="grid gap-2">
                <span className="font-sans text-[12.5px] font-medium text-ink">Number of days</span>
                <ChipRadio name="ds-days" label="Number of days" value={(PRESETS as readonly string[]).includes(target) ? target : ''} options={PRESETS.map(p => [p, p] as const)} onChange={setTarget} />
                <div className="max-w-[10rem]">
                  <NumberInput label="Number of days" value={target} step="1" onChange={setTarget} />
                </div>
              </div>
            ) : (
              <Field label={`How many ${dn.pl}`}>
                <div className="max-w-[10rem]">
                  <NumberInput label={`How many ${dn.pl}`} value={quantity} step={basis === 'count' || basis === 'liquid' ? 'any' : '1'} onChange={setQuantity} />
                </div>
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fill date (optional)" hint="For the earliest refill date.">
                <PaperDatePicker value={fill} onChange={setFill} placeholder="No fill date" className={selectClass} />
              </Field>
              <Field label="Refill allowed at (% of days supply)" hint="Payers and controlled-substance rules differ. Set the one that applies.">
                <NumberInput value={threshold} step="1" onChange={setThreshold} />
              </Field>
            </div>
          </div>
        </div>

        {/* ── Result ─────────────────────────────────────────────────────── */}
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <section aria-labelledby="result" aria-live="polite" className="grid min-w-0 gap-4">
            <SectionHeading id="result" title="Result" />
            {columns.length ? (
              <Results columns={columns} fill={fill} threshold={thresholdN} onCopy={copy} />
            ) : (
              <p className="lp-sunken rounded-md bg-marigold-100 px-3.5 py-2.5 font-sans text-[14px] text-ink">
                Still needed: {missing.join(', ')}.
              </p>
            )}
            {notice && <p className="font-sans text-[13px] text-ink">{notice}</p>}
          </section>
        </div>
      </div>

      <p className="mt-12 max-w-[48rem] font-sans text-[12.5px] leading-relaxed text-ink">
        Nothing entered here is saved or sent anywhere. This tool does arithmetic on what you enter; it does not know a specific product’s package, a payer’s rules,
        or a state’s limits. Check the package and the plan before you dispense. Design notes are in the project’s{' '}
        <a
          href="https://github.com/JoshuaSemock/pharmacycommons.org/blob/main/docs/days-supply.md"
          className="text-ink underline decoration-mint-300 underline-offset-2 hover:decoration-mint-600"
        >
          days supply document
        </a>
        .
      </p>
    </main>
  )
}

function PackageFields({
  basis,
  pack: p,
  patchPack,
  setContainer,
  unitPl,
}: {
  basis: Basis | null
  pack: Pack
  patchPack: (p: Partial<Pack>) => void
  setContainer: (c: Container) => void
  unitPl: string
}) {
  const limit = (what: string) => (
    <Field label={`Use within (days after ${what})`} hint="Optional. When this ends a container before it is used up, it sets the days supply.">
      <NumberInput value={p.inUseDays} step="1" onChange={inUseDays => patchPack({ inUseDays })} placeholder="No limit" />
    </Field>
  )
  const penOrVial = (
    <ChipRadio
      name="ds-container"
      label="Pen or vial"
      value={p.container}
      options={[
        ['pen', 'Pen'],
        ['vial', 'Vial'],
      ]}
      onChange={setContainer}
    />
  )
  const box = (label: string) => (
    <>
      <Field label={label}>
        <NumberInput value={p.perBox} step="1" onChange={perBox => patchPack({ perBox })} />
      </Field>
      <Check checked={p.wholeBox} onChange={wholeBox => patchPack({ wholeBox })}>
        Dispense whole boxes only
      </Check>
    </>
  )

  switch (basis) {
    case 'count':
    case 'liquid':
      return (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={basis === 'liquid' ? 'Bottle size in mL (optional)' : `${unitPl[0].toUpperCase()}${unitPl.slice(1)} per package (optional)`}>
              <NumberInput value={p.size} onChange={size => patchPack({ size })} />
            </Field>
          </div>
          <Check checked={p.wholePack} onChange={wholePack => patchPack({ wholePack })}>
            {basis === 'liquid' ? 'Dispense whole bottles only' : 'Dispense whole packages only (for example, 28-day packs)'}
          </Check>
        </div>
      )
    case 'drops':
      return (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Bottle size in mL">
              <NumberInput value={p.mL} onChange={mL => patchPack({ mL })} />
            </Field>
            <Field label="Drops per mL" hint="Manufacturer, or 20 as a general default.">
              <NumberInput value={p.dropsPerMl} onChange={dropsPerMl => patchPack({ dropsPerMl })} />
            </Field>
            <Field label="Drops per mL, payer (optional)" hint="Fill in to see both results side by side.">
              <NumberInput value={p.dropsPerMlPayer} onChange={dropsPerMlPayer => patchPack({ dropsPerMlPayer })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">{limit('opening')}</div>
        </div>
      )
    case 'spray':
    case 'inhaler':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={basis === 'spray' ? 'Sprays per bottle' : 'Puffs per inhaler'} hint="From the package label.">
            <NumberInput value={p.actuations} step="1" onChange={actuations => patchPack({ actuations })} />
          </Field>
          <Field label="Spent priming before first use" hint="From the label. Priming again after the device sits unused is not counted.">
            <NumberInput value={p.prime} step="1" onChange={prime => patchPack({ prime })} placeholder="0" />
          </Field>
        </div>
      )
    case 'insulin':
      return (
        <div className="grid gap-3">
          {penOrVial}
          <p className="font-sans text-[12.5px] text-ink">Starting values are typical for U-100 insulin. Change them to match the product.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Units per ${p.container}`}>
              <NumberInput value={p.unitsPer} step="1" onChange={unitsPer => patchPack({ unitsPer })} />
            </Field>
            {p.container === 'pen' && (
              <Field label="Units to prime before each injection">
                <NumberInput value={p.primeUnits} step="1" onChange={primeUnits => patchPack({ primeUnits })} />
              </Field>
            )}
            {limit('first use')}
            <div className="grid content-start gap-2">{box(`${p.container === 'pen' ? 'Pens' : 'Vials'} per box`)}</div>
          </div>
        </div>
      )
    case 'injection':
      return (
        <div className="grid gap-3">
          {penOrVial}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Doses per ${p.container}, as labeled`} hint="1 for single-dose pens and syringes.">
              <NumberInput value={p.dosesPer} step="1" onChange={dosesPer => patchPack({ dosesPer })} />
            </Field>
            {limit('first use')}
            <div className="grid content-start gap-2">{box(`${p.container === 'pen' ? 'Pens' : 'Vials'} per box`)}</div>
          </div>
        </div>
      )
    default:
      return <p className="font-sans text-[14px] text-ink">Choose a form above.</p>
  }
}
