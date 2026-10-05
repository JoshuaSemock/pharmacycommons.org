import { useEffect, useState } from 'react'
import { diffStats, lineDiff, revisionText, withContext } from '../diff'
import { getRevision } from '../history'
import type { Revision } from '../history'

/**
 * What one revision changed, as a line diff against the revision it was
 * written on (its parent; for a first revision, against an empty page).
 *
 * Added lines sit on a mint wash, removed lines on a rose wash, each also
 * marked + / − so the change never relies on color (docs/design-system.md:
 * diff coloring is an allowed use of the palette).
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'

type State = { revision: Revision; parent: Revision | null } | 'loading' | 'failed'

export default function RevisionDiff({ revisionId }: { revisionId: number }) {
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    let cancelled = false
    setState('loading')
    ;(async () => {
      const revision = await getRevision(revisionId)
      if (!revision) throw new Error('missing')
      const parent = revision.parent_id ? await getRevision(revision.parent_id) : null
      if (!cancelled) setState({ revision, parent })
    })().catch(() => {
      if (!cancelled) setState('failed')
    })
    return () => {
      cancelled = true
    }
  }, [revisionId])

  if (state === 'loading') return <div className="h-24 animate-pulse rounded-md bg-ink/10 motion-reduce:animate-none" aria-busy="true" />
  if (state === 'failed') return <p className="font-sans text-sm text-ink">This revision couldn’t be loaded.</p>

  return (
    <DiffView
      before={state.parent ? revisionText(state.parent) : ''}
      after={revisionText(state.revision)}
      label={state.parent ? `Compared with revision ${state.parent.id}` : 'First version of the text'}
    />
  )
}

/** A rendered line diff between two texts. */
export function DiffView({ before, after, label }: { before: string; after: string; label: string }) {
  const [full, setFull] = useState(false)
  const lines = lineDiff(before, after)
  const { added, removed } = diffStats(lines)
  const shown = full ? lines : withContext(lines)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 font-sans text-sm text-ink">
        <span>
          {label} ·{' '}
          <span aria-label={`${added} lines added`}>+{added}</span> /{' '}
          <span aria-label={`${removed} lines removed`}>−{removed}</span>
        </span>
        <button type="button" onClick={() => setFull(v => !v)} className={`font-medium underline-offset-2 hover:underline ${FOCUS}`}>
          {full ? 'Show changes only' : 'Show whole text'}
        </button>
      </div>
      {added === 0 && removed === 0 ? (
        <p className="font-sans text-sm text-ink">No change to the text.</p>
      ) : (
        <div className="lp-sunken overflow-x-auto rounded-md py-2 font-mono text-[13px] leading-relaxed text-ink">
          {shown.map((l, i) =>
            l === null ? (
              <div key={`gap-${i}`} className="px-3 py-0.5 font-sans text-xs text-ink/70">
                ⋯
              </div>
            ) : (
              <div
                key={i}
                className={`flex gap-2 px-3 whitespace-pre-wrap ${
                  l.op === 'add' ? 'bg-mint-100/70' : l.op === 'del' ? 'bg-rose-100/70 line-through decoration-rose-400' : ''
                }`}
              >
                <span aria-hidden="true" className="w-3 shrink-0 select-none">
                  {l.op === 'add' ? '+' : l.op === 'del' ? '−' : ' '}
                </span>
                <span className="sr-only">{l.op === 'add' ? 'Added: ' : l.op === 'del' ? 'Removed: ' : ''}</span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{l.text || ' '}</span>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
