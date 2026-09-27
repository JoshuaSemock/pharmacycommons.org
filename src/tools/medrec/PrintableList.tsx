/**
 * The printable list: what "Print or save as PDF" prints. It is marked
 * `data-print`, and the print rules in src/index.css hide everything else on
 * the page and print it landscape (13 medication columns don't fit portrait).
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CATEGORIES, SUBSTANCE_KEYS, type MedRecState } from './model'
import { MED_COLUMNS, allergyTypeText, medColumns, reactionText, severityText, sigText, substanceSummary } from './sig'
import { cell } from './ui'

const th = 'border-b border-mint-200 py-1.5 pr-3 text-left align-bottom font-sans text-[12.5px] font-medium text-neutral-600'
const td = 'border-b border-mint-100 py-1.5 pr-3 align-top'

export default function PrintableList({ state, prepared }: { state: MedRecState; prepared: string }) {
  const named = state.allergies.filter(a => a.substance.trim())
  const groups = CATEGORIES.map(([k, label]) => [label, state.meds.filter(m => m.category === k)] as const).filter(([, ms]) => ms.length)
  const h3 = 'mb-2 border-b border-mint-300 pb-1 font-display font-semibold text-mint-950'
  // Inline size: the global h3 rule in index.css is unlayered and outranks text-* utilities.
  const h3Style = { fontFamily: 'var(--font-display)', fontSize: '17px' }

  return (
    <div
      data-print
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 rounded border border-mint-300 bg-white p-5 font-sans text-[13px] text-mint-950 shadow-sm sm:p-8 print:block print:border-0 print:p-0 print:shadow-none print:[&>*+*]:mt-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-mint-950 pb-2.5">
        <div>
          <p className="font-sans font-medium text-[12.5px] text-neutral-600">Medication list</p>
          <p className="font-display text-[24px] font-semibold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            {state.name.trim() || 'Name not entered'}
          </p>
        </div>
        <p className="text-right text-[12.5px] text-neutral-700">
          {state.dob.trim() && (
            <>
              Date of birth: {state.dob.trim()}
              <br />
            </>
          )}
          Prepared {prepared}
        </p>
      </div>

      <div>
        <h3 className={h3} style={h3Style}>
          Allergies and intolerances
        </h3>
        {state.nkda && !named.length ? (
          <p>No known drug allergies.</p>
        ) : named.length ? (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Allergy to', 'Type', 'Reaction', 'Severity', 'When'].map(h => (
                    <th key={h} scope="col" className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {named.map(a => (
                  <tr key={a.id}>
                    <td className={`${td} font-semibold`}>{a.substance.trim()}</td>
                    <td className={td}>{cell(allergyTypeText(a))}</td>
                    <td className={td}>{cell(reactionText(a))}</td>
                    <td className={td}>{cell(severityText(a))}</td>
                    <td className={td}>{cell(a.when.trim())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="italic text-neutral-600">Not recorded.</p>
        )}
      </div>

      <div className="min-w-0">
        <h3 className={h3} style={h3Style}>
          Medications and products
        </h3>
        {groups.length ? (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[68rem] border-collapse text-[12.5px] print:min-w-0 print:text-[8.5pt]">
              <thead>
                <tr>
                  {MED_COLUMNS.map(([k, label]) => (
                    <th key={k} scope="col" className={th}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(([label, ms]) => [
                  <tr key={label}>
                    <th
                      colSpan={MED_COLUMNS.length}
                      scope="colgroup"
                      className="border-b border-mint-300 pt-3 pb-1 text-left font-sans text-[12.5px] font-medium text-mint-700"
                    >
                      {label}
                    </th>
                  </tr>,
                  ...ms.map(m => {
                    const c = medColumns(m)
                    return (
                      <tr key={m.id}>
                        <td className={`${td} font-semibold`}>{cell(c.name)}</td>
                        <td className={td}>{cell(c.strength)}</td>
                        <td className={td}>{cell(c.form)}</td>
                        <td className={td}>{cell(c.dose)}</td>
                        <td className={td}>{cell(c.route)}</td>
                        <td className={td}>{cell(c.freq)}</td>
                        <td className={td}>{cell(c.dur)}</td>
                        <td className={td}>{cell(c.reason)}</td>
                        <td className={`${td} min-w-[16rem] font-display text-[13.5px] print:min-w-[2.9in]`} style={{ fontFamily: 'var(--font-display)' }}>
                          {sigText(m)}
                        </td>
                        <td className={td}>{cell(c.status)}</td>
                        <td className={td}>{cell(c.prescriber)}</td>
                        <td className={td}>{cell(c.lastDose)}</td>
                        <td className={td}>{cell(c.notes)}</td>
                      </tr>
                    )
                  }),
                ])}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="italic text-neutral-600">No medications listed.</p>
        )}
      </div>

      <div>
        <h3 className={h3} style={h3Style}>
          Substance use
        </h3>
        <table className="w-full border-collapse">
          <tbody>
            {SUBSTANCE_KEYS.map(([k, label]) => (
              <tr key={k}>
                <th scope="row" className={`${td} w-[28%] text-left font-medium`}>
                  {label}
                </th>
                <td className={td}>{substanceSummary(state.subs, k)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-mint-200 pt-2.5 text-[11.5px] text-neutral-600">
        Made with the Pharmacy Commons medication reconciliation tool (pharmacycommons.org/tools/medication-reconciliation). This list is not a medical record.
        Bring it to every appointment and pharmacy visit, and review it with a pharmacist or prescriber.
      </p>
    </div>
  )
}
