/**
 * Substance use: caffeine, nicotine and tobacco, alcohol, and recreational
 * substances, each with a status and running totals (mg of caffeine per day,
 * pack-years, standard drinks per week, AUDIT-C).
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ReactNode } from 'react'
import {
  AUDIT_C,
  CAFFEINE_BY_ID,
  CAFFEINE_SOURCES,
  DRINKS,
  NICOTINE_BY_ID,
  NICOTINE_PRODUCTS,
  REC_HOW,
  REC_OFTEN,
  REC_SUGGESTIONS,
  USE_STATUSES,
  newCaffeineItem,
  newNicotineItem,
  newRecItem,
  type Substances as SubstanceState,
  type UseStatus,
} from './model'
import { auditCScore, caffeineMgPerDay, drinksPerWeek, fmt, packYears } from './sig'
import NameSearch from './NameSearch'
import { ChipRadio, Field, RemoveIcon, SectionHeading, inputClass, numberClass, secondaryButton, selectClass } from './ui'
import PaperSelect from '@/components/PaperSelect'

type Props = {
  subs: SubstanceState
  onChange: (next: SubstanceState) => void
}

type ItemKey = 'caffeine' | 'nicotine' | 'recreational'

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <article className="grid min-w-0 content-start gap-3 border-t border-ink/15 pt-4">
      <div>
        <h3 className="font-display font-semibold text-ink" style={{ fontFamily: 'var(--font-display)', fontSize: '19px' }}>
          {title}
        </h3>
        {note && <p className="mt-0.5 font-sans text-[12.5px] text-ink">{note}</p>}
      </div>
      {children}
    </article>
  )
}

function Result({ items }: { items: [string, string][] }) {
  return (
    <p className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg bg-neutral-100 px-3 py-2 font-mono text-[12.5px]">
      {items.map(([k, v]) => (
        <span key={k}>
          <span className="text-ink">{k}</span> <b className="font-medium text-ink">{v}</b>
        </span>
      ))}
    </p>
  )
}

function Remove({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Remove row" className="self-end rounded p-1.5 text-ink hover:bg-rose-50">
      <RemoveIcon />
    </button>
  )
}

const rowClass = 'grid min-w-0 grid-cols-2 items-end gap-2 border-b border-ink/10 pb-3 last:border-b-0 sm:border-0 sm:pb-0'

export default function Substances({ subs, onChange }: Props) {
  const setStatus = (key: keyof SubstanceState, status: UseStatus) => {
    const next = structuredClone(subs)
    next[key].status = status
    // Starting a current (or former smoker) entry with one empty row saves a click.
    if (key === 'caffeine' && status === 'current' && !next.caffeine.items.length) next.caffeine.items.push(newCaffeineItem())
    if (key === 'nicotine' && status !== 'never' && status !== '' && !next.nicotine.items.length) next.nicotine.items.push(newNicotineItem())
    if (key === 'recreational' && status !== 'never' && status !== '' && !next.recreational.items.length) next.recreational.items.push(newRecItem())
    onChange(next)
  }
  const patchItem = <K extends ItemKey>(key: K, id: string, patch: Partial<SubstanceState[K]['items'][number]>) => {
    const next = structuredClone(subs)
    const items = next[key].items as SubstanceState[K]['items'][number][]
    const i = items.findIndex(x => x.id === id)
    if (i >= 0) items[i] = { ...items[i], ...patch }
    onChange(next)
  }
  const addItem = (key: ItemKey) => {
    const next = structuredClone(subs)
    if (key === 'caffeine') next.caffeine.items.push(newCaffeineItem())
    if (key === 'nicotine') next.nicotine.items.push(newNicotineItem())
    if (key === 'recreational') next.recreational.items.push(newRecItem())
    onChange(next)
  }
  const removeItem = (key: ItemKey, id: string) => {
    const next = structuredClone(subs)
    if (key === 'caffeine') next.caffeine.items = next.caffeine.items.filter(x => x.id !== id)
    if (key === 'nicotine') next.nicotine.items = next.nicotine.items.filter(x => x.id !== id)
    if (key === 'recreational') next.recreational.items = next.recreational.items.filter(x => x.id !== id)
    onChange(next)
  }
  const patch = <K extends keyof SubstanceState>(key: K, p: Partial<SubstanceState[K]>) => onChange({ ...subs, [key]: { ...subs[key], ...p } })

  const status = (key: keyof SubstanceState) => (
    <ChipRadio name={`medrec-${key}-status`} label={`${key} status`} value={subs[key].status} options={USE_STATUSES} onChange={v => setStatus(key, v)} />
  )
  const quit = (key: 'nicotine' | 'alcohol') =>
    subs[key].status === 'former' && (
      <Field label="Year quit" className="max-w-[12rem]">
        <input value={subs[key].quitYear} onChange={e => patch(key, { quitYear: e.target.value })} className={inputClass} />
      </Field>
    )

  const py = packYears(subs)
  const audit = auditCScore(subs)
  const al = subs.alcohol

  return (
    <section aria-labelledby="substances" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 border-t border-ink/15 pt-8">
      <SectionHeading
        id="substances"
        title="Substance use"
        lede="These change how medications work and which ones are safe. Totals are calculated as you type."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Caffeine">
          {status('caffeine')}
          {subs.caffeine.status === 'current' && (
            <>
              {subs.caffeine.items.map(i => (
                <div key={i.id} className={`${rowClass} sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]`}>
                  <Field label="Source" className="col-span-2 sm:col-span-1">
                    <PaperSelect
                      value={i.source}
                      onChange={v =>
                        patchItem('caffeine', i.id, {
                          source: v,
                          mg: String(CAFFEINE_BY_ID.get(v)?.mg ?? 0),
                        })
                      }
                      className={selectClass}
                    >
                      {CAFFEINE_SOURCES.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </PaperSelect>
                  </Field>
                  <Field label="Servings per day">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      value={i.servings}
                      onChange={e =>
                        patchItem('caffeine', i.id, {
                          servings: e.target.value,
                        })
                      }
                      className={numberClass}
                    />
                  </Field>
                  <Field label="mg each">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={i.mg}
                      onChange={e => patchItem('caffeine', i.id, { mg: e.target.value })}
                      className={numberClass}
                    />
                  </Field>
                  <Remove onClick={() => removeItem('caffeine', i.id)} />
                </div>
              ))}
              <div>
                <button type="button" className={secondaryButton} onClick={() => addItem('caffeine')}>
                  Add a source
                </button>
              </div>
              <Result items={[['Estimated caffeine', `${fmt(Math.round(caffeineMgPerDay(subs)))} mg per day`]]} />
              <p className="font-sans text-[12.5px] leading-snug text-ink">
                Amounts are typical values; edit “mg each” to match a product label. The FDA cites 400 mg a day as an amount not generally linked to harmful
                effects in healthy adults.
              </p>
            </>
          )}
        </Card>

        <Card title="Nicotine and tobacco">
          {status('nicotine')}
          {(subs.nicotine.status === 'current' || subs.nicotine.status === 'former') && (
            <>
              {subs.nicotine.items.map(i => (
                <div key={i.id} className={`${rowClass} sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto]`}>
                  <Field label="Product" className="col-span-2 sm:col-span-1">
                    <PaperSelect value={i.product} onChange={v => patchItem('nicotine', i.id, { product: v })} className={selectClass}>
                      {NICOTINE_PRODUCTS.map(n => (
                        <option key={n.id} value={n.id}>
                          {n.label}
                        </option>
                      ))}
                    </PaperSelect>
                  </Field>
                  <Field label="How many">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      value={i.amount}
                      onChange={e => patchItem('nicotine', i.id, { amount: e.target.value })}
                      className={numberClass}
                    />
                  </Field>
                  <Field label={`${NICOTINE_BY_ID.get(i.product)?.unit ?? 'units'} per`}>
                    <PaperSelect
                      value={i.per}
                      onChange={v =>
                        patchItem('nicotine', i.id, {
                          per: v === 'week' ? 'week' : 'day',
                        })
                      }
                      className={selectClass}
                    >
                      <option value="day">day</option>
                      <option value="week">week</option>
                    </PaperSelect>
                  </Field>
                  <Field label="Years used">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      value={i.years}
                      onChange={e => patchItem('nicotine', i.id, { years: e.target.value })}
                      className={numberClass}
                    />
                  </Field>
                  <Remove onClick={() => removeItem('nicotine', i.id)} />
                </div>
              ))}
              <div>
                <button type="button" className={secondaryButton} onClick={() => addItem('nicotine')}>
                  Add a product
                </button>
              </div>
              {quit('nicotine')}
              <Result items={[['Pack-years', py ? fmt(Math.round(py * 10) / 10) : 'none calculated']]} />
              <p className="font-sans text-[12.5px] leading-snug text-ink">Pack-years = cigarettes per day ÷ 20 × years smoked, for cigarettes only.</p>
            </>
          )}
        </Card>

        <Card title="Alcohol">
          {status('alcohol')}
          {quit('alcohol')}
          {al.status === 'current' && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {DRINKS.map(([k, label, size]) => (
                  <Field key={k} label={`${label}, drinks per week`} hint={`One drink is ${size}`}>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      value={al[k]}
                      onChange={e => patch('alcohol', { [k]: e.target.value })}
                      className={numberClass}
                    />
                  </Field>
                ))}
              </div>
              <Result
                items={[
                  ['Standard drinks', `${fmt(drinksPerWeek(subs))} per week`],
                  ['AUDIT-C', audit == null ? 'not answered' : `${audit} of 12`],
                ]}
              />
              <details open={al.audit.some(x => x !== '')} className="lp-raised rounded-md p-3">
                <summary className="cursor-pointer font-sans text-[13.5px] font-medium text-ink">AUDIT-C screening questions</summary>
                <div className="mt-3 grid gap-3">
                  {AUDIT_C.map(([q, answers], qi) => (
                    <Field key={q} label={q}>
                      <PaperSelect
                        value={al.audit[qi]}
                        onChange={v => {
                          const audit = [...al.audit] as [string, string, string]
                          audit[qi] = v
                          patch('alcohol', { audit })
                        }}
                        className={selectClass}
                      >
                        <option value="">Choose an answer</option>
                        {answers.map((a, ai) => (
                          <option key={a} value={String(ai)}>
                            {a}
                          </option>
                        ))}
                      </PaperSelect>
                    </Field>
                  ))}
                  <p className="font-sans text-[12.5px] leading-snug text-ink">
                    Scores run from 0 to 12. A score of 4 or more in men, or 3 or more in women, is generally treated as a positive screen for unhealthy alcohol
                    use.
                  </p>
                </div>
              </details>
            </>
          )}
        </Card>

        <Card title="Recreational substances" note="Including cannabis, kratom, and any medication used without a prescription.">
          {status('recreational')}
          {(subs.recreational.status === 'current' || subs.recreational.status === 'former') && (
            <>
              {subs.recreational.items.map(i => (
                <div key={i.id} className={`${rowClass} sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]`}>
                  <div className="col-span-2 grid min-w-0 content-start gap-1 sm:col-span-1">
                    <label htmlFor={`rec-${i.id}`} className="font-sans text-[12.5px] font-medium text-ink">
                      Substance
                    </label>
                    <NameSearch
                      id={`rec-${i.id}`}
                      value={i.substance}
                      pcid={null}
                      catalog={false}
                      suggestions={REC_SUGGESTIONS}
                      onChange={substance => patchItem('recreational', i.id, { substance })}
                    />
                  </div>
                  <Field label="How">
                    <PaperSelect value={i.how} onChange={v => patchItem('recreational', i.id, { how: v })} className={selectClass}>
                      {REC_HOW.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </PaperSelect>
                  </Field>
                  <Field label="How often">
                    <PaperSelect
                      value={i.often}
                      onChange={v =>
                        patchItem('recreational', i.id, {
                          often: v,
                        })
                      }
                      className={selectClass}
                    >
                      {REC_OFTEN.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </PaperSelect>
                  </Field>
                  <Field label="Last used">
                    <input
                      value={i.last}
                      onChange={e =>
                        patchItem('recreational', i.id, {
                          last: e.target.value,
                        })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Remove onClick={() => removeItem('recreational', i.id)} />
                </div>
              ))}
              <div>
                <button type="button" className={secondaryButton} onClick={() => addItem('recreational')}>
                  Add a substance
                </button>
              </div>
            </>
          )}
        </Card>
      </div>
    </section>
  )
}
