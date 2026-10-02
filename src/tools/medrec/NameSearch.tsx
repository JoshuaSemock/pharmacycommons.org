/**
 * Name field that searches the Pharmacy Commons catalog as you type.
 *
 * Picking a match records its PCID, so the entry links to the drug's page and
 * duplicate and allergy checks can match by record rather than by spelling.
 * Free text is always accepted: many supplements, herbals and allergens are
 * not in the catalog, and a name that isn't found is still a valid entry.
 * Typing after a pick clears the PCID, because the text no longer names that
 * record.
 *
 * ARIA combobox pattern (list autocomplete): arrow keys move, Enter picks,
 * Escape closes.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useId, useMemo, useState } from 'react'
import { loadCatalog, searchCatalog } from '@/catalog'
import { formatBrandName, formatDrugName } from '@/names'
import { inputClass } from './ui'

type Option = { key: string; label: string; detail?: string; pcid: number | null }

type Props = {
  id: string
  value: string
  pcid: number | null
  onChange: (name: string, pcid: number | null) => void
  placeholder?: string
  /** Offered before catalog matches (drug classes, non-drug allergens, street names). */
  suggestions?: readonly string[]
  /** Whether to search the drug catalog at all. */
  catalog?: boolean
}

export default function NameSearch({ id, value, pcid, onChange, placeholder, suggestions = [], catalog = true }: Props) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [ready, setReady] = useState(false)

  // The catalog is cached for the session; the first focus starts the fetch.
  const warm = () => {
    if (!catalog || ready) return
    loadCatalog()
      .then(() => setReady(true))
      .catch(() => setReady(false))
  }

  const options = useMemo<Option[]>(() => {
    const q = value.trim().toLowerCase()
    if (q.length < 2) return []
    const extra = suggestions
      .filter(s => s.toLowerCase().includes(q))
      .slice(0, 4)
      .map(s => ({ key: `s:${s}`, label: s, pcid: null }))
    const found =
      catalog && ready
        ? searchCatalog(value, 8)
            .filter(e => e.type === 0)
            .map(e => ({
              key: `c:${e.n}`,
              label: formatDrugName(e.name),
              detail: e.matchedBrand ? `matched ${formatBrandName(e.matchedBrand)}` : undefined,
              pcid: e.n,
            }))
        : []
    return [...extra, ...found].slice(0, 10)
  }, [value, suggestions, catalog, ready])

  useEffect(() => setActive(-1), [value])

  const pick = (o: Option) => {
    onChange(o.label, o.pcid)
    setOpen(false)
  }

  const showList = open && options.length > 0

  return (
    <div className="relative min-w-0">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onFocus={() => {
          warm()
          setOpen(true)
        }}
        onBlur={() => setOpen(false)}
        onChange={e => {
          onChange(e.target.value, null)
          setOpen(true)
        }}
        onKeyDown={e => {
          if (!showList) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive(a => (a + 1) % options.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive(a => (a <= 0 ? options.length - 1 : a - 1))
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault()
            pick(options[active])
          } else if (e.key === 'Escape') setOpen(false)
        }}
        className={inputClass}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="lp-popover pc-grain absolute left-0 right-0 top-full z-30 mt-1.5 grid max-h-72 content-start gap-0.5 overflow-y-auto rounded-lg bg-paper p-1.5"
        >
          {options.map((o, i) => (
            <li
              key={o.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              data-autocomplete=""
              data-active={i === active || undefined}
              // mousedown, not click: fires before the input's blur closes the list
              onMouseDown={e => {
                e.preventDefault()
                pick(o)
              }}
              onMouseEnter={() => setActive(i)}
              className="lp-option flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-3 py-1.5 font-sans text-[13.5px] text-ink"
            >
              <span className="min-w-0 truncate">{o.label}</span>
              <span className="shrink-0 font-mono text-[10.5px] text-ink">{o.pcid ? `PCID-${o.pcid}` : (o.detail ?? '')}</span>
            </li>
          ))}
        </ul>
      )}
      {pcid != null && (
        <p className="mt-1 font-sans text-[12px] text-ink">
          Linked to{' '}
          <a
            href={`/id/PCID-${pcid}`}
            target="_blank"
            rel="noopener"
            title="Opens the Pharmacy Commons record in a new tab"
            className="font-mono text-ink underline decoration-hepatica-300 underline-offset-2 hover:decoration-hepatica-600"
          >
            PCID-{pcid}
          </a>
        </p>
      )}
    </div>
  )
}
