import { BUCKETS, type Bucket } from '@/catalog'

/**
 * The A–Z character index shared by Browse (/browse) and the dictionary
 * (/tools/dictionary): A–Z, the numbers, the Greek descriptors, then the symbol
 * bucket — set as type rather than as chips, with hairline dividers between
 * runs. Empty buckets in the Latin and numeric runs stay inert; empty Greek and
 * symbol buckets are omitted unless showEmptyGreek / showEmptySymbol is set.
 *
 * Bucket keys and their order come from src/catalog.ts (`BUCKETS`, `bucketOf`).
 * The bar sticks under the nav and scrolls sideways on phones.
 *
 * Moved out of SearchView.tsx 2026-10-03 so the dictionary could reuse it.
 */
export default function CharacterIndex({
  counts,
  active,
  onSelect,
  showAll = true,
  showEmptyGreek = false,
  showEmptySymbol = false,
  label = 'Browse by first character',
}: {
  counts: Record<Bucket, number> | null
  active: Bucket | null
  /** Called with null when "All" is chosen or the active bucket is pressed again. */
  onSelect: (b: Bucket | null) => void
  /** Show the leading "All" button (Browse). */
  showAll?: boolean
  showEmptyGreek?: boolean
  showEmptySymbol?: boolean
  label?: string
}) {
  const visible = BUCKETS.filter(b => {
    const n = counts?.[b.key] ?? 0
    if (b.kind === 'greek') return showEmptyGreek || n > 0
    if (b.kind === 'symbol') return showEmptySymbol || n > 0
    return true
  })

  return (
    <nav
      aria-label={label}
      className="lp-rule-y sticky top-[var(--nav-h,5.75rem)] z-30 -mx-4 bg-paper/90 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6"
    >
      <div className="flex items-center gap-1 overflow-x-auto sm:flex-wrap sm:overflow-visible">
        {showAll && (
          <button
            onClick={() => onSelect(null)}
            aria-pressed={!active}
            className={`lp-toggle shrink-0 rounded px-2 py-1 font-sans text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40 ${
              !active ? 'font-medium' : ''
            }`}
          >
            All
          </button>
        )}

        {visible.map((b, i) => {
          const n = counts?.[b.key] ?? 0
          const isActive = active === b.key
          const startsRun = i > 0 && visible[i - 1].kind !== b.kind
          return (
            <span key={b.key} className="flex shrink-0 items-center">
              <span
                className={`lp-score-v mx-1 h-4 ${(i === 0 && showAll) || startsRun ? '' : 'hidden'}`}
                aria-hidden="true"
              />
              <button
                onClick={() => onSelect(isActive && showAll ? null : b.key)}
                disabled={!n}
                aria-pressed={isActive}
                aria-label={b.kind === 'latin' || b.kind === 'numeric' ? undefined : b.name}
                title={n ? `${b.name} — ${n.toLocaleString()} entries` : `${b.name} — no entries`}
                className={`lp-toggle rounded px-[7px] py-1 font-mono text-[13px] leading-none text-ink disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40 ${
                  !n ? 'cursor-default' : isActive ? 'font-medium' : ''
                }`}
              >
                {b.label}
              </button>
            </span>
          )
        })}
      </div>
    </nav>
  )
}
