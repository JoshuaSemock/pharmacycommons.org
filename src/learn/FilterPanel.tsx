/**
 * Learn — "Filter questions" panel on the study page. Choices come from the items' own tags (src/learn/filters.ts),
 * so a collection only shows the groups that actually split it.
 *
 * Destination: src/learn/FilterPanel.tsx
 */

import { facetsOf, toggleValue, type Selection } from './filters'
import type { LearnItem } from './types'

export default function FilterPanel({
  items,
  selection,
  matching,
  onChange,
}: {
  items: readonly LearnItem[]
  selection: Selection
  matching: number
  onChange: (next: Selection) => void
}) {
  const groups = facetsOf(items)
  if (groups.length === 0) return null
  const chosen = Object.values(selection).reduce((n, v) => n + v.length, 0)
  return (
    <details className="mt-4 font-sans text-[14px] text-ink" open={chosen > 0}>
      <summary className="cursor-pointer select-none py-1">
        Filter questions{chosen > 0 ? ` · ${matching} of ${items.length} shown` : ''}
      </summary>
      <div className="mt-3 space-y-4">
        {groups.map(g => (
          <fieldset key={g.key} className="min-w-0">
            <legend className="mb-1.5 text-[13px] font-medium">{g.label}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {g.values.map(v => (
                <label key={v.value} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={(selection[g.key] ?? []).includes(v.value)}
                    onChange={() => onChange(toggleValue(selection, g.key, v.value))}
                  />
                  {v.label} <span className="font-mono text-[11.5px]">{v.count}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {chosen > 0 && (
          <button type="button" className="underline" onClick={() => onChange({})}>
            Clear filters
          </button>
        )}
        <p className="text-[12.5px]">Changing a filter restarts the session. Answers you already gave are kept.</p>
      </div>
    </details>
  )
}
