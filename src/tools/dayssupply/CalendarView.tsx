/**
 * Days supply and quantity — scrollable calendar. Opens on today with 5 weeks
 * before and 6 after, and keeps adding weeks as it is scrolled. The start date
 * is today unless changed; clicking another date highlights the dates between
 * and counts the days. "Count days" runs the other way: N days before or after
 * the start date, drawn on the calendar. Date logic is in calendar.ts.
 * Selected dates are foil mint like the search bars (.lp-foil-set): ends raised, dates between pressed in.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import PaperDatePicker from '@/components/PaperDatePicker'
import Stamp from '@/components/Stamp'
import { fmt, num } from '@/tools/medrec/sig'
import { ChipRadio, Field, numberClass, quietButton, selectClass } from '@/tools/medrec/ui'
import { addDays, daysBetween, longDate } from './calc'
import { MONTHS, WEEKDAYS, buildWeeks, dayWord, initialSpan, offsetDate, weekStart, roleOf, spanOf, weeksText, type CellRole, type Direction } from './calendar'

type Mode = 'pick' | 'count'

const PRESETS = ['28', '30', '60', '84', '90'] as const
const EXTEND = 8 // weeks added when the edge is reached
const EDGE = 96 // px from the edge that triggers it

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`
}

function Cell({ iso, role, isToday, onPick }: { iso: string; role: CellRole; isToday: boolean; onPick: (iso: string) => void }) {
  const d = Number(iso.slice(8))
  const m = Number(iso.slice(5, 7))
  const tone =
    role === 'start' || role === 'end'
      ? 'lp-raised lp-foil-set font-semibold'
      : role === 'between'
        ? 'lp-sunken lp-foil-set'
        : 'lp-press'
  return (
    <button
      type="button"
      data-iso={iso}
      aria-label={`${longDate(iso)}${isToday ? ', today' : ''}${role === 'start' ? ', start' : role === 'end' ? ', end' : role === 'between' ? ', in range' : ''}`}
      aria-pressed={role === 'start' || role === 'end'}
      onClick={() => onPick(iso)}
      className={`${tone} relative grid h-12 min-w-0 content-center justify-items-center rounded-md font-sans text-[13.5px] leading-none text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30`}
    >
      {d === 1 && <span className="absolute left-1 top-0.5 font-sans text-[9.5px] leading-none text-ink">{MONTHS[m - 1].slice(0, 3)}</span>}
      <span className={isToday ? 'underline decoration-2 underline-offset-4' : ''}>{d}</span>
      {role === 'start' || role === 'end' ? (
        <span className="absolute bottom-0.5 font-sans text-[9px] leading-none text-ink">{role}</span>
      ) : (
        isToday && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-ink" aria-hidden />
      )}
    </button>
  )
}

export default function CalendarView({ today, daysSupply, onToday }: { today: string; daysSupply: number | null; onToday?: () => void }) {
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('pick')
  const [direction, setDirection] = useState<Direction>('before')
  const [n, setN] = useState('90')

  const [span, setSpan] = useState(() => initialSpan(today))
  const weeks = buildWeeks(span.start, span.weeks)
  const box = useRef<HTMLDivElement>(null)
  const pendingPrepend = useRef<number | null>(null) // scrollHeight before a prepend
  const centered = useRef(false)

  // First paint: put the current week a little below the top so the weeks before it show.
  useLayoutEffect(() => {
    const el = box.current
    if (!el || centered.current) return
    const row = el.querySelector<HTMLElement>(`[data-iso="${today}"]`)
    if (row) {
      el.scrollTop = Math.max(0, row.offsetTop - el.clientHeight / 2 + row.clientHeight / 2)
      centered.current = true
    }
  }, [today])

  // After weeks are added above, keep what the reader was looking at in place.
  useLayoutEffect(() => {
    const el = box.current
    if (el && pendingPrepend.current != null) {
      el.scrollTop += el.scrollHeight - pendingPrepend.current
      pendingPrepend.current = null
    }
  }, [span.start])

  const onScroll = useCallback(() => {
    const el = box.current
    if (!el || pendingPrepend.current != null) return
    if (el.scrollTop < EDGE) {
      pendingPrepend.current = el.scrollHeight
      setSpan(s => ({ start: addDays(s.start, -7 * EXTEND) ?? s.start, weeks: s.weeks + EXTEND }))
    } else if (el.scrollHeight - el.scrollTop - el.clientHeight < EDGE) {
      setSpan(s => ({ ...s, weeks: s.weeks + EXTEND }))
    }
  }, [])

  const nWhole = (() => {
    const v = num(n)
    return v != null && Number.isInteger(v) && v >= 0 ? v : null
  })()
  const counted = mode === 'count' && nWhole != null ? offsetDate(start, direction, nWhole) : null
  const other = mode === 'count' ? counted : end
  const range = other ? spanOf(start, other) : null

  const pick = (iso: string) => {
    setMode('pick')
    setEnd(iso === start ? null : iso)
  }
  const changeStart = (iso: string) => {
    const next = iso || today
    setStart(next)
    // Make sure the new start date is on the calendar.
    setSpan(s => {
      const last = addDays(s.start, s.weeks * 7 - 1) ?? s.start
      if (next >= s.start && next <= last) return s
      return initialSpan(next)
    })
    centered.current = false
    if (end === next) setEnd(null)
  }
  // Re-center after the span was rebuilt around a new start date.
  useLayoutEffect(() => {
    const el = box.current
    if (!el || centered.current) return
    const cell = el.querySelector<HTMLElement>(`[data-iso="${start}"]`)
    if (cell) {
      el.scrollTop = Math.max(0, cell.offsetTop - el.clientHeight / 2 + cell.clientHeight / 2)
      centered.current = true
    }
  })
  // Bring a date that was just worked out (or picked in the date field) into view.
  const [focusIso, setFocusIso] = useState<string | null>(null)
  const showDate = useCallback((iso: string | null) => {
    if (!iso) return
    setSpan(s => {
      const last = addDays(s.start, s.weeks * 7 - 1) ?? s.start
      if (iso >= s.start && iso <= last) return s
      if (iso < s.start) {
        const first = addDays(weekStart(iso), -7 * 2) ?? iso
        return { start: first, weeks: s.weeks + Math.round((daysBetween(first, s.start) ?? 0) / 7) }
      }
      return { ...s, weeks: s.weeks + Math.ceil((daysBetween(last, iso) ?? 0) / 7) + 2 }
    })
    setFocusIso(iso)
  }, [])
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !focusIso) return
    const cell = el.querySelector<HTMLElement>(`[data-iso="${focusIso}"]`)
    if (cell) el.scrollTop = Math.max(0, cell.offsetTop - el.clientHeight / 2 + cell.clientHeight / 2)
    pendingPrepend.current = null
    setFocusIso(null)
  }, [focusIso, span])
  useEffect(() => {
    if (mode === 'count') showDate(counted)
  }, [mode, counted, showDate])
  const reset = () => {
    setEnd(null)
    setMode('pick')
    changeStart(today)
    onToday?.()
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
      <div className="grid min-w-0 content-start gap-3">
        <div className="lp-sunken min-w-0 rounded-md p-1.5">
          <div className="grid grid-cols-7 gap-1 px-0.5 pb-1.5 pt-1" aria-hidden>
            {WEEKDAYS.map(w => (
              <span key={w} className="text-center font-sans text-[11.5px] text-ink">
                {w}
              </span>
            ))}
          </div>
          <div
            ref={box}
            onScroll={onScroll}
            role="group"
            aria-label="Calendar, scrolls forward and back"
            tabIndex={-1}
            className="relative grid max-h-[22rem] gap-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin]"
          >
            {weeks.map(week => (
              <div key={week[0]} className="grid grid-cols-7 gap-1">
                {week.map(iso => (
                  <Cell key={iso} iso={iso} role={roleOf(iso, start, other)} isToday={iso === today} onPick={pick} />
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="font-sans text-[12.5px] leading-snug text-ink">
          Click a date to count the days from {start === today ? 'today' : shortDate(start)}. Click another to move the end. Scroll for more weeks.
        </p>
      </div>

      <div className="grid min-w-0 content-start gap-4">
        <ChipRadio
          name="ds-cal-mode"
          label="How to use the calendar"
          value={mode}
          options={[
            ['pick', 'Pick a date'],
            ['count', 'Count days from the start'],
          ]}
          onChange={setMode}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start date" hint={start === today ? 'Today.' : undefined}>
            <PaperDatePicker aria-label="Start date" value={start} onChange={changeStart} clearable={false} className={selectClass} />
          </Field>
          {mode === 'count' && (
            <Field label="Number of days">
              <input
                aria-label="Number of days"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={n}
                onChange={e => setN(e.target.value)}
                className={`${numberClass} max-w-[10rem]`}
              />
            </Field>
          )}
        </div>
        {mode === 'count' && (
          <div className="grid gap-3">
            <ChipRadio
              name="ds-cal-dir"
              label="Before or after the start date"
              value={direction}
              options={[
                ['before', 'Before the start date'],
                ['after', 'After the start date'],
              ]}
              onChange={setDirection}
            />
            <ChipRadio
              name="ds-cal-n"
              label="Common numbers of days"
              value={(PRESETS as readonly string[]).includes(n) ? n : daysSupply != null && String(daysSupply) === n ? 'supply' : ''}
              options={[...PRESETS.map(p => [p, p] as const), ...(daysSupply != null && !(PRESETS as readonly string[]).includes(String(daysSupply)) ? ([['supply', `${fmt(daysSupply)} (days supply)`]] as const) : [])]}
              onChange={v => setN(v === 'supply' && daysSupply != null ? String(daysSupply) : v)}
            />
          </div>
        )}

        <div aria-live="polite" className="lp-sunken grid min-w-0 content-start gap-3 rounded-md p-4 sm:p-5">
          {mode === 'count' ? (
            counted && nWhole != null ? (
              <>
                <div className="grid min-w-0 gap-1">
                  <span className="font-sans text-[12.5px] text-ink">
                    {fmt(nWhole)} {dayWord(nWhole)} {direction} {start === today ? 'today' : shortDate(start)}
                  </span>
                  <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="[overflow-wrap:anywhere] text-[22px] leading-tight text-ink" style={{ fontFamily: 'var(--font-display)' }}>
                      {longDate(counted)}
                    </span>
                  </span>
                </div>
                <p className="font-sans text-[13px] leading-snug text-ink">
                  {direction === 'before'
                    ? `A fill dated after ${shortDate(counted)} is less than ${fmt(nWhole)} ${dayWord(nWhole)} before ${shortDate(start)}, so a refill then is early for a ${fmt(nWhole)}-day supply. A fill on ${shortDate(counted)} or earlier has gone the full ${fmt(nWhole)} ${dayWord(nWhole)}.`
                    : `A ${fmt(nWhole)}-day supply started on ${shortDate(start)} covers through ${shortDate(addDays(counted, -1) ?? counted)}; the next fill is due ${shortDate(counted)}.`}
                </p>
                <p className="border-t border-dashed border-ink/15 pt-3 font-mono text-[12.5px] leading-snug text-ink">
                  {longDate(start)} {direction === 'before' ? '−' : '+'} {fmt(nWhole)} {dayWord(nWhole)} = {longDate(counted)}
                </p>
              </>
            ) : (
              <p className="font-sans text-[14px] text-ink">Enter a whole number of days.</p>
            )
          ) : range ? (
            <>
              <div className="grid min-w-0 gap-1">
                <span className="font-sans text-[12.5px] text-ink">
                  {shortDate(start)} to {shortDate(other as string)}
                </span>
                <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span className="text-[22px] leading-tight text-ink" style={{ fontFamily: 'var(--font-display)' }}>
                    {fmt(range.days)} {dayWord(range.days)}
                  </span>
                  {weeksText(range.days) && <Stamp>{weeksText(range.days)}</Stamp>}
                </span>
                <span className="font-sans text-[12.5px] leading-snug text-ink">
                  {range.backwards ? `${longDate(other as string)} is before the start date.` : `${longDate(other as string)} is after the start date.`} The start day is not counted.
                </span>
              </div>
              <p className="border-t border-dashed border-ink/15 pt-3 font-mono text-[12.5px] leading-snug text-ink">
                {longDate(range.end)} − {longDate(range.start)} = {fmt(range.days)} {dayWord(range.days)}
              </p>
            </>
          ) : (
            <p className="font-sans text-[14px] text-ink">Click a date on the calendar to count the days from {start === today ? 'today' : shortDate(start)}.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={quietButton} onClick={reset}>
            Back to today
          </button>
          {end && mode === 'pick' && (
            <button type="button" className={quietButton} onClick={() => setEnd(null)}>
              Clear the end date
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
