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
  'w-full min-w-0 rounded-lg border border-mint-200 bg-white px-3 py-1.5 font-sans text-[14px] text-mint-950 placeholder:text-neutral-500 focus:border-hepatica-400 focus:outline-none focus:ring-2 focus:ring-hepatica-200 disabled:bg-neutral-100 disabled:text-neutral-600'
export const numberClass = `${inputClass} font-mono text-[13.5px]`
export const primaryButton =
  'inline-flex items-center gap-1.5 rounded-lg border border-mint-700 bg-mint-700 px-3.5 py-1.5 font-sans text-[13px] font-medium text-white transition-colors hover:border-mint-800 hover:bg-mint-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hepatica-300'
export const secondaryButton =
  'inline-flex items-center gap-1.5 rounded-lg border border-mint-300 bg-white px-3 py-1.5 font-sans text-[12.5px] font-medium text-mint-900 transition-colors hover:border-mint-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hepatica-300'
export const quietButton =
  'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-sans text-[12.5px] text-mint-800 transition-colors hover:bg-mint-50 hover:text-mint-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hepatica-300'
export const dangerQuietButton =
  'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-sans text-[12.5px] text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300'

/** Labelled control. Wrap exactly one input/select so the label names it. */
export function Field({ label, hint, children, className = '' }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`grid min-w-0 content-start gap-1 ${className}`}>
      <span className="font-sans text-[12.5px] font-medium text-mint-900">{label}</span>
      {children}
      {hint && <span className="font-sans text-[12px] leading-snug text-neutral-600">{hint}</span>}
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
          <span className="inline-block rounded-full border border-mint-200 bg-white px-3 py-1 font-sans text-[13px] text-mint-900 transition-colors hover:border-mint-400 peer-checked:border-hepatica-300 peer-checked:bg-hepatica-100 peer-checked:font-medium peer-checked:text-hepatica-800 peer-focus-visible:ring-2 peer-focus-visible:ring-hepatica-300">
            {text}
          </span>
        </label>
      ))}
    </div>
  )
}

const TAG_TONES: Record<Tone, string> = {
  ok: 'border-mint-200 bg-mint-50 text-mint-800',
  caution: 'border-marigold-300 bg-marigold-100 text-marigold-800',
  warn: 'border-rose-200 bg-rose-100 text-rose-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  muted: 'border-neutral-300 bg-neutral-100 text-neutral-700',
}

export function Tag({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10.5px] leading-tight ${TAG_TONES[tone]}`}>{children}</span>
}

export function SectionHeading({ id, title, lede, action }: { id: string; title: string; lede?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2
          id={id}
          className="scroll-mt-28 font-display font-semibold leading-tight text-mint-950"
          style={{ fontFamily: 'var(--font-display)', fontSize: '24px' }}
        >
          {title}
        </h2>
        {lede && <p className="mt-1.5 max-w-[42rem] font-sans text-[14.5px] leading-relaxed text-neutral-700">{lede}</p>}
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
          <span key={i} className="rounded-sm bg-hepatica-100 px-0.5 text-hepatica-800 [box-decoration-break:clone]">
            {s.text}
          </span>
        ) : s.kind === 'gap' ? (
          <span key={i} className="font-mono text-[0.85em] text-rose-700">
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
export const cell = (v: string): ReactNode => (v ? v : <span className="text-neutral-400">—</span>)
