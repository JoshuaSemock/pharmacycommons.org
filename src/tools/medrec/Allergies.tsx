/**
 * Allergies and intolerances: allergy to what, the reaction, and how severe
 * it was, each with an "Other (write in)" choice.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ALLERGEN_SUGGESTIONS, ALLERGY_TYPES, REACTIONS, SEVERITIES, isAllergyType, type Allergy } from './model'
import { allergyLevel, allergyTypeText } from './sig'
import NameSearch from './NameSearch'
import { Field, RemoveIcon, SectionHeading, Tag, inputClass, secondaryButton } from './ui'

type Props = {
  allergies: Allergy[]
  nkda: boolean
  onNkda: (v: boolean) => void
  onAdd: () => void
  onPatch: (id: string, patch: Partial<Allergy>) => void
  onRemove: (id: string) => void
}

const LEVEL_BORDER = ['border-l-neutral-300', 'border-l-marigold-400', 'border-l-rose-500'] as const

export default function Allergies({ allergies, nkda, onNkda, onAdd, onPatch, onRemove }: Props) {
  return (
    <section aria-labelledby="allergies" className="grid gap-4 border-t border-mint-200 pt-8">
      <SectionHeading
        id="allergies"
        title="Allergies and intolerances"
        lede="Record what happened, not only the name. A stomach upset and a swollen throat lead to very different decisions later."
        action={
          <button type="button" className={secondaryButton} onClick={onAdd}>
            Add an allergy
          </button>
        }
      />

      <label className="flex cursor-pointer items-start gap-2 font-sans text-[14px] text-mint-950">
        <input type="checkbox" checked={nkda} onChange={e => onNkda(e.target.checked)} className="mt-1 accent-mint-700" />
        <span>
          <b className="font-semibold">No known drug allergies.</b> Checking this records that the question was asked.
        </span>
      </label>

      {allergies.length === 0 && !nkda && <p className="font-sans text-[14px] italic text-neutral-600">No allergies listed.</p>}

      {allergies.map(a => {
        const level = allergyLevel(a)
        const p = `allergy-${a.id}`
        return (
          <article
            key={a.id}
            aria-label={a.substance || 'New allergy'}
            className={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-xl border border-l-4 border-mint-200 bg-white/80 p-4 ${LEVEL_BORDER[level]}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3
                  className="font-display font-semibold text-mint-950"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '18px',
                  }}
                >
                  {a.substance.trim() || 'New allergy'}
                </h3>
                {level === 2 && <Tag tone="warn">Severe</Tag>}
                {a.type !== 'allergy' && <Tag>{allergyTypeText(a)}</Tag>}
              </div>
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                aria-label={`Remove ${a.substance || 'allergy'}`}
                className="rounded p-1.5 text-neutral-500 hover:bg-rose-50 hover:text-rose-700"
              >
                <RemoveIcon />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,0.8fr)]">
              <div className="grid min-w-0 content-start gap-1">
                <label htmlFor={`${p}-substance`} className="font-sans text-[12.5px] font-medium text-mint-900">
                  Allergy to what?
                </label>
                <NameSearch
                  id={`${p}-substance`}
                  value={a.substance}
                  pcid={a.pcid}
                  suggestions={ALLERGEN_SUGGESTIONS}
                  placeholder="A drug, class, food, or other"
                  onChange={(substance, pcid) => onPatch(a.id, { substance, pcid })}
                />
              </div>
              <Field label="Type">
                <select value={a.type} onChange={e => isAllergyType(e.target.value) && onPatch(a.id, { type: e.target.value })} className={inputClass}>
                  {ALLERGY_TYPES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid min-w-0 content-start gap-1">
                <Field label="What was the reaction?">
                  <select value={a.reaction} onChange={e => onPatch(a.id, { reaction: e.target.value })} className={inputClass}>
                    <option value="">Choose a reaction</option>
                    {REACTIONS.map(r => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                    <option value="other">Other (write in)</option>
                  </select>
                </Field>
                {a.reaction === 'other' && (
                  <input
                    aria-label="Describe the reaction"
                    value={a.reactionOther}
                    onChange={e => onPatch(a.id, { reactionOther: e.target.value })}
                    placeholder="Describe the reaction"
                    className={inputClass}
                  />
                )}
              </div>
              <div className="grid min-w-0 content-start gap-1">
                <Field label="How severe was it?">
                  <select value={a.severity} onChange={e => onPatch(a.id, { severity: e.target.value })} className={inputClass}>
                    <option value="">Choose what happened</option>
                    {SEVERITIES.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                    <option value="other">Other (write in)</option>
                  </select>
                </Field>
                {a.severity === 'other' && (
                  <input
                    aria-label="Describe what happened"
                    value={a.severityOther}
                    onChange={e => onPatch(a.id, { severityOther: e.target.value })}
                    placeholder="Describe what happened"
                    className={inputClass}
                  />
                )}
              </div>
              <Field label="When?">
                <input value={a.when} onChange={e => onPatch(a.id, { when: e.target.value })} placeholder="Year or age" className={inputClass} />
              </Field>
            </div>
          </article>
        )
      })}
    </section>
  )
}
