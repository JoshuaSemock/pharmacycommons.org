/**
 * "Which record?" field for the Developers console. Accepts a PCID, number or
 * slug as typed, and suggests records by name through the API's own
 * /v1/search, so the console dogfoods the endpoint it documents.
 *
 * ARIA combobox (list autocomplete): arrow keys move, Enter picks, Escape closes.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useId, useRef, useState } from 'react'

type Hit = { pcid: string; name: string; entity_type: string; match?: { on: string; text?: string } }

type Props = {
  id: string
  value: string
  onChange: (v: string) => void
  apiBase: string
  /** Limit suggestions, e.g. to classes for /members. */
  types?: string
  placeholder?: string
  onEnter?: () => void
}

const TYPE_LABEL: Record<string, string> = {
  moiety: 'drug',
  combination: 'combination',
  class: 'class',
  precise_form: 'salt or form',
  formulation: 'brand product',
}

export default function RefPicker({ id, value, onChange, apiBase, types, placeholder, onEnter }: Props) {
  const listId = useId()
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const typed = useRef(false)

  useEffect(() => {
    const q = value.trim()
    // Don't search for something that already is an identifier.
    if (!typed.current || q.length < 2 || /^(PCID-)?\d{7,8}$/i.test(q) || q.includes(':')) {
      setHits([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      const url = `${apiBase}/v1/search?q=${encodeURIComponent(q)}&limit=8${types ? `&type=${types}` : ''}`
      fetch(url, { signal: ctrl.signal })
        .then(r => (r.ok ? r.json() : null))
        .then((j: { results?: Hit[] } | null) => {
          setHits(j?.results ?? [])
          setActive(-1)
        })
        .catch(() => undefined)
    }, 220)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [value, apiBase, types])

  const pick = (h: Hit) => {
    typed.current = false
    onChange(h.pcid)
    setOpen(false)
  }
  const show = open && hits.length > 0

  return (
    <div className="relative min-w-0">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={e => {
          typed.current = true
          onChange(e.target.value)
          setOpen(true)
        }}
        onKeyDown={e => {
          if (show && e.key === 'ArrowDown') {
            e.preventDefault()
            setActive(a => (a + 1) % hits.length)
          } else if (show && e.key === 'ArrowUp') {
            e.preventDefault()
            setActive(a => (a <= 0 ? hits.length - 1 : a - 1))
          } else if (e.key === 'Enter') {
            if (show && active >= 0) {
              e.preventDefault()
              pick(hits[active])
            } else if (!e.metaKey && !e.ctrlKey) onEnter?.()
          } else if (e.key === 'Escape') setOpen(false)
        }}
        className="w-full min-w-0 rounded-lg border border-mint-200 bg-white px-3 py-1.5 font-mono text-[13.5px] text-ink placeholder:font-sans placeholder:text-ink focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-ink/20"
      />
      {show && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-mint-200 bg-white py-1 shadow-lg">
          {hits.map((h, i) => (
            <li
              key={h.pcid}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={e => {
                e.preventDefault()
                pick(h)
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 font-sans text-[13.5px] ${i === active ? 'bg-hepatica-100 text-ink' : 'text-ink'}`}
            >
              <span className="min-w-0 truncate">
                {h.name}
                {h.match?.on === 'brand' && h.match.text && <span className="text-ink"> · {h.match.text}</span>}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink">
                {TYPE_LABEL[h.entity_type] ?? h.entity_type} · {h.pcid}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
