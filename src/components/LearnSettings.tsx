/**
 * Learn — study settings on the /learn hub: the daily new-card and review limits, and whether multiple-choice
 * options stay hidden until asked for. Applies at once; saved to the account when signed in, this device otherwise.
 *
 * Destination: src/components/LearnSettings.tsx
 */

import { useEffect, useState } from 'react'
import { LIMIT_BOUNDS } from '../learn/settings'
import type { Progress } from '../learn/useProgress'

const FIELD = 'lp-field inline-flex rounded-md px-3 py-1.5'
const INPUT = 'w-20 border-0 bg-transparent font-mono text-[14px] text-ink outline-none'

function LimitField({
  label,
  hint,
  value,
  min,
  max,
  onCommit,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  onCommit: (n: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const n = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(n)) setDraft(String(value))
    else onCommit(n)
  }
  return (
    <label className="block">
      <span className="block font-sans text-[14px] text-ink">{label}</span>
      <span className={`${FIELD} mt-1.5`}>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
          }}
          className={INPUT}
        />
      </span>
      <span className="mt-1 block font-sans text-[12.5px] text-ink">{hint}</span>
    </label>
  )
}

export default function LearnSettings({ progress }: { progress: Progress }) {
  const { settings, updateSettings, settingsSaveFailed, signedIn } = progress
  return (
    <section className="pt-12" aria-labelledby="learn-settings-h">
      <h2 id="learn-settings-h" className="font-display text-[1.25rem] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
        Study settings
      </h2>
      <div className="lp-raised mt-4 rounded-md p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <LimitField
            label="New cards per day"
            hint={`0 to ${LIMIT_BOUNDS.newItems.max}. Cards you start today count against it.`}
            value={settings.limits.newItems}
            min={LIMIT_BOUNDS.newItems.min}
            max={LIMIT_BOUNDS.newItems.max}
            onCommit={n => updateSettings({ limits: { newItems: n } })}
          />
          <LimitField
            label="Reviews per day"
            hint={`0 to ${LIMIT_BOUNDS.reviews.max}. Cards beyond it wait for tomorrow.`}
            value={settings.limits.reviews}
            min={LIMIT_BOUNDS.reviews.min}
            max={LIMIT_BOUNDS.reviews.max}
            onCommit={n => updateSettings({ limits: { reviews: n } })}
          />
        </div>
        <label className="mt-6 flex items-start gap-2 font-sans text-[14px] text-ink">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings.coverOptions}
            onChange={e => updateSettings({ coverOptions: e.target.checked })}
          />
          <span>Hide the options of multiple-choice questions until I ask for them, so I recall the answer first.</span>
        </label>
        <p className="mt-5 font-sans text-[12.5px] text-ink" role="status">
          {settingsSaveFailed
            ? 'Couldn’t save to your account just now. The change holds on this device.'
            : signedIn
              ? 'Saved to your account.'
              : 'Saved on this device. Sign in to keep it across devices.'}
        </p>
      </div>
    </section>
  )
}
