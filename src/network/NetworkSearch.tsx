/**
 * Concept search for the Network page: a combobox over drugs, brands, topics and
 * classifications. Several matches are listed, never silently collapsed to one.
 * Keyboard: ↓ ↑ move, Enter picks, Escape closes. Letterpress field and
 * popover, as in the header search (docs/design-system.md §6).
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { searchConcepts } from './api'
import type { SearchHit } from './api'

type Props = {
  onPick: (hit: SearchHit) => void
  disabled?: boolean
}

export default function NetworkSearch({ onPick, disabled }: Props) {
  const [text, setText] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const listId = useId()
  const seq = useRef(0)

  // Debounced lookup; a slower earlier answer never overwrites a newer one.
  useEffect(() => {
    const q = text.trim()
    if (q.length < 2) {
      setHits([])
      setState('idle')
      return
    }
    const mine = ++seq.current
    setState('loading')
    const t = window.setTimeout(() => {
      searchConcepts(q)
        .then(r => {
          if (mine !== seq.current) return
          setHits(r)
          setActive(0)
          setState('idle')
        })
        .catch(() => {
          if (mine === seq.current) setState('error')
        })
    }, 160)
    return () => window.clearTimeout(t)
  }, [text])

  const pick = (hit: SearchHit | undefined) => {
    if (!hit) return
    setOpen(false)
    setText('')
    setHits([])
    onPick(hit)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive(i => Math.min(i + 1, Math.max(hits.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && hits[active]) {
        e.preventDefault()
        pick(hits[active])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && text.trim().length >= 2

  return (
    <div className="relative">
      <label htmlFor={`${listId}-input`} className="mb-1 block font-sans text-[13px] text-ink">
        Start from a drug, class, condition or target
      </label>
      <div className="lp-field lp-foil rounded-md">
        <input
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-expanded={showList && hits.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && hits.length > 0 && hits[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={text}
          placeholder="Try metformin, acetazolamide or a class name"
          onChange={e => {
            setText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="block w-full rounded-md bg-transparent px-3 py-2 font-sans text-ink placeholder:text-ink/60 focus:outline-none"
        />
      </div>
      {showList && hits.length === 0 && (
        <div role="status" className="lp-popover pc-grain absolute left-0 right-0 z-20 mt-1 rounded-lg bg-paper px-3 py-2 text-[13px] text-ink">
          {state === 'error'
            ? 'Search could not load. Try again in a moment.'
            : state === 'loading'
              ? 'Searching…'
              : 'No matches. Try another spelling or a brand name.'}
        </div>
      )}
      {showList && hits.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching concepts"
          className="lp-popover pc-grain absolute left-0 right-0 z-20 mt-1 max-h-80 overflow-auto rounded-lg bg-paper p-1"
        >
          {hits.map((h, i) => (
            <li
              key={h.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              data-active={i === active}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(h)}
              className="lp-option flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-3 py-2 font-sans text-[14px] text-ink"
            >
              <span className="min-w-0 truncate">{h.name}</span>
              <span className="shrink-0 text-[12px]">{h.hint}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
