import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import PaperSelect from './PaperSelect'
import type { SelectOption } from './PaperSelect'
import { PopoverParent, UpDownIcon, useOutsidePress, usePopoverPlacement, useRegisterWithParent } from './popover'

/**
 * A letterpress date picker (2026-10-02). Replaces <input type="date">,
 * whose calendar is drawn by the browser in its own (blue) colors.
 *
 * Colorless by rule. The trigger is raised and presses in while open; the
 * calendar is a floating scrap of paper with its grain. Day tiles sit flat,
 * lift (emboss) under the pointer or keyboard, and the chosen day is pressed
 * into the sheet (deboss). Today carries a small ink dot. Days outside the
 * month are printed lighter. Month and year are PaperSelects, so a date of
 * birth decades back is two picks, not dozens of clicks.
 *
 * `value` and `onChange` use ISO dates ('YYYY-MM-DD', '' for none), the same
 * strings a native date input produces, so callers keep their parsing.
 *
 * Keyboard (grid): ← → ↑ ↓ move a day / week, Home End to the week's ends,
 * PageUp PageDown a month (Shift: a year), Enter or Space picks, Escape
 * closes.
 */

interface PaperDatePickerProps {
  value: string
  onChange: (isoDate: string) => void
  /** Earliest / latest selectable date, ISO. */
  min?: string
  max?: string
  /** Year menu range; defaults to min/max, else 1900 to ten years ahead. */
  minYear?: number
  maxYear?: number
  placeholder?: string
  /** Offer a Clear button (default true). */
  clearable?: boolean
  id?: string
  disabled?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
  /** Layout and type for the trigger (width, font size). */
  className?: string
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = [['Su', 'Sunday'], ['Mo', 'Monday'], ['Tu', 'Tuesday'], ['We', 'Wednesday'], ['Th', 'Thursday'], ['Fr', 'Friday'], ['Sa', 'Saturday']] as const

interface Ymd { y: number; m: number; d: number }

export default function PaperDatePicker({
  value,
  onChange,
  min,
  max,
  minYear,
  maxYear,
  placeholder = 'Pick a date',
  clearable = true,
  id,
  disabled = false,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  className = '',
}: PaperDatePickerProps) {
  const autoId = useId()
  const gridId = `${autoId}-grid`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const selected = parseIso(value)
  const today = todayYmd()
  const minD = parseIso(min ?? '')
  const maxD = parseIso(max ?? '')
  const yearFrom = minYear ?? minD?.y ?? 1900
  const yearTo = maxYear ?? maxD?.y ?? today.y + 10

  const [open, setOpen] = useState(false)
  // The keyboard cursor; the month on show is always the cursor's month.
  const [cursor, setCursor] = useState<Ymd>(() => selected ?? today)

  const [children] = useState(() => new Set<HTMLElement>())
  const registerChild = useCallback((el: HTMLElement) => {
    children.add(el)
    return () => {
      children.delete(el)
    }
  }, [children])

  const { style } = usePopoverPlacement(open, triggerRef, panelRef, { matchWidth: false, minWidth: 288, preferredHeight: 400 })
  useRegisterWithParent(open, panelRef)

  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }, [])
  const closeQuietly = useCallback(() => close(false), [close])
  useOutsidePress(open, [triggerRef, panelRef], children, closeQuietly)

  function openCalendar() {
    if (disabled) return
    setCursor(clamp(selected ?? today, minD, maxD))
    setOpen(true)
  }

  // Focus the cursor's day when the calendar opens.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => focusDay(gridRef.current))
    return () => cancelAnimationFrame(frame)
  }, [open])

  const isDisabled = (d: Ymd) => (minD != null && cmp(d, minD) < 0) || (maxD != null && cmp(d, maxD) > 0)

  function pick(d: Ymd) {
    if (isDisabled(d)) return
    onChange(toIso(d))
    close(true)
  }

  function moveTo(next: Ymd) {
    setCursor(clamp(next, minD, maxD))
    requestAnimationFrame(() => focusDay(gridRef.current))
  }

  function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
    const c = cursor
    const step: Record<string, () => Ymd> = {
      ArrowLeft: () => addDays(c, -1),
      ArrowRight: () => addDays(c, 1),
      ArrowUp: () => addDays(c, -7),
      ArrowDown: () => addDays(c, 7),
      Home: () => addDays(c, -weekday(c)),
      End: () => addDays(c, 6 - weekday(c)),
      PageUp: () => addMonths(c, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(c, e.shiftKey ? 12 : 1),
    }
    if (step[e.key]) {
      e.preventDefault()
      moveTo(step[e.key]())
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(c)
    }
  }

  function onPanelKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    }
  }

  const weeks = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor.y, cursor.m])

  const monthOptions: SelectOption[] = MONTHS.map((label, i) => ({ value: String(i), label }))
  const yearOptions: SelectOption[] = useMemo(() => {
    const out: SelectOption[] = []
    for (let y = yearTo; y >= yearFrom; y--) out.push({ value: String(y), label: String(y) })
    return out
  }, [yearFrom, yearTo])

  const prevMonth = addMonths({ ...cursor, d: 1 }, -1)
  const nextMonth = addMonths({ ...cursor, d: 1 }, 1)
  const canPrev = !minD || cmp({ ...prevMonth, d: daysIn(prevMonth.y, prevMonth.m) }, minD) >= 0
  const canNext = !maxD || cmp(nextMonth, maxD) <= 0

  const sizeClass = /\btext-(\[|2?xs|sm|md|base|lg|xl)/.test(className) ? '' : 'text-[14px]'
  const navButton =
    'lp-raised lp-press flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
  const footButton =
    'lp-raised lp-press rounded-md px-3 py-1 font-sans text-[12.5px] font-medium text-ink disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ? `${ariaLabel}${selected ? `, ${longDate(selected)}` : ''}` : undefined}
        aria-labelledby={ariaLabelledBy}
        onClick={() => (open ? close(false) : openCalendar())}
        onKeyDown={e => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            openCalendar()
          }
        }}
        className={[
          'lp-toggle inline-flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md bg-transparent px-3 py-1.5 text-left font-sans text-ink',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40',
          'disabled:cursor-default disabled:opacity-50',
          sizeClass,
          className,
        ].join(' ')}
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarIcon />
          <span className="min-w-0 truncate">{selected ? longDate(selected) : placeholder}</span>
        </span>
        <UpDownIcon />
      </button>

      {open &&
        createPortal(
          <PopoverParent.Provider value={registerChild}>
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="false"
              aria-label={`Choose ${ariaLabel ? ariaLabel.toLowerCase() : 'a date'}`}
              style={style}
              onKeyDown={onPanelKey}
              className="lp-popover pc-grain z-[70] w-[18.5rem] overflow-y-auto rounded-lg bg-paper p-3 font-sans text-ink"
            >
              <div className="mb-3 flex items-center gap-1.5">
                <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => moveTo(addMonths(cursor, -1))} className={navButton}>
                  <Chevron dir="left" />
                </button>
                <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
                  <PaperSelect
                    value={String(cursor.m)}
                    onChange={v => setCursor(c => clamp({ ...c, m: Number(v), d: Math.min(c.d, daysIn(c.y, Number(v))) }, minD, maxD))}
                    options={monthOptions}
                    searchable={false}
                    aria-label="Month"
                    menuMinWidth={150}
                    className="min-w-0 flex-1 px-2 py-1 text-[13px] font-medium"
                  />
                  <PaperSelect
                    value={String(cursor.y)}
                    onChange={v => setCursor(c => clamp({ ...c, y: Number(v), d: Math.min(c.d, daysIn(Number(v), c.m)) }, minD, maxD))}
                    options={yearOptions}
                    searchable={yearOptions.length > 24}
                    searchPlaceholder="Year"
                    aria-label="Year"
                    menuMinWidth={110}
                    className="w-[5.25rem] shrink-0 px-2 py-1 text-[13px] font-medium"
                  />
                </div>
                <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => moveTo(addMonths(cursor, 1))} className={navButton}>
                  <Chevron dir="right" />
                </button>
              </div>

              <div role="grid" id={gridId} ref={gridRef} aria-label={`${MONTHS[cursor.m]} ${cursor.y}`} onKeyDown={onGridKey}>
                <div role="row" className="mb-1 grid grid-cols-7">
                  {WEEKDAYS.map(([short, full]) => (
                    <span key={short} role="columnheader" aria-label={full} className="py-1 text-center text-[11.5px] font-medium text-ink">
                      {short}
                    </span>
                  ))}
                </div>
                {weeks.map(week => (
                  <div role="row" key={toIso(week[0])} className="grid grid-cols-7 gap-1 pb-1">
                    {week.map(day => {
                      const inMonth = day.m === cursor.m
                      const isSel = selected != null && cmp(day, selected) === 0
                      const isToday = cmp(day, today) === 0
                      const isCursor = cmp(day, cursor) === 0
                      const off = isDisabled(day)
                      return (
                        <span role="gridcell" key={toIso(day)} aria-selected={isSel}>
                          <button
                            type="button"
                            tabIndex={isCursor ? 0 : -1}
                            data-cursor={isCursor || undefined}
                            disabled={off}
                            aria-label={`${longDate(day)}${isToday ? ', today' : ''}`}
                            aria-pressed={isSel}
                            aria-current={isToday ? 'date' : undefined}
                            onClick={() => pick(day)}
                            onFocus={() => !isCursor && setCursor(day)}
                            className={[
                              'relative flex h-9 w-full items-center justify-center rounded-md font-sans text-[13px] text-ink tabular-nums',
                              'transition-shadow duration-150 motion-reduce:transition-none outline-none',
                              // Every pickable day is a stamped key (.lp-toggle:
                              // pressed in under the pointer and when chosen via
                              // aria-pressed); days you can't pick lie flat.
                              off ? 'cursor-default opacity-25 font-normal' : 'lp-toggle',
                              isSel ? 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink/40' : '',
                              !inMonth && !isSel && !off ? 'opacity-40' : '',
                            ].join(' ')}
                          >
                            {day.d}
                            {isToday && <span aria-hidden="true" className="absolute bottom-1 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-current" />}
                          </button>
                        </span>
                      )
                    })}
                  </div>
                ))}
              </div>

              <div className="lp-rule-t mt-2 flex items-center justify-between gap-2 pt-3">
                <button type="button" disabled={isDisabled(today)} onClick={() => pick(today)} className={footButton}>
                  Today
                </button>
                {clearable && value && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange('')
                      close(true)
                    }}
                    className={footButton}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </PopoverParent.Provider>,
          document.body,
        )}
    </>
  )
}

