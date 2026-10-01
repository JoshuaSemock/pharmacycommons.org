/**
 * Days supply and quantity — the result panel for one basis (or two, side by
 * side, when the manufacturer and the payer count drops per mL differently).
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fmt } from '@/tools/medrec/sig'
import { quietButton } from '@/tools/medrec/ui'
import { count, longDate, nounFor, rateText, refillDate, type Plan, type Result } from './calc'

export type Column = { label: string | null; plan: Plan; result: Result }

type Props = {
  columns: Column[]
  fill: string
  threshold: number | null
  onCopy: (text: string) => void
}

function Stat({ label, value, note, strong = false }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className="grid min-w-0 content-start gap-0.5">
      <dt className="font-sans text-[12.5px] font-medium text-mint-800">{label}</dt>
      <dd
        className={`[overflow-wrap:anywhere] font-display leading-tight text-mint-950 ${strong ? 'text-[22px] font-semibold whitespace-nowrap' : 'text-[17px]'}`}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {value}
      </dd>
      {note && <dd className="font-sans text-[12.5px] leading-snug text-neutral-600">{note}</dd>}
    </div>
  )
}

function OneColumn({ col, fill, threshold, onCopy }: { col: Column } & Omit<Props, 'columns'>) {
  const { plan, result: r } = col
  const refill = threshold ? refillDate(fill, r.days, threshold) : null
  return (
    <section aria-label={col.label ?? 'Result'} className="grid min-w-0 content-start gap-4 rounded-xl border border-mint-200 bg-white p-4 sm:p-5">
      {/* Inline size: the site's unlayered h3 rule would otherwise override text-* (CLAUDE.md, Known drift). */}
      {col.label && (
        <h3 className="font-sans font-semibold leading-snug text-hepatica-800" style={{ fontSize: '14px' }}>
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
        {refill && (
          <Stat
            label="Earliest refill"
            value={longDate(refill.date)}
            note={`${fmt(refill.after)} days after the fill date (${fmt(threshold ?? 0)}% of the days supply)`}
          />
        )}
      </dl>

      {plan.limitDays != null && (
        <p
          className={`rounded-lg border px-3 py-2 font-sans text-[13.5px] leading-snug ${
            r.limitControls ? 'border-marigold-300 bg-marigold-100 text-marigold-900' : 'border-mint-200 bg-mint-50 text-mint-900'
          }`}
        >
          {r.limitControls ? (
            <>
              <b className="font-semibold">The in-use limit sets the days supply.</b> By use alone this lasts {fmt(r.daysByUse)} days, but each{' '}
              {plan.container?.noun.sg} may only be used for {fmt(plan.limitDays)} days once opened, so it is {fmt(r.days)} days.
            </>
          ) : (
            <>
              Use sets the days supply. Each {plan.container?.noun.sg} is used up within its {fmt(plan.limitDays)}-day in-use limit.
            </>
          )}
        </p>
      )}

      <div className="grid gap-1.5 rounded-lg border border-mint-200 bg-mint-50 px-3.5 py-2.5">
        <span className="font-sans text-[12.5px] font-medium text-mint-800">For the label or the claim</span>
        <p className="[overflow-wrap:anywhere] font-sans text-[14.5px] text-mint-950">{r.line}</p>
        <div>
          <button type="button" className={quietButton} onClick={() => onCopy(r.line)}>
            Copy this line
          </button>
        </div>
      </div>

      <details className="group">
        <summary className="cursor-pointer font-sans text-[13.5px] font-medium text-mint-800 hover:text-hepatica-700">How this was worked out</summary>
        <ol className="mt-2 grid list-decimal gap-1.5 pl-5 font-sans text-[13.5px] leading-snug text-mint-950 marker:text-neutral-500">
          {r.steps.map((s, i) => (
            <li key={i} className="[overflow-wrap:anywhere]">
              {s}
            </li>
          ))}
        </ol>
      </details>
    </section>
  )
}

export default function Results({ columns, fill, threshold, onCopy }: Props) {
  return (
    <div className="@container min-w-0">
      <div className={`grid min-w-0 gap-4 ${columns.length > 1 ? '@lg:grid-cols-2' : ''}`}>
      {columns.map((c, i) => (
        <OneColumn key={i} col={c} fill={fill} threshold={threshold} onCopy={onCopy} />
      ))}
      </div>
    </div>
  )
}
