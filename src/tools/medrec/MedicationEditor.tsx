/**
 * Editor for one medication, with the directions builder. Shown above the
 * medication table while a row is being edited.
 *
 * Every dropdown depends on the form: choosing "Eye drops" offers Instill,
 * drops and eyes; "Cream" offers Apply and a thin layer with no count. That
 * keeps impossible directions ("Take one ointment by mouth") from being
 * written at all. The live preview highlights values that are calculated
 * (the dose in parentheses and the 24-hour maximum), so they always agree
 * with the strength and quantity.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ReactNode } from 'react'
import {
  CATEGORIES,
  DURATIONS,
  FORM_GROUPS,
  FORMS,
  FREQS,
  INSTRUCTIONS,
  STATUSES,
  STATUS,
  STRENGTH_UNITS,
  CATEGORY_LABEL,
  formDef,
  isDurationMode,
  isFormId,
  type Medication,
  type StrengthPer,
  type StrengthUnit,
} from './model'
import { fmt, maxInfo, medTitle, showsMax, sigSegments, sigText, unitOf } from './sig'
import NameSearch from './NameSearch'
import { ChipRadio, Field, SigText, Tag, dangerQuietButton, inputClass, numberClass, primaryButton, quietButton } from './ui'

type Props = {
  med: Medication
  onPatch: (patch: Partial<Medication>) => void
  onFormChange: (form: Medication['form']) => void
  onDone: () => void
  onRemove: () => void
  onCopy: (text: string) => void
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t border-dashed border-mint-200 pt-4">
      <legend className="float-left mb-1 w-full font-sans font-medium text-[12.5px] text-ink">{title}</legend>
      {children}
    </fieldset>
  )
}

export default function MedicationEditor({ med: m, onPatch, onFormChange, onDone, onRemove, onCopy }: Props) {
  const f = formDef(m.form)
  const unit = unitOf(m)
  const mx = maxInfo(m)
  const p = `med-${m.id}`
  const perOptions: [StrengthPer, string][] = [
    ['each', unit ? `per ${unit.sg}` : 'per dose'],
    ['mL', 'per mL'],
    ['5 mL', 'per 5 mL'],
    ['hour', 'per hour'],
    ['none', 'no amount (total only)'],
  ]
  const step = unit?.kind === 'count' ? '0.5' : 'any'

  return (
    <article
      id="med-editor"
      aria-label={`Editing ${m.drug || 'medication'}`}
      className="grid min-w-0 scroll-mt-28 gap-5 rounded-xl border border-hepatica-300 bg-white p-4 shadow-[0_0_0_3px_var(--color-hepatica-100)] sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-sans font-medium text-[12.5px] text-ink">Editing</span>
          <Tag>{CATEGORY_LABEL[m.category]}</Tag>
          <span className="font-display text-[19px] font-semibold text-ink [overflow-wrap:anywhere]" style={{ fontFamily: 'var(--font-display)' }}>
            {medTitle(m)}
          </span>
        </div>
        <Tag tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Tag>
      </div>

      <div aria-live="polite" className="grid gap-1.5 rounded-lg border border-mint-200 bg-mint-50 px-4 py-3">
        <span className="font-sans font-medium text-[12.5px] text-ink">Directions</span>
        <p className="font-display text-[20px] leading-snug text-ink [overflow-wrap:anywhere]" style={{ fontFamily: 'var(--font-display)' }}>
          <SigText segments={sigSegments(m)} />
        </p>
        <p className="font-sans text-[12.5px] text-ink">Highlighted amounts are calculated from the strength and quantity, so they always agree.</p>
      </div>

      <Group title="What it is">
        <ChipRadio name={`${p}-category`} label="Category" value={m.category} options={CATEGORIES} onChange={category => onPatch({ category })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid min-w-0 content-start gap-1">
            <label htmlFor={`${p}-drug`} className="font-sans text-[12.5px] font-medium text-ink">
              Name
            </label>
            <NameSearch
              id={`${p}-drug`}
              value={m.drug}
              pcid={m.pcid}
              placeholder="Search by generic or brand name"
              onChange={(drug, pcid) => onPatch({ drug, pcid })}
            />
          </div>
          <Field label="Form">
            <select value={m.form} onChange={e => isFormId(e.target.value) && onFormChange(e.target.value)} className={inputClass}>
              {FORM_GROUPS.map(([group, ids]) => (
                <optgroup key={group} label={group}>
                  {ids.map(id => (
                    <option key={id} value={id}>
                      {FORMS[id].label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Strength">
            <input type="number" inputMode="decimal" min="0" step="any" value={m.sv} onChange={e => onPatch({ sv: e.target.value })} className={numberClass} />
          </Field>
          <Field label="Strength unit">
            <select value={m.su} onChange={e => onPatch({ su: e.target.value as StrengthUnit })} className={inputClass}>
              {STRENGTH_UNITS.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Per" className="col-span-2 sm:col-span-1">
            <select value={m.sper} onChange={e => onPatch({ sper: e.target.value as StrengthPer })} className={inputClass}>
              {perOptions.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Group>

      <Group title="Directions">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Action">
            <select value={m.verb} onChange={e => onPatch({ verb: e.target.value })} className={inputClass}>
              {f.verbs.map(v => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          {f.thin ? (
            <div className="grid content-start gap-1">
              <span className="font-sans text-[12.5px] font-medium text-ink">Amount</span>
              <p className="py-1.5 font-sans text-[13.5px] text-ink">Written as “{f.thin}”, with no count.</p>
            </div>
          ) : (
            <div className="grid min-w-0 content-start gap-1">
              <span className="font-sans text-[12.5px] font-medium text-ink">How many</span>
              <div className="flex min-w-0 items-center gap-2">
                <input
                  aria-label="Quantity"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step={step}
                  value={m.qty}
                  onChange={e => onPatch({ qty: e.target.value })}
                  className={numberClass}
                />
                {m.range && (
                  <>
                    <span className="shrink-0 font-sans text-[13px] text-ink">to</span>
                    <input
                      aria-label="Upper quantity"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step={step}
                      value={m.qtyMax}
                      onChange={e => onPatch({ qtyMax: e.target.value })}
                      className={numberClass}
                    />
                  </>
                )}
              </div>
              <label className="flex items-center gap-1.5 font-sans text-[12px] text-ink">
                <input type="checkbox" checked={m.range} onChange={e => onPatch({ range: e.target.checked })} className="accent-mint-700" />A range, such as one
                to two
              </label>
            </div>
          )}

          {!f.thin && f.units && (
            <Field label="Unit">
              {f.units.length > 1 ? (
                <select value={m.unit} onChange={e => onPatch({ unit: e.target.value })} className={inputClass}>
                  {f.units.map(x => (
                    <option key={x.sg} value={x.sg}>
                      {x.pl}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={f.units[0].pl} disabled className={inputClass} />
              )}
            </Field>
          )}

          <div className="grid min-w-0 content-start gap-1">
            <Field label="Route">
              <select value={m.route} onChange={e => onPatch({ route: e.target.value })} className={inputClass}>
                {f.routes.map(r => (
                  <option key={r} value={r}>
                    {r || 'No route needed'}
                  </option>
                ))}
                <option value="other">Other (write in)</option>
              </select>
            </Field>
            {m.route === 'other' && (
              <input
                aria-label="Route"
                value={m.routeOther}
                onChange={e => onPatch({ routeOther: e.target.value })}
                placeholder="for example, to the lower back"
                className={inputClass}
              />
            )}
          </div>

          <Field label="How often">
            <select value={m.freq} onChange={e => onPatch({ freq: e.target.value })} className={inputClass}>
              {FREQS.map(x => (
                <option key={x.id} value={x.id}>
                  {x.text}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-1">
            <span className="font-sans text-[12.5px] font-medium text-ink">Scheduled or as needed</span>
            <ChipRadio
              name={`${p}-prn`}
              label="Scheduled or as needed"
              value={m.prn ? 'yes' : 'no'}
              options={[
                ['no', 'Scheduled'],
                ['yes', 'As needed'],
              ]}
              onChange={v => onPatch({ prn: v === 'yes', showMax: null })}
            />
          </div>
          <Field label={m.prn ? 'As needed for' : 'Reason for use'}>
            <input
              value={m.indication}
              onChange={e => onPatch({ indication: e.target.value })}
              placeholder={m.prn ? 'for example, anxiety' : 'for example, depression'}
              className={inputClass}
            />
          </Field>
          <div className="grid min-w-0 content-start gap-1">
            <span className="font-sans text-[12.5px] font-medium text-ink">How long</span>
            <div className="flex min-w-0 gap-2">
              <select
                aria-label="How long"
                value={m.dur}
                onChange={e => isDurationMode(e.target.value) && onPatch({ dur: e.target.value })}
                className={inputClass}
              >
                {DURATIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              {(m.dur === 'days' || m.dur === 'weeks' || m.dur === 'months') && (
                <input
                  aria-label={`Number of ${m.dur}`}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={m.durN}
                  onChange={e => onPatch({ durN: e.target.value })}
                  className={`${numberClass} max-w-[6rem]`}
                />
              )}
            </div>
          </div>
        </div>
      </Group>

      <Group title="Extra instructions">
        <div className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
          {INSTRUCTIONS.map(([k, t]) => (
            <label key={k} className="flex cursor-pointer items-start gap-2 font-sans text-[13.5px] text-ink">
              <input
                type="checkbox"
                checked={m.instr.includes(k)}
                onChange={e =>
                  onPatch({
                    instr: e.target.checked ? [...m.instr, k] : m.instr.filter(x => x !== k),
                  })
                }
                className="mt-1 accent-mint-700"
              />
              {t}
            </label>
          ))}
        </div>
        <Field label="Other instructions">
          <input value={m.instrOther} onChange={e => onPatch({ instrOther: e.target.value })} placeholder="Written as a full sentence" className={inputClass} />
        </Field>
        {unit && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex cursor-pointer items-center gap-2 font-sans text-[13.5px] text-ink">
              <input type="checkbox" checked={showsMax(m)} onChange={e => onPatch({ showMax: e.target.checked })} className="accent-mint-700" />
              Include a maximum per 24 hours
            </label>
            {showsMax(m) && (
              <>
                <label className="flex items-center gap-2 font-sans text-[13px] text-ink">
                  Maximum
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step={step}
                    value={m.maxOverride}
                    placeholder={mx?.auto ? fmt(mx.q) : ''}
                    onChange={e => onPatch({ maxOverride: e.target.value })}
                    className={`${numberClass} w-24`}
                  />
                  {unit.pl}
                </label>
                <span className="font-sans text-[12.5px] text-ink">
                  {!mx
                    ? 'Enter a quantity and frequency to calculate it.'
                    : mx.auto
                      ? 'Calculated from the quantity and frequency. Type a lower number if the label or prescriber sets one.'
                      : 'Set by hand.'}
                </span>
              </>
            )}
          </div>
        )}
      </Group>

      <Group title="Status">
        <ChipRadio
          name={`${p}-status`}
          label="Status"
          value={m.status}
          options={STATUSES.map(([v, l]) => [v, l] as const)}
          onChange={status => onPatch({ status })}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Prescriber or source">
            <input value={m.prescriber} onChange={e => onPatch({ prescriber: e.target.value })} placeholder="Name, clinic, or self" className={inputClass} />
          </Field>
          <Field label="Last dose taken">
            <input value={m.lastDose} onChange={e => onPatch({ lastDose: e.target.value })} placeholder="for example, this morning" className={inputClass} />
          </Field>
          <Field label="Notes">
            <input value={m.notes} onChange={e => onPatch({ notes: e.target.value })} className={inputClass} />
          </Field>
        </div>
      </Group>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryButton} onClick={onDone}>
          Done
        </button>
        <button type="button" className={quietButton} onClick={() => onCopy(sigText(m))}>
          Copy directions
        </button>
        <button type="button" className={dangerQuietButton} onClick={onRemove}>
          Remove
        </button>
      </div>
    </article>
  )
}
