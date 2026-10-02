/**
 * Allergies and intolerances: allergy to what, the reaction, and how severe
 * it was, each with an "Other (write in)" choice.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ALLERGEN_SUGGESTIONS, ALLERGY_TYPES, REACTIONS, SEVERITIES, isAllergyType, type Allergy } from './model'
import { allergyLevel, allergyTypeText } from './sig'
import NameSearch from './NameSearch'
import { Field, RemoveIcon, SectionHeading, Tag, inputClass, secondaryButton, selectClass } from './ui'
import PaperSelect from '@/components/PaperSelect'

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
    <section aria-labelledby="allergies" className="grid gap-4 border-t border-ink/15 pt-8">
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

      <label className="flex cursor-pointer items-start gap-2 font-sans text-[14px] text-ink">
        <input type="checkbox" checked={nkda} onChange={e => onNkda(e.target.checked)} className="mt-1 accent-mint-700" />
        <span>
          <b className="font-semibold">No known drug allergies.</b> Checking this records that the question was asked.
        </span>
      </label>

      {allergies.length === 0 && !nkda && <p className="font-sans text-[14px] italic text-ink">No allergies listed.</p>}

      {allergies.map(a => {
        const level = allergyLevel(a)
        const p = `allergy-${a.id}`
        return (
          <article
            key={a.id}
            aria-label={a.substance || 'New allergy'}
            className={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 lp-raised rounded-md border-l-4 p-4 ${LEVEL_BORDER[level]}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3
                  className="font-display font-semibold text-ink"
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
                className="rounded p-1.5 text-ink hover:bg-rose-50"
              >
                <RemoveIcon />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,0.8fr)]">
              <div className="grid min-w-0 content-start gap-1">
                <label htmlFor={`${p}-substance`} className="font-sans text-[12.5px] font-medium text-ink">
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
                <PaperSelect value={a.type} onChange={v => isAllergyType(v) && onPatch(a.id, { type: v })} className={selectClass}>
                  {ALLERGY_TYPES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </PaperSelect>
              </Field>
              <div className="grid min-w-0 content-start gap-1">
                <Field label="What was the reaction?">
                  <PaperSelect value={a.reaction} onChange={v => onPatch(a.id, { reaction: v })} className={selectClass}>
                    <option value="">Choose a reaction</option>
                    {REACTIONS.map(r => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                    <option value="other">Other (write in)</option>
                  </PaperSelect>
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
                  <PaperSelect value={a.severity} onChange={v => onPatch(a.id, { severity: v })} className={selectClass}>
                    <option value="">Choose what happened</option>
                    {SEVERITIES.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                    <option value="other">Other (write in)</option>
                  </PaperSelect>
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
