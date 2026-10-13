/**
 * Days supply and quantity — "Known packages" for the chosen medication.
 *
 * Reads curated packaging facts (packaging.ts) for the medication picked in the
 * name field, offers the products whose facts match the form chosen, and on
 * request fills in the Package fields. Every value it filled in is listed with
 * its source, and the fields stay editable. Renders nothing when there are no
 * facts to offer.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from 'react'
import PaperSelect from '@/components/PaperSelect'
import { Field, secondaryButton, selectClass } from '@/tools/medrec/ui'
import type { Basis, Pack } from './calc'
import { groupProducts, loadPackaging, packFromRows, type PackagingRow, type Provenance } from './packaging'

type Props = {
  pcid: number | null
  basis: Basis | null
  onApply: (pack: Partial<Pack>) => void
}

export default function PackagingPicker({ pcid, basis, onApply }: Props) {
  const [rows, setRows] = useState<PackagingRow[]>([])
  const [choice, setChoice] = useState('')
  const [shown, setShown] = useState<Provenance[]>([])

  useEffect(() => {
    let live = true
    setRows([])
    setShown([])
    if (pcid != null) {
      loadPackaging(pcid).then(r => {
        if (live) setRows(r)
      })
    }
    return () => {
      live = false
    }
  }, [pcid])

  const groups = useMemo(() => groupProducts(rows).filter(g => g.basis === basis), [rows, basis])
  const picked = groups.find(g => g.key === choice) ?? groups[0]

  if (!groups.length || !picked) return null

  const apply = () => {
    const r = packFromRows(picked.rows)
    onApply(r.pack)
    setShown(r.provenance)
  }

  return (
    <div className="lp-sunken grid gap-3 rounded-md px-4 py-3">
      <span className="font-sans text-[13.5px] text-ink">Package facts on file for this medication</span>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="Product">
          <PaperSelect value={picked.key} onChange={setChoice} className={selectClass}>
            {groups.map(g => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </PaperSelect>
        </Field>
        <button type="button" className={secondaryButton} onClick={apply}>
          Fill in the package
        </button>
      </div>
      {shown.length > 0 && (
        <ul aria-live="polite" className="grid gap-1 font-sans text-[12.5px] leading-snug text-ink">
          {shown.map(p => (
            <li key={p.field}>
              {p.field}: {p.value}. {p.source}
              {', '}
              {p.url ? (
                <a href={p.url} target="_blank" rel="noopener" className="text-ink underline decoration-foil underline-offset-2 hover:decoration-2">
                  {p.sourceName}
                </a>
              ) : (
                p.sourceName
              )}
              {p.checked ? `, checked ${p.checked}` : ''}.
            </li>
          ))}
          <li>Check these against the package in hand. Any field can be changed.</li>
        </ul>
      )}
    </div>
  )
}
