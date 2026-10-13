/**
 * Days supply and quantity — the result panel for one basis (or two, side by
 * side, when the manufacturer and the payer count drops per mL differently).
 *
 * Every step of the arithmetic is shown open, not folded away, so a
 * pharmacist can audit it at a glance (docs/days-supply.md, "Show the work").
 * Results sit in a debossed well: they are calculated, not typed.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fmt } from '@/tools/medrec/sig'
import { quietButton } from '@/tools/medrec/ui'
import { count, nounFor, rateText, type Plan, type Result } from './calc'

export type Column = { label: string | null; plan: Plan; result: Result }

type Props = {
  columns: Column[]
  onCopy: (text: string) => void
}

function Stat({ label, value, note, strong = false }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className="grid min-w-0 content-start gap-0.5">
      <dt className="font-sans text-[12.5px] text-ink">{label}</dt>
      <dd
        className={`[overflow-wrap:anywhere] font-display leading-tight text-ink ${strong ? 'text-[22px] whitespace-nowrap' : 'text-[17px]'}`}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {value}
      </dd>
      {note && <dd className="font-sans text-[12.5px] leading-snug text-ink">{note}</dd>}
    </div>
  )
}

function OneColumn({ col, onCopy }: { col: Column; onCopy: (text: string) => void }) {
  const { plan, result: r } = col
  return (
    <section aria-label={col.label ?? 'Result'} className="lp-sunken grid min-w-0 content-start gap-4 rounded-md p-4 sm:p-5">
      {/* Inline size: the site's unlayered h3 rule would otherwise override text-* (CLAUDE.md, Known drift). */}
      {col.label && (
        <h3 className="font-sans leading-snug text-ink" style={{ fontSize: '14px' }}>
          {col.label}
        </h3>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Stat strong label="Dispense" value={count(r.dispense, r.dispenseNoun)} />
        <Stat
          strong
          label="Days supply"
          value={`${fmt(r.days)} ${r.days === 1 ? 'day' : 'days'}`}
          note={r.daysMin != null && r.daysMin !== r.days ? `Up to ${fmt(r.daysMin)} days at the low end of the range` : undefined}
        />
        <Stat label="Most used" value={rateText(plan)} />
        {r.leftover != null && (
          <Stat label="Left over at the end" value={`${fmt(Math.round(r.leftover * 100) / 100)} ${nounFor(r.leftover, plan.use)}`} />
        )}
      </dl>

      {plan.limitDays != null && (
        <p className="border-t border-dashed border-ink/15 pt-3 font-sans text-[13.5px] leading-snug text-ink">
          {r.limitControls ? (
            <>
              The in-use limit sets the days supply. By use alone this lasts {fmt(r.daysByUse)} days, but each {plan.container?.noun.sg} may only be used
              for {fmt(plan.limitDays)} days once opened, so it is {fmt(r.days)} days.
            </>
          ) : (
            <>
              Use sets the days supply. Each {plan.container?.noun.sg} is used up within its {fmt(plan.limitDays)}-day in-use limit.
            </>
          )}
        </p>
      )}

      <div className="grid gap-1.5 border-t border-dashed border-ink/15 pt-3">
        <h4 className="font-sans text-[12.5px] leading-snug text-ink" style={{ fontSize: '12.5px' }}>
          How this was worked out
        </h4>
        <ol className="grid list-decimal gap-1.5 pl-5 font-mono text-[12.5px] leading-snug text-ink marker:text-ink">
          {r.steps.map((s, i) => (
            <li key={i} className="[overflow-wrap:anywhere]">
              {s}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-1.5 border-t border-dashed border-ink/15 pt-3">
        <span className="font-sans text-[12.5px] text-ink">For the label or the claim</span>
        <p className="[overflow-wrap:anywhere] font-sans text-[14.5px] text-ink">{r.line}</p>
        <div>
          <button type="button" className={quietButton} onClick={() => onCopy(r.line)}>
            Copy this line
          </button>
        </div>
      </div>
    </section>
  )
}

export default function Results({ columns, onCopy }: Props) {
  return (
    <div className="@container min-w-0">
      <div className={`grid min-w-0 gap-4 ${columns.length > 1 ? '@lg:grid-cols-2' : ''}`}>
        {columns.map((c, i) => (
          <OneColumn key={i} col={c} onCopy={onCopy} />
        ))}
      </div>
    </div>
  )
}
