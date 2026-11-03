/**
 * Quick Facts row: FDA REMS programs (phase 30, 2026-11-03).
 * One line per program with its status, elements and the affected brand names.
 * Brand, precise-form and combination pages show their moiety's programs. Data: get_rems() over rems_products.
 *
 * Destination: src/components/RemsFact.tsx
 */

import { Link } from 'react-router-dom'
import { useRems } from '../drugPageData'
import type { RemsProgram } from '../drugPageData'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const STAMP_LINK = `lp-raised lp-press rounded-md text-ink ${FOCUS}`
/** Programs shown before the rest are left to the list page. */
const SHOWN = 4

/** Short element labels, in FDA's order. */
export function remsElements(p: RemsProgram): string[] {
  const out: string[] = []
  if (p.etasu) out.push('ETASU')
  if (p.medication_guide) out.push('Medication Guide')
  if (p.communication_plan) out.push('Communication plan')
  if (p.implementation_system) out.push('Implementation system')
  if (p.shared_system) out.push('Shared system')
  return out
}

export default function RemsFact({ pcidCode }: { pcidCode: string }) {
  const rems = useRems(pcidCode)
  if (rems.failed) return <span>Couldn’t load REMS programs</span>
  if (!rems.data) return <span className="block h-4 w-3/4 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" aria-hidden="true" />
  if (rems.data.length === 0) return <span>No REMS on record</span>

  const shown = rems.data.slice(0, SHOWN)
  const hidden = rems.data.length - shown.length

  return (
    <span className="block space-y-1.5">
      {shown.map(p => {
        const elements = remsElements(p)
        return (
          <span key={p.rems_id} className="block">
            {p.website ? (
              <a href={p.website} target="_blank" rel="noreferrer" className={`underline decoration-1 underline-offset-2 ${FOCUS}`}>
                {p.program}
              </a>
            ) : (
              <span>{p.program}</span>
            )}
            <span className="ml-1.5 font-sans text-xs uppercase tracking-wide">{p.status}</span>
            {elements.length > 0 && <span className="block">{elements.join(' · ')}</span>}
            {p.brands && <span className="block">Brands: {p.brands}</span>}
            {p.inactive_brands && <span className="block">Inactive: {p.inactive_brands}</span>}
          </span>
        )
      })}
      <Link to="/lists/rems-products" className={`${STAMP_LINK} inline-block px-2 py-0.5 font-sans text-sm leading-snug`}>
        {hidden > 0 ? `${hidden} more on the list` : 'REMS products list'}
      </Link>
    </span>
  )
}
