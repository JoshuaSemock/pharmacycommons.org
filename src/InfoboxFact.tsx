import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Button from './components/Button'
import type { ContributorStatus } from './contribute'
import { reviewErrorMessage } from './history'
import { citationHref, editInfobox, patrolInfoboxEdit, reviewInfoboxEdit } from './infobox'
import type { InfoboxEdit, InfoboxState } from './infobox'
import { HandleSetup } from './OverviewEditor'

/**
 * One Quick Facts row with its community layer (phase 15, docs/user-edits.md §5).
 *
 * - No community value: the source value (label, list, record) as before.
 * - Community value: shown first, marked "Community" with its citation; the
 *   source value stays one tap away ("Show source"), so a disagreement with
 *   the label is visible rather than hidden.
 * - Verified contributors: Edit (value + required citation + summary). An
 *   empty value clears the community value. On high-alert pages a
 *   non-reviewer's edit waits for review.
 * - History: every community value for the row, with Restore, Mark reviewed
 *   and Accept / Reject for those allowed.
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const LINK = `underline decoration-hepatica-300 underline-offset-2 hover:decoration-hepatica-600 ${FOCUS}`
const TEXT_BTN = `lp-press inline-flex items-center rounded-md px-2 py-0.5 font-sans text-xs text-ink ${FOCUS}`
const FIELD = 'lp-field block w-full rounded-md px-2.5 py-1.5 font-sans text-sm leading-snug text-ink placeholder:text-ink/60'
const LABEL = 'mb-1 block font-sans text-xs font-semibold text-ink'
// index.css sizes form controls outside Tailwind's layers; set the size inline.
const SMALL_TEXT = { fontSize: 'var(--text-sm)' } as const

export type InfoboxContext = {
  pcid: number
  protection: 'open' | 'reviewed' | 'patrollers'
  data: InfoboxState | null
  status: ContributorStatus
  reload: () => void
  onHandleSet: () => void
}

type Props = {
  term: string
  propertyKey: string
  ctx: InfoboxContext
  /** The source value, rendered as before. */
  children: ReactNode
}

export default function InfoboxFact({ term, propertyKey, ctx, children }: Props) {
  const [panel, setPanel] = useState<'none' | 'edit' | 'history'>('none')
  const [showSource, setShowSource] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const current = ctx.data?.current(propertyKey) ?? null
  const pending = ctx.data?.pending(propertyKey) ?? []
  const history = ctx.data?.history(propertyKey) ?? []
  const ready = ctx.status.kind === 'ready'

  return (
    <div className="px-4 py-2.5">
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3">
        <dt className="font-sans text-sm font-semibold leading-snug text-ink">{term}</dt>
        <dd className="min-w-0 font-sans text-sm leading-snug text-ink [overflow-wrap:anywhere]">
          {current ? (
            <>
              <span className="block whitespace-pre-line">{current.value}</span>
              <CommunityMark edit={current} />
              <button type="button" onClick={() => setShowSource(v => !v)} aria-expanded={showSource} className={`${TEXT_BTN} mt-1`}>
                {showSource ? 'Hide source value' : 'Show source value'}
              </button>
              {showSource && <div className="mt-1.5 border-l-2 border-ink/20 pl-2">{children}</div>}
            </>
          ) : (
            children
          )}
          {pending.length > 0 && (
            <span className="mt-1 block font-sans text-xs">
              {pending.length} change{pending.length === 1 ? '' : 's'} waiting for review
            </span>
          )}
          {notice && (
            <span role="status" className="mt-1 block font-sans text-xs">
              {notice}
            </span>
          )}
          {(ready || history.length > 0) && (
            <span className="mt-1 flex flex-wrap gap-x-3">
              {ready && (
                <button
                  type="button"
                  onClick={() => {
                    setNotice(null)
                    setPanel(p => (p === 'edit' ? 'none' : 'edit'))
                  }}
                  aria-expanded={panel === 'edit'}
                  className={TEXT_BTN}
                >
                  {current ? 'Edit value' : 'Add community value'}
                </button>
              )}
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPanel(p => (p === 'history' ? 'none' : 'history'))}
                  aria-expanded={panel === 'history'}
                  className={TEXT_BTN}
                >
                  History ({history.length})
                </button>
              )}
            </span>
          )}
        </dd>
      </div>

      {panel === 'edit' && ctx.status.kind === 'ready' && (
        <div className="mt-3">
          {ctx.status.handle === null ? (
            <HandleSetup onDone={ctx.onHandleSet} onCancel={() => setPanel('none')} />
          ) : (
            <EditForm
              term={term}
              propertyKey={propertyKey}
              ctx={ctx}
              current={current}
              patroller={ctx.status.patroller}
              onCancel={() => setPanel('none')}
              onSaved={held => {
                setPanel('none')
                setNotice(held ? 'Sent for review.' : 'Saved.')
                ctx.reload()
              }}
            />
          )}
        </div>
      )}

      {panel === 'history' && (
        <HistoryList
          edits={history}
          ctx={ctx}
          propertyKey={propertyKey}
          onDone={message => {
            setNotice(message)
            ctx.reload()
          }}
        />
      )}
    </div>
  )
}

