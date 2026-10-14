/**
 * Days supply and quantity — "Known packages" for the chosen medication.
 *
 * A dropdown of every product with curated packaging facts (packaging.ts) whose
 * facts match the form chosen; on request it fills in the Package fields. Every value it filled in is listed with
 * its source, and the fields stay editable. Renders nothing when there are no
 * facts to offer.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from 'react'
import PaperSelect from '@/components/PaperSelect'
import { Field, secondaryButton, selectClass } from '@/tools/medrec/ui'
import type { Basis, Pack } from './calc'
import { groupProducts, loadAllPackaging, packFromRows, type PackagingRow, type Provenance } from './packaging'

type Props = {
  basis: Basis | null
  onApply: (pack: Partial<Pack>) => void
}

export default function PackagingPicker({ basis, onApply }: Props) {
  const [rows, setRows] = useState<PackagingRow[]>([])
  const [choice, setChoice] = useState('')
  const [shown, setShown] = useState<Provenance[]>([])

  useEffect(() => {
    let live = true
    loadAllPackaging().then(r => {
      if (live) setRows(r)
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    setChoice('')
    setShown([])
  }, [basis])

  const groups = useMemo(() => groupProducts(rows).filter(g => g.basis === basis), [rows, basis])
  const picked = groups.find(g => g.key === choice)

  if (!groups.length) return null

  const apply = () => {
    if (!picked) return
    const r = packFromRows(picked.rows)
    onApply(r.pack)
    setShown(r.provenance)
  }

  return (
    <div className="lp-sunken grid gap-3 rounded-md px-4 py-3">
      <span className="font-sans text-[13.5px] text-ink">Products with known package facts</span>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="Product">
          <PaperSelect value={picked?.key ?? ''} onChange={v => { setChoice(v); setShown([]) }} className={selectClass}>
            <option value="">Choose a product…</option>
            {groups.map(g => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </PaperSelect>
        </Field>
        <button type="button" className={secondaryButton} onClick={apply} disabled={!picked}>
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
