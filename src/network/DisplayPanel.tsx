/**
 * Display and layout controls for the Network canvas, laid out like the side
 * panel of Obsidian's graph view: depth, appearance, then forces. A collapsed
 * <details> so the graph stays the focus; every control also works from the
 * keyboard, and none of them changes what is recorded, only how it is drawn.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useId } from 'react'
import Button from '../components/Button'
import { RANGES, defaultDisplay } from './display'
import type { Display } from './display'
import { MAX_DEPTH, NODE_CAP } from './depth'

type Props = {
  display: Display
  onDisplay: (next: Display) => void
  depth: number
  onDepth: (depth: number) => void
  busy: boolean
  physicsPaused: boolean
  onUnpin: () => void
}

function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink">
      <input type="checkbox" className="mt-1 accent-[var(--color-ink)]" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-[12px]">{hint}</span>}
      </span>
    </label>
  )
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  show,
  disabled,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  show: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="flex justify-between text-[13px] text-ink">
        <span>{label}</span>
        <span className="font-mono text-[12px]">{show}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--color-ink)] disabled:opacity-50"
      />
    </div>
  )
}

export default function DisplayPanel({ display, onDisplay, depth, onDepth, busy, physicsPaused, onUnpin }: Props) {
  const set = (patch: Partial<Display>) => onDisplay({ ...display, ...patch })
  return (
    <details className="mb-3">
      <summary className="lp-toggle inline-block cursor-pointer rounded-md px-3 py-1 font-sans text-[12.5px] text-ink">
        Display and layout
      </summary>
      <div className="mt-2 grid gap-5 rounded-md p-3 sm:grid-cols-3">
        <div className="space-y-3">
          <p className="font-sans text-[13px] font-medium text-ink">Depth</p>
          <Slider
            label="Steps from the starting concept"
            min={1}
            max={MAX_DEPTH}
            step={1}
            value={depth}
            onChange={onDepth}
            show={String(depth)}
            disabled={busy}
          />
          <p className="text-[12px] text-ink">
            1 is its own relationships. Deeper levels load a few relationships per concept and stop at {NODE_CAP} concepts.
          </p>
        </div>

        <div className="space-y-3">
          <p className="font-sans text-[13px] font-medium text-ink">Appearance</p>
          <Check label="Size by connections" checked={display.sizeByDegree} onChange={v => set({ sizeByDegree: v })} />
          <Check label="Arrows" checked={display.arrows} onChange={v => set({ arrows: v })} />
          <Check label="Focus on hover" checked={display.hoverFocus} onChange={v => set({ hoverFocus: v })} />
          <Slider
            label="Names appear when zoomed"
            {...RANGES.textZoom}
            value={display.textZoom}
            onChange={v => set({ textZoom: v })}
            show={display.textZoom === 0 ? 'always' : `${Math.round(display.textZoom * 100)}%`}
          />
          <Slider label="Line thickness" {...RANGES.linkWidth} value={display.linkWidth} onChange={v => set({ linkWidth: v })} show={`${display.linkWidth}px`} />
        </div>

        <div className="space-y-3">
          <p className="font-sans text-[13px] font-medium text-ink">Forces</p>
          <Check
            label="Live physics"
            hint="Concepts drift into place and follow a drag. Where they land means nothing."
            checked={display.physics}
            onChange={v => set({ physics: v })}
          />
          {physicsPaused && (
            <p className="text-[12px] text-ink">Too many concepts for physics, so the layout is held still. Hide a kind or collapse a branch.</p>
          )}
          <Slider
            label="Repel force"
            {...RANGES.repel}
            value={display.repel}
            onChange={v => set({ repel: v })}
            show={`${display.repel}×`}
            disabled={!display.physics}
          />
          <Slider
            label="Line length"
            {...RANGES.linkDistance}
            value={display.linkDistance}
            onChange={v => set({ linkDistance: v })}
            show={`${display.linkDistance}px`}
            disabled={!display.physics}
          />
          <p className="text-[12px] text-ink">Double-tap a concept to pin it in place.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onUnpin}>Release pinned</Button>
            <Button size="sm" onClick={() => onDisplay(defaultDisplay())}>Reset display</Button>
          </div>
        </div>
      </div>
    </details>
  )
}