function CommunityMark({ edit }: { edit: InfoboxEdit }) {
  const href = citationHref(edit.citation)
  return (
    <span className="mt-1 block font-sans text-xs">
      <span className="lp-label mr-1 rounded px-1 py-px">Community</span>
      Source:{' '}
      {href ? (
        <a href={href} target="_blank" rel="nofollow ugc noopener noreferrer" className={LINK}>
          {edit.citation}
        </a>
      ) : (
        edit.citation
      )}
      {edit.patrol_status === 'unpatrolled' ? ' · not yet reviewed' : ''}
    </span>
  )
}

function EditForm({
  term,
  propertyKey,
  ctx,
  current,
  patroller,
  onCancel,
  onSaved,
}: {
  term: string
  propertyKey: string
  ctx: InfoboxContext
  current: InfoboxEdit | null
  patroller: boolean
  onCancel: () => void
  onSaved: (held: boolean) => void
}) {
  const [value, setValue] = useState(current?.value ?? '')
  const [citation, setCitation] = useState(current?.citation ?? '')
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const held = ctx.protection === 'reviewed' && !patroller
  const clearing = current !== null && value.trim() === ''
  const id = `ib-${propertyKey}`

  async function save() {
    setError(null)
    if (!citation.trim()) return setError('Add the source for this value.')
    if (!summary.trim()) return setError('Add a short edit summary.')
    if (!current && !value.trim()) return setError('Enter a value, or cancel.')
    setSaving(true)
    try {
      await editInfobox({ pcid: ctx.pcid, key: propertyKey, value: value.trim(), citation: citation.trim(), summary: summary.trim() })
      onSaved(held)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The value couldn’t be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="space-y-2.5"
      onSubmit={e => {
        e.preventDefault()
        void save()
      }}
    >
      {held && (
        <p className="rounded-md border border-sky-300 bg-sky-100/40 px-2.5 py-1.5 font-sans text-xs leading-snug text-ink">
          High-alert page: your change waits for a reviewer before it appears.
        </p>
      )}
      <div>
        <label htmlFor={`${id}-value`} className={LABEL}>
          {term}
        </label>
        <textarea
          id={`${id}-value`}
          value={value}
          onChange={e => setValue(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={current ? 'Leave empty to show the source value again' : ''}
          className={`${FIELD} resize-y`}
          style={SMALL_TEXT}
        />
      </div>
      <div>
        <label htmlFor={`${id}-citation`} className={LABEL}>
          Source (required)
        </label>
        <input
          id={`${id}-citation`}
          type="text"
          value={citation}
          onChange={e => setCitation(e.target.value)}
          maxLength={500}
          placeholder="PMID, DOI, URL or reference"
          className={FIELD}
          style={SMALL_TEXT}
        />
      </div>
      <div>
        <label htmlFor={`${id}-summary`} className={LABEL}>
          Edit summary (required)
        </label>
        <input
          id={`${id}-summary`}
          type="text"
          value={summary}
          onChange={e => setSummary(e.target.value)}
          maxLength={500}
          className={FIELD}
          style={SMALL_TEXT}
        />
      </div>
      <p className="font-sans text-xs leading-snug text-ink">
        Values are released under CC0 (
        <Link to="/terms" className={LINK}>
          Terms
        </Link>
        ). The label or list value is kept and shown beside yours.
      </p>
      {error && (
        <p role="alert" className="rounded-md border border-rose-300 bg-rose-100/40 px-2.5 py-1.5 font-sans text-xs text-ink">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" type="submit" disabled={saving}>
          {saving ? 'Saving…' : held ? 'Send for review' : clearing ? 'Clear value' : 'Save'}
        </Button>
        <Button size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

const STATUS: Record<InfoboxEdit['patrol_status'], string> = {
  unpatrolled: 'not yet reviewed',
  patrolled: 'reviewed',
  reverted: 'replaced',
  pending: 'waiting for review',
  rejected: 'rejected',
}

function HistoryList({
  edits,
  ctx,
  propertyKey,
  onDone,
}: {
  edits: InfoboxEdit[]
  ctx: InfoboxContext
  propertyKey: string
  onDone: (message: string) => void
}) {
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const status = ctx.status
  const me = status.kind === 'ready' ? status : null

  async function run(id: number, action: () => Promise<unknown>, message: string) {
    setBusy(id)
    setError(null)
    try {
      await action()
      setRejecting(null)
      setNote('')
      onDone(message)
    } catch (err) {
      setError(reviewErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <ol className="lp-divide-y">
        {edits.map(e => {
          const own = me?.handle !== null && me?.handle === e.handle
          const canRestore = me && me.handle && !e.is_current && e.patrol_status !== 'pending' && e.patrol_status !== 'rejected'
          const canPatrol = me?.patroller && !own && e.patrol_status === 'unpatrolled'
          const canDecide = me?.patroller && !own && e.patrol_status === 'pending'
          return (
            <li key={e.id} className="space-y-1 py-2 font-sans text-xs leading-snug text-ink">
              <span className="block text-sm whitespace-pre-line">{e.value ?? <em>cleared (source value shown)</em>}</span>
              <span className="block">
                {e.summary} · Source: {e.citation}
              </span>
              <span className="block">
                @{e.handle}
                {e.credential ? ` · ${e.credential}` : ''} · {new Date(e.created_at).toLocaleDateString()} ·{' '}
                {e.is_current ? 'live · ' : ''}
                {STATUS[e.patrol_status]}
                {e.review_note ? ` · reviewer: ${e.review_note}` : ''}
              </span>
              {(canRestore || canPatrol || canDecide) && (
                <span className="flex flex-wrap gap-x-3 pt-0.5">
                  {canDecide && (
                    <>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => run(e.id, () => reviewInfoboxEdit(e.id, true, ''), 'Accepted.')}
                        className={TEXT_BTN}
                      >
                        Accept
                      </button>
                      <button type="button" onClick={() => setRejecting(e.id)} className={TEXT_BTN}>
                        Reject
                      </button>
                    </>
                  )}
                  {canPatrol && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => run(e.id, () => patrolInfoboxEdit(e.id), 'Marked reviewed.')}
                      className={TEXT_BTN}
                    >
                      Mark reviewed
                    </button>
                  )}
                  {canRestore && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        run(
                          e.id,
                          () =>
                            editInfobox({
                              pcid: ctx.pcid,
                              key: propertyKey,
                              value: e.value ?? '',
                              citation: e.citation,
                              summary: `Restore value from ${new Date(e.created_at).toLocaleDateString()}`,
                            }),
                          ctx.protection === 'reviewed' && !me?.patroller ? 'Restore sent for review.' : 'Restored.',
                        )
                      }
                      className={TEXT_BTN}
                    >
                      Restore
                    </button>
                  )}
                </span>
              )}
              {rejecting === e.id && (
                <form
                  className="space-y-1.5 pt-1"
                  onSubmit={ev => {
                    ev.preventDefault()
                    if (note.trim()) void run(e.id, () => reviewInfoboxEdit(e.id, false, note.trim()), 'Rejected.')
                  }}
                >
                  <label htmlFor={`rej-${e.id}`} className={LABEL}>
                    Why? (the author sees this)
                  </label>
                  <input id={`rej-${e.id}`} type="text" value={note} onChange={ev => setNote(ev.target.value)} className={FIELD} style={SMALL_TEXT} />
                  <span className="flex gap-2">
                    <Button size="sm" type="submit" disabled={!note.trim() || busy !== null}>
                      Reject
                    </Button>
                    <Button size="sm" onClick={() => setRejecting(null)}>
                      Cancel
                    </Button>
                  </span>
                </form>
              )}
            </li>
          )
        })}
      </ol>
      {error && (
        <p role="alert" className="rounded-md border border-rose-300 bg-rose-100/40 px-2.5 py-1.5 font-sans text-xs text-ink">
          {error}
        </p>
      )}
    </div>
  )
}
