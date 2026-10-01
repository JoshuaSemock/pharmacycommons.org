/**
 * Medications and products: category filter, the editor for the row being
 * changed, and the table (one column per field, directions in their own
 * column). The table scrolls sideways inside its own box; the Name column
 * stays pinned so each row stays identifiable.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ReactNode } from 'react'
import { CATEGORIES, STATUS, type CategoryId, type Medication } from './model'
import { MED_COLUMNS, medColumns, sigSegments, sigText } from './sig'
import MedicationEditor from './MedicationEditor'
import { ChipRadio, RemoveIcon, SectionHeading, SigText, Tag, cell, quietButton, secondaryButton } from './ui'

export type Filter = 'all' | CategoryId

type Props = {
  meds: Medication[]
  openId: string | null
  filter: Filter
  onFilter: (f: Filter) => void
  onAdd: () => void
  onOpen: (id: string | null) => void
  onPatch: (id: string, patch: Partial<Medication>) => void
  onFormChange: (id: string, form: Medication['form']) => void
  onRemove: (id: string) => void
  onCopy: (text: string) => void
}

/** Minimum widths, in column order after Name, so short cells don't wrap word by word. */
const MIN_WIDTH: Record<string, string> = {
  strength: 'min-w-[6.5rem]',
  form: 'min-w-[8rem]',
  dose: 'min-w-[9.5rem]',
  route: 'min-w-[7.5rem]',
  freq: 'min-w-[9.5rem]',
  dur: 'min-w-[6.5rem]',
  reason: 'min-w-[9.5rem]',
  sig: 'min-w-[21rem]',
  status: 'min-w-[9.5rem]',
  prescriber: 'min-w-[8rem]',
  lastDose: 'min-w-[8rem]',
  notes: 'min-w-[8rem]',
}

export default function Medications({ meds, openId, filter, onFilter, onAdd, onOpen, onPatch, onFormChange, onRemove, onCopy }: Props) {
  const counts = new Map<Filter, number>([['all', meds.length]])
  for (const [c] of CATEGORIES) counts.set(c, meds.filter(m => m.category === c).length)
  const list = meds.filter(m => filter === 'all' || m.category === filter)
  const open = meds.find(m => m.id === openId) ?? null
  const filterOptions: [Filter, ReactNode][] = [['all', 'All'] as [Filter, string], ...CATEGORIES].map(([v, l]) => [
    v,
    <>
      {l} <span className="ml-0.5 font-mono text-[11px] text-neutral-500">{counts.get(v) ?? 0}</span>
    </>,
  ])

  return (
    <section aria-labelledby="medications" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 border-t border-mint-200 pt-8">
      <SectionHeading
        id="medications"
        title="Medications and products"
        lede="Everything taken by any route: prescriptions, over-the-counter products, vitamins and supplements, herbals, alternative medicines, and anything used only now and then."
        action={
          <button type="button" className={secondaryButton} onClick={onAdd}>
            Add a medication
          </button>
        }
      />

      <ChipRadio name="medrec-filter" label="Show category" value={filter} options={filterOptions} onChange={onFilter} />

      {open && (
        <MedicationEditor
          key={open.id}
          med={open}
          onPatch={patch => onPatch(open.id, patch)}
          onFormChange={form => onFormChange(open.id, form)}
          onDone={() => onOpen(null)}
          onRemove={() => onRemove(open.id)}
          onCopy={onCopy}
        />
      )}

      {list.length === 0 ? (
        <p className="font-sans text-[14px] italic text-neutral-600">{meds.length ? 'Nothing listed in this category.' : 'No medications listed yet.'}</p>
      ) : (
        <>
          <div
            role="region"
            aria-label="Medication table"
            tabIndex={0}
            className="relative min-w-0 overflow-x-auto border-y border-mint-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hepatica-300"
          >
            <table className="w-full border-separate border-spacing-0 font-sans text-[13.5px] text-mint-950">
              <thead>
                <tr>
                  {MED_COLUMNS.map(([key, label]) => (
                    <th
                      key={key}
                      scope="col"
                      className={`border-b border-mint-200 bg-mint-50 px-2.5 py-2 text-left align-bottom font-sans text-[12.5px] font-medium text-mint-800 ${
                        key === 'name' ? 'sticky left-0 z-10 min-w-[11rem] border-r' : MIN_WIDTH[key]
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                  <th scope="col" className="border-b border-mint-200 bg-mint-50 px-2.5 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map(m => {
                  const c = medColumns(m)
                  const isOpen = m.id === openId
                  const bg = isOpen ? 'bg-hepatica-50' : 'bg-paper group-hover:bg-mint-50'
                  const td = `border-b border-mint-100 px-2.5 py-2.5 align-top ${bg}`
                  return (
                    <tr key={m.id} className="group">
                      <th scope="row" className={`${td} sticky left-0 z-[1] max-w-[14rem] border-r text-left font-normal`}>
                        <div className="grid justify-items-start gap-1">
                          <button
                            type="button"
                            onClick={() => onOpen(m.id)}
                            className="text-left font-sans text-[14.5px] font-semibold text-mint-950 underline-offset-2 [overflow-wrap:anywhere] hover:text-hepatica-700 hover:underline"
                          >
                            {c.name || 'Unnamed medication'}
                          </button>
                          <Tag>{c.category}</Tag>
                        </div>
                      </th>
                      <td className={td}>{cell(c.strength)}</td>
                      <td className={td}>{cell(c.form)}</td>
                      <td className={td}>{cell(c.dose)}</td>
                      <td className={td}>{cell(c.route)}</td>
                      <td className={td}>{cell(c.freq)}</td>
                      <td className={td}>{cell(c.dur)}</td>
                      <td className={td}>{cell(c.reason)}</td>
                      <td className={`${td} font-display text-[15px] leading-snug`} style={{ fontFamily: 'var(--font-display)' }}>
                        <SigText segments={sigSegments(m)} />
                      </td>
                      <td className={td}>
                        <Tag tone={STATUS[m.status].tone}>{c.status}</Tag>
                      </td>
                      <td className={td}>{cell(c.prescriber)}</td>
                      <td className={td}>{cell(c.lastDose)}</td>
                      <td className={td}>{cell(c.notes)}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        <button type="button" className={quietButton} onClick={() => onOpen(m.id)}>
                          Edit
                        </button>
                        <button type="button" className={quietButton} onClick={() => onCopy(sigText(m))}>
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(m.id)}
                          aria-label={`Remove ${c.name || 'medication'}`}
                          className="rounded p-1.5 align-middle text-neutral-500 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <RemoveIcon />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="font-sans text-[12.5px] text-neutral-600">Scroll the table sideways to see every column. Select a name or Edit to change a row.</p>
        </>
      )}
    </section>
  )
}
