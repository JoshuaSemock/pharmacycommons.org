/**
 * Quick Facts row: look-alike/sound-alike (LASA) names (phase 27c, 2026-11-01).
 * Each name the drug goes by, in its Tall Man casing, with the names it is confused with.
 * Confused names that resolve to a PCID link to their page. Data: get_lasa() over lasa_names.
 *
 * Destination: src/components/LasaFact.tsx
 */

import { Link } from 'react-router-dom'
import { useLasa } from '../drugPageData'
import type { LasaPair } from '../drugPageData'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const STAMP_LINK = `lp-raised lp-press rounded-md text-ink ${FOCUS}`
/** Confused-with names shown before the rest are left to the list page. */
const SHOWN = 8

type Group = { name: string; tallMan: boolean; others: LasaPair[] }

/** One group per name; the drug's Tall Man names first, then alphabetical. Duplicate partners are dropped. */
export function groupLasa(rows: LasaPair[]): Group[] {
  const groups = new Map<string, Group>()
  for (const row of rows) {
    const g = groups.get(row.name) ?? { name: row.name, tallMan: false, others: [] }
    g.tallMan = g.tallMan || row.has_tall_man
    if (!g.others.some(o => o.confused_with.toLowerCase() === row.confused_with.toLowerCase())) g.others.push(row)
    groups.set(row.name, g)
  }
  return [...groups.values()].sort(
    (a, b) => Number(b.tallMan) - Number(a.tallMan) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
}

export default function LasaFact({ pcidCode }: { pcidCode: string }) {
  const lasa = useLasa(pcidCode)
  if (lasa.failed) return <span>Couldn’t load look-alike names</span>
  if (!lasa.data) return <span className="block h-4 w-3/4 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" aria-hidden="true" />
  if (lasa.data.length === 0) return <span>Not listed</span>

  let budget = SHOWN
  const shownGroups = groupLasa(lasa.data).map(g => {
    const shown = g.others.slice(0, Math.max(budget, 0))
    budget -= shown.length
    return { ...g, shown, hidden: g.others.length - shown.length }
  })
  const hidden = shownGroups.reduce((n, g) => n + g.hidden, 0)

  return (
    <span className="block space-y-1.5">
      {shownGroups
        .filter(g => g.shown.length > 0)
        .map(g => (
          <span key={g.name} className="block">
            <span className="font-medium">{g.name}</span>
            {g.tallMan && <span className="ml-1.5 font-sans text-xs uppercase tracking-wide">Tall Man</span>}
            <span className="block">
              confused with{' '}
              {g.shown.map((o, i) => (
                <span key={o.confused_with}>
                  {i > 0 && ', '}
                  {o.confused_with_pcid !== null ? (
                    <Link to={`/id/PCID-${o.confused_with_pcid}`} className={`underline decoration-1 underline-offset-2 ${FOCUS}`}>
                      {o.confused_with}
                    </Link>
                  ) : (
                    o.confused_with
                  )}
                </span>
              ))}
            </span>
          </span>
        ))}
      <Link to="/lists/look-alike-sound-alike" className={`${STAMP_LINK} inline-block px-2 py-0.5 font-sans text-sm leading-snug`}>
        {hidden > 0 ? `${hidden} more on the list` : 'Look-alike/sound-alike list'}
      </Link>
    </span>
  )
}
