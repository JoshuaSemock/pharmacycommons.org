import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button'
import RevisionActions from '../components/RevisionActions'
import RevisionDiff from '../components/RevisionDiff'
import { useSession } from '../auth'
import { useContributorStatus } from '../contribute'
import { STATUS_LABEL, getReviewQueue, reviewErrorMessage } from '../history'
import type { QueueItem } from '../history'
import { citationHref, getInfoboxQueue, patrolInfoboxEdit, reviewInfoboxEdit } from '../infobox'
import type { InfoboxQueueItem } from '../infobox'
import type { ContributorStatus } from '../contribute'
import { formatDrugName } from '../names'
import { entityHref } from '../wiki'

/**
 * /review — the reviewers' queue (phase 15, docs/user-edits.md §9).
 *
 * Edits waiting on high-alert ('reviewed') pages come first; they are not
 * live until accepted. Then live edits nobody has reviewed yet. Each opens
 * to its diff with Accept / Reject or Mark reviewed. Anyone can read the
 * queue (it lists public revisions); only reviewers get the buttons.
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const H1 = { fontSize: 'var(--text-3xl)', fontFamily: 'var(--font-sans)', lineHeight: 1.15 } as const
const H2 = { fontSize: 'var(--text-xl)', fontFamily: 'var(--font-sans)', lineHeight: 1.25 } as const

export default function ReviewQueue() {
  const { user, loading: sessionLoading } = useSession()
  const status = useContributorStatus(user?.id ?? null, sessionLoading)
  const [items, setItems] = useState<QueueItem[] | 'loading' | 'failed'>('loading')
  const [facts, setFacts] = useState<InfoboxQueueItem[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const load = useCallback(() => getReviewQueue(), [])

  useEffect(() => {
    document.title = 'Review queue · Pharmacy Commons'
  }, [])

  useEffect(() => {
    let cancelled = false
    load()
      .then(rows => {
        if (!cancelled) setItems(rows)
      })
      .catch(() => {
        if (!cancelled) setItems('failed')
      })
    getInfoboxQueue()
      .then(rows => {
        if (!cancelled) setFacts(rows)
      })
      .catch(() => {
        if (!cancelled) setFacts([])
      })
    return () => {
      cancelled = true
    }
  }, [load, version])

  const reviewer = status.kind === 'ready' && status.patroller
  const pending = Array.isArray(items) ? items.filter(i => i.patrol_status === 'pending') : []
  const unreviewed = Array.isArray(items) ? items.filter(i => i.patrol_status === 'unpatrolled') : []

  const group = (title: string, explain: string, rows: QueueItem[]) => (
    <section className="space-y-3">
      <h2 className="font-semibold text-ink" style={H2}>
        {title} <span className="font-normal">({rows.length})</span>
      </h2>
      <p className="max-w-2xl font-sans text-sm leading-relaxed text-ink">{explain}</p>
      {rows.length === 0 ? (
        <p className="font-sans text-base text-ink">Nothing here.</p>
      ) : (
        <ol className="lp-divide-y max-w-4xl">
          {rows.map(r => (
            <li key={r.id} className="py-3">
              <button
                type="button"
                aria-expanded={open === r.id}
                onClick={() => setOpen(o => (o === r.id ? null : r.id))}
                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 text-left font-sans text-ink ${FOCUS}`}
              >
                <span className="min-w-0">
                  <span className="block text-base font-medium">{r.page ? formatDrugName(r.page.name) : `PCID-${r.pcid}`}</span>
                  <span className="block text-sm [overflow-wrap:anywhere]">
                    {r.summary} · @{r.handle}
                    {r.credential ? ` · ${r.credential}` : ''} · {new Date(r.created_at).toLocaleString()}
                  </span>
                </span>
                <span className="text-sm">{STATUS_LABEL[r.patrol_status]}</span>
              </button>
              {open === r.id && (
                <div className="mt-3 space-y-3 sm:pl-6">
                  {r.page && (
                    <p className="font-sans text-sm text-ink">
                      <Link to={entityHref(r.page.entityType, r.page.slug)} className="underline underline-offset-2">
                        Open the page
                      </Link>{' '}
                      ·{' '}
                      <Link to={`/drugs/${r.page.slug}/history`} className="underline underline-offset-2">
                        Full history
                      </Link>
                    </p>
                  )}
                  <RevisionDiff revisionId={r.id} />
                  <RevisionActions
                    pcid={r.pcid}
                    revisionId={r.id}
                    revisionStatus={r.patrol_status}
                    authorHandle={r.handle}
                    isCurrent={r.patrol_status !== 'pending'}
                    status={status}
                    onDone={message => {
                      setNotice(message)
                      setOpen(null)
                      setVersion(v => v + 1)
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <header className="mb-8 border-b border-ink/15 py-6">
        <h1 className="font-semibold text-ink" style={H1}>
          Review queue
        </h1>
        <p className="mt-2 max-w-2xl font-sans text-base leading-relaxed text-ink">
          {reviewer
            ? 'Community edits waiting for a reviewer. Check each against its sources before accepting or marking it reviewed.'
            : 'Community edits waiting for a reviewer. Reviewers are verified providers appointed by Pharmacy Commons.'}
        </p>
      </header>

      {notice && (
        <p role="status" className="mb-6 rounded-md border border-sky-300 bg-sky-100/40 px-3 py-2 font-sans text-sm text-ink">
          {notice}
        </p>
      )}

      {items === 'loading' ? (
        <div className="h-32 animate-pulse rounded-md bg-ink/10 motion-reduce:animate-none" aria-busy="true" />
      ) : items === 'failed' ? (
        <p className="font-sans text-base text-ink">The queue couldn’t be loaded right now.</p>
      ) : (
        <div className="space-y-12">
          {group(
            'Waiting on high-alert pages',
            'Not live yet. Accept to publish, or reject with a note the author will see.',
            pending,
          )}
          {group(
            'Live, not yet reviewed',
            'Already on the page. Mark reviewed once checked, or restore an earlier version from the page history.',
            unreviewed,
          )}
          <FactsQueue
            items={facts}
            status={status}
            onDone={message => {
              setNotice(message)
              setVersion(v => v + 1)
            }}
          />
        </div>
      )}
    </main>
  )
}

const KEY_LABEL: Record<string, string> = {
  indications: 'Indications',
  dosing: 'Dosing',
  contraindications: 'Contraindications',
  boxed_warning: 'Boxed warning',
  epc_class: 'Pharmacologic class (FDA)',
  legal_status: 'Legal status',
  most_used: 'Most used',
  do_not_crush: 'Do not crush',
  acb_score: 'ACB score',
  qtc_risk: 'QTc risk',
}

/** Quick Facts changes: held ones (accept/reject) and unreviewed live ones (mark reviewed). */
function FactsQueue({
  items,
  status,
  onDone,
}: {
  items: InfoboxQueueItem[]
  status: ContributorStatus
  onDone: (message: string) => void
}) {
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<number | null>(null)
  const [note, setNote] = useState('')
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
    <section className="space-y-3">
      <h2 className="font-semibold text-ink" style={H2}>
        Quick Facts changes <span className="font-normal">({items.length})</span>
      </h2>
      <p className="max-w-2xl font-sans text-sm leading-relaxed text-ink">
        Community values shown beside the label or list value. Check the value against its source.
      </p>
      {error && (
        <p role="alert" className="max-w-2xl rounded-md border border-rose-300 bg-rose-100/40 px-3 py-2 font-sans text-sm text-ink">
          {error}
        </p>
      )}
      {items.length === 0 ? (
        <p className="font-sans text-base text-ink">Nothing here.</p>
      ) : (
        <ol className="lp-divide-y max-w-4xl">
          {items.map(e => {
            const own = me?.handle !== null && me?.handle === e.handle
            const href = citationHref(e.citation)
            return (
              <li key={e.id} className="space-y-1.5 py-3 font-sans text-sm text-ink">
                <span className="block text-base font-medium">
                  {e.page ? (
                    <Link to={entityHref(e.page.entityType, e.page.slug)} className="hover:underline">
                      {formatDrugName(e.page.name)}
                    </Link>
                  ) : (
                    `PCID-${e.pcid}`
                  )}{' '}
                  · {KEY_LABEL[e.property_key] ?? e.property_key}
                </span>
                <span className="block whitespace-pre-line">{e.value ?? <em>Clear the community value</em>}</span>
                <span className="block">
                  Source:{' '}
                  {href ? (
                    <a href={href} target="_blank" rel="nofollow ugc noopener noreferrer" className="underline underline-offset-2">
                      {e.citation}
                    </a>
                  ) : (
                    e.citation
                  )}{' '}
                  · {e.summary} · @{e.handle}
                  {e.credential ? ` · ${e.credential}` : ''} · {STATUS_LABEL[e.patrol_status]}
                </span>
                {me?.patroller && !own && (
                  <span className="flex flex-wrap gap-2 pt-1">
                    {e.patrol_status === 'pending' ? (
                      <>
                        <Button size="sm" disabled={busy !== null} onClick={() => run(e.id, () => reviewInfoboxEdit(e.id, true, ''), 'Accepted.')}>
                          Accept
                        </Button>
                        <Button size="sm" onClick={() => setRejecting(e.id)}>
                          Reject
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" disabled={busy !== null} onClick={() => run(e.id, () => patrolInfoboxEdit(e.id), 'Marked reviewed.')}>
                        Mark reviewed
                      </Button>
                    )}
                  </span>
                )}
                {me?.patroller && own && <span className="block">Your change: another reviewer has to check it.</span>}
                {rejecting === e.id && (
                  <form
                    className="max-w-xl space-y-2 pt-1"
                    onSubmit={ev => {
                      ev.preventDefault()
                      if (note.trim()) void run(e.id, () => reviewInfoboxEdit(e.id, false, note.trim()), 'Rejected.')
                    }}
                  >
                    <label htmlFor={`frej-${e.id}`} className="block text-sm font-semibold">
                      Why? (the author sees this)
                    </label>
                    <input
                      id={`frej-${e.id}`}
                      type="text"
                      value={note}
                      onChange={ev => setNote(ev.target.value)}
                      className="lp-field block w-full rounded-md px-3 py-1.5 text-sm text-ink"
                    />
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
      )}
    </section>
  )
}
