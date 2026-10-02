/**
 * Medication reconciliation — small shared UI pieces and class strings.
 * Colors follow the site palette in src/index.css: mint (primary), hepatica
 * (selected/active), rose (warning), marigold (caution), sky (information).
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ReactNode } from 'react'
import type { Seg } from './sig'
import type { Tone } from './model'

export const inputClass =
  'lp-field w-full min-w-0 rounded-md px-3 py-1.5 font-sans text-[14px] text-ink placeholder:text-ink disabled:bg-neutral-100'
export const numberClass = `${inputClass} font-mono text-[13.5px]`
/** Trigger of a PaperSelect / PaperDatePicker in a form (colorless letterpress dropdown). */
export const selectClass = 'w-full min-w-0 px-3 py-1.5 text-[14px]'
export const primaryButton =
  'lp-raised lp-press inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-sans text-[13px] font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20'
export const secondaryButton =
  'lp-raised lp-press inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-sans text-[12.5px] font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20'
export const quietButton =
  'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-sans text-[12.5px] text-ink transition-colors hover:bg-mint-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20'
export const dangerQuietButton =
  'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-sans text-[12.5px] text-ink transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20'

/** Labelled control. Wrap exactly one input/select so the label names it. */
export function Field({ label, hint, children, className = '' }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`grid min-w-0 content-start gap-1 ${className}`}>
      <span className="font-sans text-[12.5px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="font-sans text-[12px] leading-snug text-ink">{hint}</span>}
    </label>
  )
}

/** A set of pill-shaped radio buttons. */
export function ChipRadio<T extends string>({
  name,
  value,
  options,
  onChange,
  label,
}: {
  name: string
  value: T | ''
  options: readonly (readonly [T, ReactNode])[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([v, text]) => (
        <label key={v} className="relative cursor-pointer">
          <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="peer sr-only" />
          <span className="inline-block rounded-md shadow-emboss peer-checked:shadow-deboss px-3 py-1 font-sans text-[13px] text-ink peer-checked:font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-ink/20">
            {text}
          </span>
        </label>
      ))}
    </div>
  )
}

const TAG_TONES: Record<Tone, string> = {
  ok: 'text-ink',
  caution: 'bg-marigold-100 text-ink',
  warn: 'bg-rose-100 text-ink',
  info: 'bg-sky-50 text-ink',
  muted: 'text-ink',
}

export function Tag({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`lp-raised inline-block rounded px-1.5 py-0.5 font-mono text-[10.5px] leading-tight ${TAG_TONES[tone]}`}>{children}</span>
}

export function SectionHeading({ id, title, lede, action }: { id: string; title: string; lede?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2
          id={id}
          className="scroll-mt-28 font-display font-semibold leading-tight text-ink"
          style={{ fontFamily: 'var(--font-display)', fontSize: '24px' }}
        >
          {title}
        </h2>
        {lede && <p className="mt-1.5 max-w-[42rem] font-sans text-[14.5px] leading-relaxed text-ink">{lede}</p>}
      </div>
      {action}
    </div>
  )
}

/** Renders directions with calculated values highlighted and missing pieces marked. */
export function SigText({ segments, highlight = true }: { segments: Seg[]; highlight?: boolean }) {
  return (
    <>
      {segments.map((s, i) =>
        s.kind === 'calc' && highlight ? (
          <span key={i} className="rounded-sm bg-hepatica-100 px-0.5 text-ink [box-decoration-break:clone]">
            {s.text}
          </span>
        ) : s.kind === 'gap' ? (
          <span key={i} className="font-mono text-[0.85em] text-ink">
            [{s.text}]
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  )
}

export function RemoveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/** The dash shown for an empty table cell. */
export const cell = (v: string): ReactNode => (v ? v : <span className="text-ink">—</span>)
