import { useState } from 'react'
import Button from './Button'
import type { ContributorStatus } from '../contribute'
import { acceptRevision, patrolRevision, rejectRevision, reviewErrorMessage, revertPage } from '../history'
import type { HistoryEntry } from '../history'

/**
 * The buttons for one revision, shown only to people who can use them:
 *   - Restore this version (any verified contributor; not the live revision,
 *     not a pending/rejected one). On a 'reviewed' page a non-reviewer's
 *     restore is itself held for review.
 *   - Mark reviewed (reviewers; live edits not yet reviewed, not their own)
 *   - Accept / Reject (reviewers; edits waiting on a 'reviewed' page, not
 *     their own; rejecting needs a note the author will see)
 * The RPCs re-check all of this; hiding a button is only courtesy.
 */

const FIELD = 'lp-field block w-full rounded-md px-3 py-2 font-sans text-sm leading-relaxed text-ink placeholder:text-ink/60'

type Props = {
  pcid: number
  revisionId: number
  revisionStatus: HistoryEntry['patrol_status']
  authorHandle: string
  isCurrent: boolean
  status: ContributorStatus
  onDone: (message: string) => void
}

export default function RevisionActions({ pcid, revisionId, revisionStatus, authorHandle, isCurrent, status, onDone }: Props) {
  const [mode, setMode] = useState<'idle' | 'restore' | 'reject' | 'accept'>('idle')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status.kind !== 'ready') return null
  const own = status.handle !== null && status.handle === authorHandle
  const canRestore = !isCurrent && revisionStatus !== 'pending' && revisionStatus !== 'rejected' && status.handle !== null
  const canPatrol = status.patroller && !own && revisionStatus === 'unpatrolled'
  const canDecide = status.patroller && !own && revisionStatus === 'pending'
  if (!canRestore && !canPatrol && !canDecide) {
    return own && status.patroller && (revisionStatus === 'pending' || revisionStatus === 'unpatrolled') ? (
      <p className="font-sans text-sm text-ink">This is your edit, so another reviewer has to check it.</p>
    ) : null
  }

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setMode('idle')
      setNote('')
      onDone(message)
    } catch (err) {
      setError(reviewErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          {canDecide && (
            <>
              <Button size="sm" onClick={() => setMode('accept')}>
                Accept
              </Button>
              <Button size="sm" onClick={() => setMode('reject')}>
                Reject
              </Button>
            </>
          )}
          {canPatrol && (
            <Button size="sm" disabled={busy} onClick={() => run(() => patrolRevision(revisionId), 'Marked as reviewed.')}>
              Mark reviewed
            </Button>
          )}
          {canRestore && (
            <Button size="sm" onClick={() => setMode('restore')}>
              Restore this version
            </Button>
          )}
        </div>
      ) : (
        <form
          className="space-y-2"
          onSubmit={e => {
            e.preventDefault()
            if (mode === 'restore')
              void run(() => revertPage(pcid, revisionId, note.trim()), 'Restored. The page now shows this version.')
            else if (mode === 'accept') void run(() => acceptRevision(revisionId, note.trim()), 'Accepted. The edit is now live.')
            else void run(() => rejectRevision(revisionId, note.trim()), 'Rejected. The author will see your note.')
          }}
        >
          <label htmlFor={`note-${revisionId}`} className="block font-sans text-sm font-semibold text-ink">
            {mode === 'restore'
              ? 'Edit summary (optional)'
              : mode === 'accept'
                ? 'Note for the author (optional)'
                : 'Why are you rejecting it? (required, the author sees this)'}
          </label>
          <input
            id={`note-${revisionId}`}
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={500}
            placeholder={mode === 'restore' ? `Restore revision ${revisionId}` : ''}
            className={FIELD}
          />
          {mode === 'restore' && (
            <p className="font-sans text-sm text-ink">
              This replaces the current text with revision {revisionId}. The current text stays in the history.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={busy || (mode === 'reject' && !note.trim())}>
              {busy ? 'Working…' : mode === 'restore' ? 'Restore' : mode === 'accept' ? 'Accept edit' : 'Reject edit'}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-rose-300 bg-rose-100/40 px-3 py-2 font-sans text-sm text-ink">
          {error}
        </p>
      )}
    </div>
  )
}
