/**
 * Days supply and quantity — step schedules card (tapers, alternating doses,
 * dose step-ups). The arithmetic is in schedule.ts; this only renders it.
 * Design: docs/days-supply.md, "Step schedules".
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState, type ReactNode } from 'react'
import PaperSelect from '@/components/PaperSelect'
import { fmt } from '@/tools/medrec/sig'
import { ChipRadio, Field, RemoveIcon, SectionHeading, numberClass, quietButton, secondaryButton, selectClass } from '@/tools/medrec/ui'
import { WEEKDAYS, newSchedule, newStep, planSchedule, type Schedule, type Step, type StepKind } from './schedule'

const UNITS: [string, string, string][] = [
  ['tablet', 'tablets', 'Tablets'],
  ['capsule', 'capsules', 'Capsules'],
  ['mL', 'mL', 'mL of liquid'],
  ['dose', 'doses', 'Doses (pens, syringes)'],
  ['puff', 'puffs', 'Puffs'],
  ['drop', 'drops', 'Drops'],
  ['unit', 'units', 'Units'],
]
const PACKS: [string, string][] = [
  ['bottle', 'bottles'],
  ['package', 'packages'],
  ['pen', 'pens'],
  ['vial', 'vials'],
  ['box', 'boxes'],
  ['inhaler', 'inhalers'],
]
const EVERY: [string, string][] = [
  ['1', 'Every day'],
  ['2', 'Every other day'],
  ['7', 'Once a week'],
  ['14', 'Every 2 weeks'],
  ['28', 'Every 4 weeks'],
]

type Example = { id: string; label: string; make: () => Schedule }

const EXAMPLES: Example[] = [
  {
    id: 'taper',
    label: 'Prednisone taper',
    make: () =>
      newSchedule({
        unitSg: 'tablet',
        unitPl: 'tablets',
        capacity: '30',
        steps: [
          newStep({ days: '3', amount: '4' }),
          newStep({ days: '3', amount: '3' }),
          newStep({ days: '3', amount: '2' }),
          newStep({ days: '3', amount: '1' }),
        ],
      }),
  },
  {
    id: 'weekday',
    label: 'Warfarin by weekday',
    make: () =>
      newSchedule({
        unitSg: 'tablet',
        unitPl: 'tablets',
        startDow: 1,
        steps: [newStep({ kind: 'weekday', days: '30', week: ['2.5', '5', '2.5', '5', '2.5', '5', '2.5'] })],
      }),
  },
  {
    id: 'stepup',
    label: 'Weekly GLP-1 step-up',
    make: () =>
      newSchedule({
        unitSg: 'dose',
        unitPl: 'doses',
        packSg: 'pen',
        packPl: 'pens',
        capacity: '4',
        separate: true,
        steps: [
          newStep({ days: '28', amount: '1', every: '7' }),
          newStep({ days: '28', amount: '1', every: '7' }),
          newStep({ days: '28', amount: '1', every: '7' }),
        ],
      }),
  },
]

function NumberInput({ value, onChange, label, step = 'any', placeholder }: { value: string; onChange: (v: string) => void; label: string; step?: string; placeholder?: string }) {
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

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 font-sans text-[13.5px] text-ink">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-1 accent-foil" />
      <span>{children}</span>
    </label>
  )
}

export default function ScheduleCard({ onCopy }: { onCopy: (text: string) => void }) {
  const [s, setS] = useState<Schedule>(() => EXAMPLES[0].make())

  const patch = (p: Partial<Schedule>) => setS(x => ({ ...x, ...p }))
  const patchStep = (id: string, p: Partial<Step>) => setS(x => ({ ...x, steps: x.steps.map(st => (st.id === id ? { ...st, ...p } : st)) }))
  const addStep = () => setS(x => ({ ...x, steps: [...x.steps, newStep({ kind: x.steps[x.steps.length - 1]?.kind ?? 'daily' })] }))
  const removeStep = (id: string) => setS(x => ({ ...x, steps: x.steps.length > 1 ? x.steps.filter(st => st.id !== id) : x.steps }))

  const r = planSchedule(s)
  const hasWeekday = s.steps.some(st => st.kind === 'weekday')

  return (
    <section aria-labelledby="schedule" className="lp-raised grid min-w-0 gap-6 rounded-lg p-4 sm:p-6">
      <SectionHeading
        id="schedule"
        title="Taper or step-up schedule"
        lede="For directions that change over time: a taper, doses that differ by weekday, or a pen strength that steps up. Each step is worked out, then they are added together."
      />
      <div className="grid gap-2">
        <p className="font-sans text-[13px] text-ink">Try an example</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map(e => (
            <button key={e.id} type="button" className={secondaryButton} onClick={() => setS(e.make())}>
              {e.label}
            </button>
          ))}
        </div>
        <p className="font-sans text-[12.5px] text-ink">Examples show how the steps are entered. They are not dosing recommendations.</p>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
        <div className="grid min-w-0 content-start gap-6">
          <fieldset className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t border-dashed border-ink/15 pt-4">
            <legend className="float-left mb-1 w-full font-sans text-[15px] text-ink">What is counted</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Counted in">
                <PaperSelect
                  value={s.unitSg}
                  onChange={v => {
                    const u = UNITS.find(x => x[0] === v)
                    if (u) patch({ unitSg: u[0], unitPl: u[1] })
                  }}
                  className={selectClass}
                >
                  {UNITS.map(([sg, , label]) => (
                    <option key={sg} value={sg}>
                      {label}
                    </option>
                  ))}
                </PaperSelect>
              </Field>
              <Field label="Package (optional)" hint="Leave the size blank to count loose tablets, capsules or doses.">
                <PaperSelect
                  value={s.packSg}
                  onChange={v => {
                    const p = PACKS.find(x => x[0] === v)
                    if (p) patch({ packSg: p[0], packPl: p[1] })
                  }}
                  className={selectClass}
                >
                  {PACKS.map(([sg]) => (
                    <option key={sg} value={sg}>
                      {sg[0].toUpperCase() + sg.slice(1)}
                    </option>
                  ))}
                </PaperSelect>
              </Field>
              <Field label={`${s.unitPl[0].toUpperCase()}${s.unitPl.slice(1)} per ${s.packSg}`}>
                <NumberInput label={`${s.unitPl} per ${s.packSg}`} value={s.capacity} step="1" onChange={capacity => patch({ capacity })} />
              </Field>
              <Field label={`Use within (days after opening)`} hint="Optional. A pen or bottle that must be thrown away after this many days is counted in whole packages. Leave blank for no limit.">
                <NumberInput label="Use within days" value={s.inUseDays} step="1" placeholder="No limit" onChange={inUseDays => patch({ inUseDays })} />
              </Field>
              {hasWeekday && (
                <Field label="First step starts on">
                  <PaperSelect value={String(s.startDow)} onChange={v => patch({ startDow: Number(v) })} className={selectClass}>
                    {WEEKDAYS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </PaperSelect>
                </Field>
              )}
            </div>
            <Check checked={s.separate} onChange={separate => patch({ separate })}>
              Each step is a different product (for example, a separate pen for each strength). Every step is rounded up to whole {s.packPl} by itself.
            </Check>
          </fieldset>

          <div className="grid min-w-0 gap-4">
            {s.steps.map((st, i) => (
              <fieldset key={st.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t border-dashed border-ink/15 pt-4">
                <legend className="float-left mb-1 flex w-full items-center justify-between gap-2 font-sans text-[15px] text-ink">
                  <span>Step {i + 1}</span>
                  {s.steps.length > 1 && (
                    <button type="button" className={quietButton} onClick={() => removeStep(st.id)} aria-label={`Remove step ${i + 1}`}>
                      <RemoveIcon />
                      Remove
                    </button>
                  )}
                </legend>
                <ChipRadio<StepKind>
                  name={`sch-kind-${st.id}`}
                  label={`How step ${i + 1} is given`}
                  value={st.kind}
                  options={[
                    ['daily', 'Same amount each time'],
                    ['weekday', 'Different on each weekday'],
                  ]}
                  onChange={kind => patchStep(st.id, { kind })}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Lasts (days)">
                    <NumberInput label={`Days in step ${i + 1}`} value={st.days} step="1" onChange={days => patchStep(st.id, { days })} />
                  </Field>
                  {st.kind === 'daily' && (
                    <>
                      <Field label={`Amount per dose (${s.unitPl})`}>
                        <NumberInput label={`Amount per dose in step ${i + 1}`} value={st.amount} onChange={amount => patchStep(st.id, { amount })} />
                      </Field>
                      <Field label="How often">
                        <PaperSelect value={st.every} onChange={every => patchStep(st.id, { every })} className={selectClass}>
                          {EVERY.map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </PaperSelect>
                      </Field>
                      {st.every === '1' && (
                        <Field label="Doses per day">
                          <NumberInput label={`Doses per day in step ${i + 1}`} value={st.perDay} step="1" onChange={perDay => patchStep(st.id, { perDay })} />
                        </Field>
                      )}
                    </>
                  )}
                  {s.separate && (
                    <Field label={`${s.unitPl[0].toUpperCase()}${s.unitPl.slice(1)} per ${s.packSg} (this step)`} hint="Blank uses the size above.">
                      <NumberInput label={`${s.unitPl} per ${s.packSg} in step ${i + 1}`} value={st.capacity} step="1" onChange={capacity => patchStep(st.id, { capacity })} />
                    </Field>
                  )}
                  {s.separate && (
                    <Field label="Use within (days, this step)" hint="Blank uses the limit above.">
                      <NumberInput label={`Use within days in step ${i + 1}`} value={st.inUseDays} step="1" onChange={inUseDays => patchStep(st.id, { inUseDays })} />
                    </Field>
                  )}
                </div>
                {st.kind === 'weekday' && (
                  <div className="grid gap-1.5">
                    <span className="font-sans text-[12.5px] text-ink">Total {s.unitPl} on each day</span>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {WEEKDAYS.map((d, di) => (
                        <label key={d} className="grid min-w-0 gap-0.5">
                          <span className="font-sans text-[12px] text-ink">{d}</span>
                          <input
                            aria-label={`${d}, step ${i + 1}`}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            value={st.week[di]}
                            onChange={e => patchStep(st.id, { week: st.week.map((x, xi) => (xi === di ? e.target.value : x)) })}
                            className={numberClass}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </fieldset>
            ))}
            <div>
              <button type="button" className={secondaryButton} onClick={addStep}>
                Add a step
              </button>
            </div>
          </div>
        </div>

        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <section aria-labelledby="schedule-result" aria-live="polite" className="grid min-w-0 gap-4">
            <h3 id="schedule-result" className="font-sans leading-snug text-ink" style={{ fontSize: '17px' }}>
              Result
            </h3>
            {r.ok ? (
              <div className="lp-sunken grid min-w-0 content-start gap-4 rounded-md p-4 sm:p-5">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <div className="grid min-w-0 content-start gap-0.5">
                    <dt className="font-sans text-[12.5px] text-ink">Dispense</dt>
                    <dd className="[overflow-wrap:anywhere] font-display text-[22px] leading-tight text-ink" style={{ fontFamily: 'var(--font-display)' }}>
                      {r.dispense != null
                        ? `${fmt(r.dispense)} ${r.dispense === 1 ? r.dispenseNoun.sg : r.dispenseNoun.pl}`
                        : `${fmt(Math.ceil(r.totalUnits - 1e-9))} ${Math.ceil(r.totalUnits - 1e-9) === 1 ? s.unitSg : s.unitPl}`}
                    </dd>
                  </div>
                  <div className="grid min-w-0 content-start gap-0.5">
                    <dt className="font-sans text-[12.5px] text-ink">Days supply</dt>
                    <dd className="font-display text-[22px] leading-tight text-ink" style={{ fontFamily: 'var(--font-display)' }}>
                      {fmt(r.totalDays)} {r.totalDays === 1 ? 'day' : 'days'}
                    </dd>
                  </div>
                  {r.leftover != null && (
                    <div className="grid min-w-0 content-start gap-0.5">
                      <dt className="font-sans text-[12.5px] text-ink">Left over at the end</dt>
                      <dd className="font-display text-[17px] leading-tight text-ink" style={{ fontFamily: 'var(--font-display)' }}>
                        {fmt(Math.round(r.leftover * 100) / 100)} {r.leftover === 1 ? s.unitSg : s.unitPl}
                      </dd>
                    </div>
                  )}
                </dl>
                {r.limitControls && (
                  <p className="border-t border-dashed border-ink/15 pt-3 font-sans text-[13.5px] leading-snug text-ink">
                    The use-within limit sets the quantity. By use alone fewer {s.packPl} would last, but each {s.packSg} may only be used for a set number of days once opened.
                  </p>
                )}
                <ul className="grid gap-1 border-t border-dashed border-ink/15 pt-3 font-sans text-[13.5px] leading-snug text-ink">
                  {r.steps.map(st => (
                    <li key={st.id}>
                      {st.days === 1 ? `Day ${fmt(st.startDay)}` : `Days ${fmt(st.startDay)} to ${fmt(st.startDay + st.days - 1)}`}: {st.text}
                      {st.packs != null ? ` → ${fmt(st.packs)} ${st.packs === 1 ? s.packSg : s.packPl}${st.limitControls ? ' (use-within limit)' : ''}` : ''}
                    </li>
                  ))}
                </ul>
                <div className="grid gap-1.5 border-t border-dashed border-ink/15 pt-3">
                  <h4 className="font-sans text-[12.5px] leading-snug text-ink" style={{ fontSize: '12.5px' }}>
                    How this was worked out
                  </h4>
                  <ol className="grid list-decimal gap-1.5 pl-5 font-mono text-[12.5px] leading-snug text-ink marker:text-ink">
                    {r.work.map((w, i) => (
                      <li key={i} className="[overflow-wrap:anywhere] whitespace-pre-wrap">
                        {w.trimStart()}
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="grid gap-1.5 border-t border-dashed border-ink/15 pt-3">
                  <span className="font-sans text-[12.5px] text-ink">For the label or the claim</span>
                  <p className="[overflow-wrap:anywhere] font-sans text-[14.5px] text-ink">{r.line}</p>
                  <div>
                    <button type="button" className={quietButton} onClick={() => onCopy(r.line)}>
                      Copy this line
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="lp-sunken rounded-md px-3.5 py-2.5 font-sans text-[14px] text-ink">Still needed: {r.missing.join(', ')}.</p>
            )}
          </section>
        </div>
      </div>
    </section>
  )
}
