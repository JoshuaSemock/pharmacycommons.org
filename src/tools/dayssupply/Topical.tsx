/**
 * Days supply and quantity — topical cream or ointment card (fingertip units).
 * The arithmetic is in topical.ts; this only renders it. Everything here is an
 * estimate and says so. Design: docs/days-supply.md, "Topicals".
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState } from 'react'
import { fmt } from '@/tools/medrec/sig'
import { ChipRadio, Field, SectionHeading, numberClass, quietButton } from '@/tools/medrec/ui'
import Stamp from '@/components/Stamp'
import { TABLES, TUBE_SIZES, newTopical, planTopical, type TableId, type TopicalInput } from './topical'

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

const round2 = (n: number) => Math.round(n * 100) / 100

export default function TopicalCard({ onCopy }: { onCopy: (text: string) => void }) {
  const [t, setT] = useState<TopicalInput>(() => ({ ...newTopical('fpnotebook'), counts: { 'face-neck': '1', arm: '2' } }))
  const table = TABLES[t.table]
  const r = planTopical(t)
  const setCount = (id: string, v: string) => setT(x => ({ ...x, counts: { ...x.counts, [id]: v } }))
  const patch = (p: Partial<TopicalInput>) => setT(x => ({ ...x, ...p }))

  return (
    <section aria-labelledby="topical" className="lp-raised grid min-w-0 gap-6 rounded-lg p-4 sm:p-6">
      <SectionHeading
        id="topical"
        title="Cream or ointment (estimate)"
        lede="How much a course needs, from the skin it covers. One fingertip unit is a line of cream from the tip of an adult index finger to the first crease, about 0.5 g."
      />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
        <div className="grid min-w-0 content-start gap-6">
          <fieldset className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t border-dashed border-ink/15 pt-4">
            <legend className="float-left mb-1 w-full font-sans text-[15px] text-ink">Fingertip unit table</legend>
            <ChipRadio<TableId>
              name="top-table"
              label="Which published table to use"
              value={t.table}
              options={[
                ['fpnotebook', 'FPnotebook'],
                ['gpnotebook', 'GPnotebook'],
              ]}
              onChange={v => patch({ table: v })}
            />
            <p className="font-sans text-[12.5px] leading-snug text-ink">
              The two published tables disagree, most on the trunk, so the tool shows the one it used. Adult amounts only; children’s amounts depend on age and are not included. Source:{' '}
              <a href={table.url} className="text-ink underline decoration-foil underline-offset-2 hover:decoration-2" target="_blank" rel="noopener">
                {table.source}
              </a>
              .
            </p>
          </fieldset>

          <fieldset className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t border-dashed border-ink/15 pt-4">
            <legend className="float-left mb-1 w-full font-sans text-[15px] text-ink">Skin to treat</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {table.areas.map(a => (
                <Field key={a.id} label={`${a.label}${a.max > 1 ? `, up to ${a.max}` : ''}`} hint={`${fmt(a.ftu)} fingertip ${a.ftu === 1 ? 'unit' : 'units'} each`}>
                  <NumberInput label={a.label} value={t.counts[a.id] ?? ''} step="1" placeholder="0" onChange={v => setCount(a.id, v)} />
                </Field>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t border-dashed border-ink/15 pt-4">
            <legend className="float-left mb-1 w-full font-sans text-[15px] text-ink">Directions and package</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Applications per day">
                <NumberInput label="Applications per day" value={t.perDay} step="1" onChange={perDay => patch({ perDay })} />
              </Field>
              <Field label="Days of treatment">
                <NumberInput label="Days of treatment" value={t.days} step="1" onChange={days => patch({ days })} />
              </Field>
              <Field label="Grams per package (optional)">
                <NumberInput label="Grams per package" value={t.tubeGrams} onChange={tubeGrams => patch({ tubeGrams })} />
              </Field>
              <Field label="Grams per fingertip unit (optional)" hint={`Blank uses ${fmt(table.gramsPerFtu)} g. Some sources use about 0.43 g for women and 0.49 g for men.`}>
                <NumberInput label="Grams per fingertip unit" value={t.gramsPerFtu} placeholder={fmt(table.gramsPerFtu)} onChange={gramsPerFtu => patch({ gramsPerFtu })} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="w-full font-sans text-[12.5px] text-ink">Common sizes in grams</span>
              {TUBE_SIZES.map(g => (
                <button key={g} type="button" className={quietButton} onClick={() => patch({ tubeGrams: String(g) })}>
                  {g}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <section aria-labelledby="topical-result" aria-live="polite" className="grid min-w-0 gap-4">
            <h3 id="topical-result" className="font-sans leading-snug text-ink" style={{ fontSize: '17px' }}>
              Result
            </h3>
            {r.ok ? (
              <div className="lp-sunken grid min-w-0 content-start gap-4 rounded-md p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Stamp>Estimate</Stamp>
                  <span className="font-sans text-[12.5px] text-ink">Real use varies with skin, thickness and the product.</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <div className="grid min-w-0 content-start gap-0.5">
                    <dt className="font-sans text-[12.5px] text-ink">Total needed</dt>
                    <dd className="font-display text-[22px] leading-tight text-ink" style={{ fontFamily: 'var(--font-display)' }}>
                      About {fmt(round2(r.totalGrams))} g
                    </dd>
                  </div>
                  {r.tubes != null && r.tubeGrams != null && (
                    <div className="grid min-w-0 content-start gap-0.5">
                      <dt className="font-sans text-[12.5px] text-ink">Dispense</dt>
                      <dd className="[overflow-wrap:anywhere] font-display text-[22px] leading-tight text-ink" style={{ fontFamily: 'var(--font-display)' }}>
                        {fmt(r.tubes)} × {fmt(r.tubeGrams)} g
                      </dd>
                    </div>
                  )}
                  <div className="grid min-w-0 content-start gap-0.5">
                    <dt className="font-sans text-[12.5px] text-ink">Each application</dt>
                    <dd className="font-display text-[17px] leading-tight text-ink" style={{ fontFamily: 'var(--font-display)' }}>
                      {fmt(round2(r.ftuPerApplication))} units, {fmt(round2(r.gramsPerApplication))} g
                    </dd>
                  </div>
                  {r.daysPerTube != null && r.tubeGrams != null && (
                    <div className="grid min-w-0 content-start gap-0.5">
                      <dt className="font-sans text-[12.5px] text-ink">One {fmt(r.tubeGrams)} g package lasts</dt>
                      <dd className="font-display text-[17px] leading-tight text-ink" style={{ fontFamily: 'var(--font-display)' }}>
                        {fmt(r.daysPerTube)} {r.daysPerTube === 1 ? 'day' : 'days'}
                      </dd>
                    </div>
                  )}
                </dl>
                <div className="grid gap-1.5 border-t border-dashed border-ink/15 pt-3">
                  <h4 className="font-sans text-[12.5px] leading-snug text-ink" style={{ fontSize: '12.5px' }}>
                    How this was worked out
                  </h4>
                  <ol className="grid list-decimal gap-1.5 pl-5 font-mono text-[12.5px] leading-snug text-ink marker:text-ink">
                    {r.work.map((w, i) => (
                      <li key={i} className="[overflow-wrap:anywhere]">
                        {w}
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
