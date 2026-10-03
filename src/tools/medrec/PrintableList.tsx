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
import { clinicalFor, markerText, summarize, type ClinicalIndex } from './clinicalLists'

const th = 'border-b border-ink/15 py-1.5 pr-3 text-left align-bottom font-sans text-[12.5px] font-medium text-ink'
const td = 'border-b border-ink/10 py-1.5 pr-3 align-top'

export default function PrintableList({ state, prepared, clinical }: { state: MedRecState; prepared: string; clinical: ClinicalIndex | null }) {
  const named = state.allergies.filter(a => a.substance.trim())
  const groups = CATEGORIES.map(([k, label]) => [label, state.meds.filter(m => m.category === k)] as const).filter(([, ms]) => ms.length)
  const h3 = 'mb-2 border-b border-ink/25 pb-1 font-display font-semibold text-ink'
  // Inline size: the global h3 rule in index.css is unlayered and outranks text-* utilities.
  const h3Style = { fontFamily: 'var(--font-display)', fontSize: '17px' }

  return (
    <div
      data-print
      className="lp-raised grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 rounded p-5 font-sans text-[13px] text-ink sm:p-8 print:block print:border-0 print:p-0 print:shadow-none print:[&>*+*]:mt-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-2.5">
        <div>
          <p className="font-sans font-medium text-[12.5px] text-ink">Medication list</p>
          <p className="font-display text-[24px] font-semibold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            {state.name.trim() || 'Name not entered'}
          </p>
        </div>
        <p className="text-right text-[12.5px] text-ink">
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
          <p className="italic text-ink">Not recorded.</p>
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
                      className="border-b border-ink/25 pt-3 pb-1 text-left font-sans text-[12.5px] font-medium text-ink"
                    >
                      {label}
                    </th>
                  </tr>,
                  ...ms.map(m => {
                    const c = medColumns(m)
                    const marks = clinicalFor(m, clinical).map(markerText)
                    return (
                      <tr key={m.id}>
                        <td className={`${td} font-semibold`}>
                          {cell(c.name)}
                          {marks.length > 0 && <span className="block font-normal text-[11.5px] print:text-[7.5pt]">{marks.join(' · ')}</span>}
                        </td>
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
          <p className="italic text-ink">No medications listed.</p>
        )}
      </div>

      <ClinicalRiskSummary state={state} clinical={clinical} h3={h3} h3Style={h3Style} />

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

      <p className="border-t border-ink/15 pt-2.5 text-[11.5px] text-ink">
        Made with the Pharmacy Commons medication reconciliation tool (pharmacycommons.org/tools/medication-reconciliation). This list is not a medical record.
        Bring it to every appointment and pharmacy visit, and review it with a pharmacist or prescriber.
      </p>
    </div>
  )
}

/**
 * Totals from the clinical lists for the medications being taken. Shown only
 * when at least one medication is on one of them.
 */
function ClinicalRiskSummary({
  state,
  clinical,
  h3,
  h3Style,
}: {
  state: MedRecState
  clinical: ClinicalIndex | null
  h3: string
  h3Style: { fontFamily: string; fontSize: string }
}) {
  if (!clinical) return null
  const s = summarize(state.meds, clinical)
  const rows: [string, string][] = []
  if (s.acb.total > 0)
    rows.push([
      'Anticholinergic burden',
      `Total score ${s.acb.total}${s.acb.total >= 3 ? ' (3 or more: clinically relevant)' : ''}: ${s.acb.meds.map(m => `${m.name} ${m.score}`).join(', ')}`,
    ])
  if (s.qt.length) rows.push(['QT prolongation', s.qt.join(', ')])
  if (s.brugada.length) rows.push(['Risk in Brugada syndrome', s.brugada.join(', ')])
  if (s.crush.length)
    rows.push(['Some products should not be crushed', s.crush.map(c => (c.products ? `${c.name} (${c.products})` : c.name)).join('; ')])
  if (rows.length === 0) return null

  return (
    <div>
      <h3 className={h3} style={h3Style}>
        Clinical risk summary
      </h3>
      <table className="w-full border-collapse">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row" className={`${td} w-[28%] text-left font-medium`}>
                {k}
              </th>
              <td className={td}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11.5px] text-ink">
        Counts medications marked as taking (as prescribed or differently); creams, ointments, gels and lotions are left out of the anticholinergic total. From the Pharmacy Commons lists Anticholinergic Burden, Drugs Which Affect
        Risk of Arrhythmias, and Do Not Crush (pharmacycommons.org/lists).
      </p>
    </div>
  )
}
