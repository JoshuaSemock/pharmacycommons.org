import { Link } from 'react-router-dom'

/**
 * "See how it connects": opens /network with this record as the centre of the graph.
 * Takes the PCID as the pages hold it ("PCID-1001923") or as digits. Renders nothing for
 * anything else, so a page without a PCID never links to an empty graph.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
export default function NetworkLink({ pcid, label = 'See how it connects', className = '' }: { pcid: string | number; label?: string; className?: string }) {
  const m = /^(?:PCID-)?(\d{7,8})$/i.exec(String(pcid).trim())
  if (!m) return null
  return (
    <Link
      to={`/network?c=${m[1]}`}
      title="Open the Network, a graph of this record's classes, products, lists and recorded statements"
      className={`lp-raised lp-press inline-block rounded-md px-3 py-1 font-sans text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40 ${className}`}
    >
      {label}
    </Link>
  )
}