function focusDay(grid: HTMLElement | null) {
  grid?.querySelector<HTMLButtonElement>('button[data-cursor]')?.focus({ preventScroll: true })
}

function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-ink">
      <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 6.5H14M5.5 1.75V4M10.5 1.75V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d={dir === 'left' ? 'M7.5 2.5L4 6L7.5 9.5' : 'M4.5 2.5L8 6L4.5 9.5'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ---------------------------------------------------------- date helpers */
/* Plain calendar arithmetic on {y, m (0-11), d}; never a Date in UTC, so a
   date can't slip a day across a time-zone boundary. */

export function parseIso(s: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  if (mo < 0 || mo > 11 || d < 1 || d > daysIn(y, mo)) return null
  return { y, m: mo, d }
}

export function toIso({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function todayYmd(): Ymd {
  const t = new Date()
  return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }
}

function daysIn(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}

function weekday({ y, m, d }: Ymd): number {
  return new Date(y, m, d).getDay()
}

function cmp(a: Ymd, b: Ymd): number {
  return a.y - b.y || a.m - b.m || a.d - b.d
}

function clamp(d: Ymd, lo: Ymd | null, hi: Ymd | null): Ymd {
  if (lo && cmp(d, lo) < 0) return lo
  if (hi && cmp(d, hi) > 0) return hi
  return d
}

export function addDays({ y, m, d }: Ymd, n: number): Ymd {
  const t = new Date(y, m, d + n)
  return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }
}

export function addMonths({ y, m, d }: Ymd, n: number): Ymd {
  const total = y * 12 + m + n
  const ny = Math.floor(total / 12)
  const nm = total - ny * 12
  return { y: ny, m: nm, d: Math.min(d, daysIn(ny, nm)) }
}

/** Whole weeks (Sunday first) covering the month: 4 to 6 rows of 7. */
export function monthGrid(y: number, m: number): Ymd[][] {
  const first = { y, m, d: 1 }
  let day = addDays(first, -weekday(first))
  const weeks: Ymd[][] = []
  do {
    const week: Ymd[] = []
    for (let i = 0; i < 7; i++) {
      week.push(day)
      day = addDays(day, 1)
    }
    weeks.push(week)
  } while (day.m === m)
  return weeks
}

function longDate(d: Ymd): string {
  return `${MONTHS[d.m]} ${d.d}, ${d.y}`
}
