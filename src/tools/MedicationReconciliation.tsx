import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageTitle } from '@/pages/PageShell'
import { applyFormDefaults, blankState, exampleState, newAllergy, newMedication, type Allergy, type MedRecState, type Medication } from '@/tools/medrec/model'
import { reviewFlags } from '@/tools/medrec/sig'
import { csvFileName, fromCsv, loadSaved, saveWorking, toCsv } from '@/tools/medrec/csv'
import Allergies from '@/tools/medrec/Allergies'
import Medications, { type Filter } from '@/tools/medrec/Medications'
import Substances from '@/tools/medrec/Substances'
import PrintableList from '@/tools/medrec/PrintableList'
import { loadClinicalIndex, type ClinicalIndex } from '@/tools/medrec/clinicalLists'
import { Field, SectionHeading, dangerQuietButton, inputClass, primaryButton, quietButton, secondaryButton } from '@/tools/medrec/ui'

/**
 * /tools/medication-reconciliation
 *
 * One complete list of what a person takes — prescriptions, over-the-counter
 * products, supplements, herbals, alternative medicines — plus allergies and
 * caffeine, nicotine, alcohol and recreational substance use, with directions
 * written out in full (no sig shorthand, nothing from the ISMP do-not-use
 * list). For patients, clinicians and students alike.
 *
 * Privacy: the list never leaves the browser. It is kept in localStorage as a
 * working copy, saved and reopened as a CSV file (medrec/csv.ts), and printed
 * or saved as PDF through the browser's print dialog. The only network calls are
 * the public catalog fetch behind the name search and a one-time download of
 * the clinical lists (anticholinergic burden, QT risk, do not crush), which are
 * matched against the list in the browser (medrec/clinicalLists.ts).
 *
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │ Title · privacy note · Save / Open / Print / New list         │
 *   │ Name, date of birth · "Check before you finish" flags          │
 *   ├───────────────────────────────────────────────────────────────┤
 *   │ Allergies and intolerances                                    │
 *   │ Medications and products (editor + 13-column table)           │
 *   │ Substance use (four cards)                                    │
 *   │ Printable list  ← the only part that prints                   │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Logic lives in medrec/sig.ts and medrec/csv.ts (tested in
 * medrec/medrec.test.ts); these components only render it.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const TITLE = 'Medication reconciliation'

const today = () =>
  new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

type Notice = { tone: 'ok' | 'caution'; text: string }

export default function MedicationReconciliation() {
  const [state, setState] = useState<MedRecState>(() => loadSaved() ?? exampleState())
  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [confirmClear, setConfirmClear] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [clinical, setClinical] = useState<ClinicalIndex | null>(null)

  // The clinical lists are public and downloaded whole, so nothing about this
  // person's list is sent. If they fail to load, the tool works without them.
  useEffect(() => {
    let current = true
    loadClinicalIndex()
      .then(index => {
        if (current) setClinical(index)
      })
      .catch((err: unknown) => console.warn('[medrec] clinical lists unavailable', err))
    return () => {
      current = false
    }
  }, [])

  useEffect(() => {
    document.title = `${TITLE} · Pharmacy Commons`
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => saveWorking(state), [state])

  // Thirteen medication columns need a landscape sheet. The rule exists only
  // while this page is mounted, so other pages keep printing portrait.
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = '@page { size: landscape; margin: 12mm; }'
    document.head.appendChild(style)
    return () => style.remove()
  }, [])

  /** Any edit ends "example" mode: the list is now the user's. */
  const commit = (fn: (s: MedRecState) => MedRecState) => setState(s => ({ ...fn(s), example: false }))

  const patchMed = (id: string, patch: Partial<Medication>) =>
    commit(s => ({
      ...s,
      meds: s.meds.map(m => (m.id === id ? { ...m, ...patch } : m)),
    }))
  const changeForm = (id: string, form: Medication['form']) =>
    commit(s => ({
      ...s,
      meds: s.meds.map(m => (m.id === id ? applyFormDefaults({ ...m, form }) : m)),
    }))
  const patchAllergy = (id: string, patch: Partial<Allergy>) =>
    commit(s => ({
      ...s,
      allergies: s.allergies.map(a => (a.id === id ? { ...a, ...patch } : a)),
    }))

  const openEditor = (id: string | null) => {
    setOpenId(id)
    if (id) requestAnimationFrame(() => document.getElementById('med-editor')?.scrollIntoView({ block: 'start' }))
  }

  const addMedication = () => {
    const m = newMedication(filter === 'all' ? 'rx' : filter)
    commit(s => ({ ...s, meds: [...s.meds, m] }))
    setOpenId(m.id)
    requestAnimationFrame(() => {
      document.getElementById('med-editor')?.scrollIntoView({ block: 'start' })
      document.getElementById(`med-${m.id}-drug`)?.focus({ preventScroll: true })
    })
  }

  const removeMedication = (id: string) => {
    commit(s => ({ ...s, meds: s.meds.filter(m => m.id !== id) }))
    if (openId === id) setOpenId(null)
  }

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => setNotice({ tone: 'ok', text: 'Directions copied.' }),
      () =>
        setNotice({
          tone: 'caution',
          text: 'This browser blocked copying. Select the directions in the table and copy them instead.',
        }),
    )
  }

  const saveCsv = () => {
    const url = URL.createObjectURL(new Blob(['﻿', toCsv(state)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = csvFileName(state)
    a.click()
    URL.revokeObjectURL(url)
    setNotice({
      tone: 'ok',
      text: `Saved ${a.download}. Open it here later to continue where you left off.`,
    })
  }

  const openCsv = async (file: File | undefined) => {
    if (!file) return
    try {
      const { state: next, skipped } = fromCsv(await file.text())
      setState(next)
      setOpenId(null)
      setFilter('all')
      setNotice({
        tone: 'ok',
        text: `Opened ${file.name}: ${next.meds.length} medications and ${next.allergies.length} allergies.${
          skipped ? ` ${skipped} ${skipped === 1 ? 'row was' : 'rows were'} not recognized and left out.` : ''
        }`,
      })
    } catch (err) {
      setNotice({
        tone: 'caution',
        text: `Could not open ${file.name}. ${err instanceof Error ? err.message : 'The file could not be read as a CSV.'}`,
      })
    }
  }

  const clearAll = () => {
    setState(blankState())
    setOpenId(null)
    setFilter('all')
    setConfirmClear(false)
    setNotice(null)
  }

  const flags = reviewFlags(state, clinical)
  const dot = {
    warn: 'bg-rose-500',
    caution: 'bg-marigold-500',
    info: 'bg-sky-500',
  } as const

  return (
    <main data-print-page className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <header className="grid gap-5 pt-10 pb-8 sm:pt-14 print:hidden">
        <div>
          <Link to="/tools" className="mb-4 inline-block font-sans text-[13px] text-ink transition-colors">
            All tools
          </Link>
          <PageTitle
            title={TITLE}
            lede="Build one complete list of everything a person takes, plus allergies and substance use. Directions are written out in full, with no abbreviations, and every calculated amount is shown."
          />
        </div>

        <p className="lp-sunken flex max-w-[48rem] gap-2.5 rounded-md bg-sky-50 px-3.5 py-2.5 font-sans text-[14px] leading-relaxed text-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 shrink-0">
            <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <span>
            <b className="font-semibold">This list stays in this browser.</b> Nothing you enter is sent to Pharmacy Commons. To keep a copy or move it to
            another device, save it as a CSV file, then open that file here to continue later.
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={primaryButton} onClick={saveCsv}>
            Save as CSV
          </button>
          <button type="button" className={secondaryButton} onClick={() => fileRef.current?.click()}>
            Open a saved CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={e => {
              void openCsv(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <button type="button" className={secondaryButton} onClick={() => window.print()}>
            Print or save as PDF
          </button>
          {confirmClear ? (
            <span className="lp-raised inline-flex flex-wrap items-center gap-1.5 rounded-md bg-rose-50 py-1 pr-1 pl-3 font-sans text-[13px] text-ink">
              Clear the whole list?
              <button type="button" className={dangerQuietButton} onClick={clearAll}>
                Yes, clear it
              </button>
              <button type="button" className={quietButton} onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className={quietButton} onClick={() => setConfirmClear(true)}>
              Start a new list
            </button>
          )}
          {!state.example && (
            <button type="button" className={quietButton} onClick={() => setState(exampleState())}>
              Load the example list
            </button>
          )}
        </div>

        <div aria-live="polite" className="grid gap-2 empty:hidden">
          {state.example && (
            <p className="lp-sunken flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-sky-50 px-3.5 py-2.5 font-sans text-[14px] text-ink">
              <span>
                <b className="font-semibold">Example list.</b> These entries show how the tool works. They are not a real person's medications.
              </span>
              <button type="button" className={secondaryButton} onClick={clearAll}>
                Start a blank list
              </button>
            </p>
          )}
          {notice && (
            <p
              className={`lp-sunken rounded-md px-3.5 py-2.5 font-sans text-[14px] ${
                notice.tone === 'ok' ? 'text-ink' : 'bg-marigold-100 text-ink'
              }`}
            >
              {notice.text}
            </p>
          )}
        </div>

        <nav aria-label="Sections" className="flex flex-wrap gap-x-5 gap-y-1 border-y border-ink/15 py-2 font-sans text-[14px]">
          {[
            ['allergies', 'Allergies', state.allergies.length],
            ['medications', 'Medications', state.meds.length],
            ['substances', 'Substance use', null],
            ['printable', 'Printable list', null],
          ].map(([id, label, n]) => (
            <a key={String(id)} href={`#${id}`} className="text-ink hover:underline">
              {label}
              {n != null && <span className="ml-1 font-mono text-[11.5px] text-ink">{n}</span>}
            </a>
          ))}
        </nav>
      </header>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-10 print:hidden">
        <section aria-label="Person" className="grid gap-4">
          <div className="grid max-w-[40rem] gap-3 sm:grid-cols-2">
            <Field label="Name (optional)">
              <input value={state.name} onChange={e => commit(s => ({ ...s, name: e.target.value }))} autoComplete="off" className={inputClass} />
            </Field>
            <Field label="Date of birth (optional)">
              <input
                value={state.dob}
                onChange={e => commit(s => ({ ...s, dob: e.target.value }))}
                placeholder="for example, March 4, 1968"
                autoComplete="off"
                className={inputClass}
              />
            </Field>
          </div>
          {flags.length ? (
            <div className="lp-raised grid gap-2 rounded-md p-4">
              <p className="font-sans font-medium text-[12.5px] text-ink">Check before you finish · {flags.length}</p>
              <ul className="grid gap-1.5">
                {flags.map((f, i) => (
                  <li key={i} className="flex items-baseline gap-2.5 font-sans text-[14px] text-ink">
                    <span aria-hidden="true" className={`size-2 shrink-0 translate-y-[-1px] rounded-full ${dot[f.tone]}`} />
                    <span>
                      <span className="sr-only">{f.tone === 'warn' ? 'Warning: ' : f.tone === 'caution' ? 'Check: ' : 'Note: '}</span>
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="lp-sunken rounded-md px-3.5 py-2.5 font-sans text-[14px] text-ink">
              Nothing to review. Every entry has a strength and a reason for use, and allergies are recorded.
            </p>
          )}
        </section>

        <Allergies
          allergies={state.allergies}
          nkda={state.nkda}
          onNkda={nkda => commit(s => ({ ...s, nkda }))}
          onAdd={() =>
            commit(s => ({
              ...s,
              nkda: false,
              allergies: [...s.allergies, newAllergy()],
            }))
          }
          onPatch={patchAllergy}
          onRemove={id =>
            commit(s => ({
              ...s,
              allergies: s.allergies.filter(a => a.id !== id),
            }))
          }
        />

        <Medications
          meds={state.meds}
          openId={openId}
          filter={filter}
          onFilter={setFilter}
          onAdd={addMedication}
          onOpen={openEditor}
          onPatch={patchMed}
          onFormChange={changeForm}
          onRemove={removeMedication}
          onCopy={copy}
          clinical={clinical}
        />

        <Substances subs={state.subs} onChange={subs => commit(s => ({ ...s, subs }))} />
      </div>

      <section
        aria-labelledby="printable"
        className="mt-10 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 border-t border-ink/15 pt-8 print:mt-0 print:block print:border-0 print:pt-0"
      >
        <div className="print:hidden">
          <SectionHeading id="printable" title="Printable list" lede="This is what prints or saves as a PDF. It updates as you edit above." />
        </div>
        <PrintableList state={state} prepared={today()} clinical={clinical} />
      </section>

      <p className="mt-10 max-w-[48rem] font-sans text-[12.5px] leading-relaxed text-ink print:hidden">
        This tool helps organize information. It is not a medical record and does not replace review by a pharmacist or prescriber. Linked names go to the
        matching Pharmacy Commons record; names typed without a match are kept exactly as entered.
      </p>
    </main>
  )
}
