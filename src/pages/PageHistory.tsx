import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import RevisionActions from '../components/RevisionActions'
import RevisionDiff from '../components/RevisionDiff'
import { useSession } from '../auth'
import { useContributorStatus } from '../contribute'
import { STATUS_LABEL, getCurrentRevisionId, getHistory, getPageBySlug } from '../history'
import type { HistoryEntry, PageRef } from '../history'
import { formatDrugName } from '../names'
import { entityHref } from '../wiki'

/**
 * /drugs/:slug/history — every saved version of a page's Overview
 * (phase 15, docs/user-edits.md §3).
 *
 * Newest first, each with author (@handle · credential), summary, size
 * change and review status. Opening one shows what it changed against the
 * version it was written on, plus Restore / Mark reviewed / Accept / Reject
 * for people allowed to use them.
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const H1 = { fontSize: 'var(--text-3xl)', fontFamily: 'var(--font-sans)', lineHeight: 1.15 } as const

type State = { page: PageRef; entries: HistoryEntry[]; current: number | null } | 'loading' | 'missing' | 'failed'

export default function PageHistory() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { user, loading: sessionLoading } = useSession()
  const status = useContributorStatus(user?.id ?? null, sessionLoading)
  const [state, setState] = useState<State>('loading')
  const [open, setOpen] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const load = useCallback(async () => {
    const page = await getPageBySlug(slug)
    if (!page) return 'missing' as const
    const [entries, current] = await Promise.all([getHistory(page.pcid), getCurrentRevisionId(page.pcid)])
    return { page, entries, current }
  }, [slug])

  useEffect(() => {
    let cancelled = false
    load()
      .then(s => {
        if (!cancelled) setState(s)
      })
      .catch(() => {
        if (!cancelled) setState('failed')
      })
    return () => {
      cancelled = true
    }
  }, [load, version])

  const name = typeof state === 'object' ? formatDrugName(state.page.name) : slug
  useEffect(() => {
    document.title = `History: ${name} · Pharmacy Commons`
  }, [name])

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 py-4 font-sans text-sm text-ink">
        <Link to="/" className={`hover:underline ${FOCUS}`}>
          Browse
        </Link>
        <span aria-hidden="true">/</span>
        {typeof state === 'object' ? (
          <Link to={entityHref(state.page.entityType, state.page.slug)} className={`hover:underline ${FOCUS}`}>
            {name}
          </Link>
        ) : (
          <span>{name}</span>
        )}
        <span aria-hidden="true">/</span>
        <span className="font-medium">History</span>
      </nav>

      <header className="mb-8 border-b border-ink/15 pb-6">
        <h1 className="font-semibold text-ink" style={H1}>
          Overview history: {name}
        </h1>
        <p className="mt-2 max-w-2xl font-sans text-base leading-relaxed text-ink">
          Every saved version of this page’s community-written Overview, newest first. Open a version to see what it
          changed.
          {status.kind === 'ready' && status.patroller && (
            <>
              {' '}
              <Link to="/review" className="font-medium underline underline-offset-2">
                Open the review queue
              </Link>
              .
            </>
          )}
        </p>
      </header>

      {notice && (
        <p role="status" className="mb-6 rounded-md border border-sky-300 bg-sky-100/40 px-3 py-2 font-sans text-sm text-ink">
          {notice}
        </p>
      )}

      {state === 'loading' ? (
        <div className="h-32 animate-pulse rounded-md bg-ink/10 motion-reduce:animate-none" aria-busy="true" />
      ) : state === 'missing' ? (
        <p className="font-sans text-base text-ink">No page has the address “{slug}”.</p>
      ) : state === 'failed' ? (
        <p className="font-sans text-base text-ink">The history couldn’t be loaded right now.</p>
      ) : state.entries.length === 0 ? (
        <p className="font-sans text-base text-ink">
          Nobody has written this page’s Overview yet.{' '}
          <Link to={entityHref(state.page.entityType, state.page.slug)} className="font-medium underline underline-offset-2">
            Back to {name}
          </Link>
        </p>
      ) : (
        <ol className="lp-divide-y max-w-4xl">
          {state.entries.map(e => (
            <li key={e.id} className="py-3">
              <EntryRow entry={e} isCurrent={e.id === state.current} open={open === e.id} onToggle={() => setOpen(o => (o === e.id ? null : e.id))} />
              {open === e.id && (
                <div className="mt-3 space-y-3 pl-0 sm:pl-6">
                  <RevisionDiff revisionId={e.id} />
                  <RevisionActions
                    pcid={state.page.pcid}
                    revisionId={e.id}
                    revisionStatus={e.patrol_status}
                    authorHandle={e.handle}
                    isCurrent={e.id === state.current}
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
    </main>
  )
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function EntryRow({
  entry,
  isCurrent,
  open,
  onToggle,
}: {
  entry: HistoryEntry
  isCurrent: boolean
  open: boolean
  onToggle: () => void
}) {
  const delta = entry.size_delta > 0 ? `+${entry.size_delta}` : `${entry.size_delta}`
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-left font-sans text-ink ${FOCUS}`}
    >
      <span className="min-w-0">
        <span className="block text-base font-medium [overflow-wrap:anywhere]">{entry.summary}</span>
        <span className="block text-sm">
          @{entry.handle}
          {entry.credential ? ` · ${entry.credential}` : ''} · {formatWhen(entry.created_at)}
          {entry.kind === 'revert' ? ' · restore' : ''}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1 text-sm">
        <span className="font-mono" aria-label={`${delta} characters`}>
          {delta}
        </span>
        <span className="flex flex-wrap justify-end gap-1">
          {isCurrent && <span className="lp-raised rounded px-1.5 py-0.5">live</span>}
          <span
            className={`rounded px-1.5 py-0.5 ${
              entry.patrol_status === 'pending' || entry.patrol_status === 'unpatrolled'
                ? 'border border-marigold-300 bg-marigold-100/50'
                : entry.patrol_status === 'rejected' || entry.patrol_status === 'reverted'
                  ? 'border border-rose-300 bg-rose-100/40'
                  : 'lp-sunken'
            }`}
          >
            {STATUS_LABEL[entry.patrol_status]}
          </span>
        </span>
      </span>
    </button>
  )
}
