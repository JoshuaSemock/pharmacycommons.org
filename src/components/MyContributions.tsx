import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { contributionStatus, countContributions, getMyContributions } from '../contributions'
import type { Contribution } from '../contributions'
import { INFOBOX_KEY_LABEL } from '../infobox'
import { brandActionText } from '../brands'
import type { BrandAction } from '../brands'
import { formatDrugName } from '../names'
import { entityHref } from '../wiki'

/**
 * Account → My contributions (phase 15g): the signed-in contributor's Overview
 * edits, Quick Facts values and created pages, newest first, each with its
 * status and any note a reviewer left. Reads my_contributions(), which only
 * ever returns the caller's own rows.
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const LINK = `text-ink underline decoration-hepatica-300 underline-offset-2 hover:decoration-hepatica-600 ${FOCUS}`

type Filter = 'all' | 'waiting' | 'pages'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'waiting', label: 'Waiting or not accepted' },
  { key: 'pages', label: 'Pages created' },
]

function whatLabel(c: Contribution): string {
  if (c.kind === 'new_page') return 'Created the page'
  if (c.kind === 'brand') {
    const [action, ...rest] = (c.property_key ?? '').split(':')
    return `Brand names: ${brandActionText(action as BrandAction, rest.join(':'))}`
  }
  if (c.kind === 'fact') return `Quick Facts: ${INFOBOX_KEY_LABEL[c.property_key ?? ''] ?? c.property_key}`
  return 'Overview'
}

function displayName(c: Contribution): string {
  return c.entity_type === 'moiety' || c.entity_type === 'precise_form' || c.entity_type === 'combination'
    ? formatDrugName(c.name)
    : c.name
}

export default function MyContributions() {
  const [rows, setRows] = useState<Contribution[] | 'loading' | 'failed'>('loading')
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let cancelled = false
    getMyContributions()
      .then(r => {
        if (!cancelled) setRows(r)
      })
      .catch(err => {
        console.error('Failed to load contributions', err)
        if (!cancelled) setRows('failed')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (rows === 'loading') return <p className="font-sans text-sm text-ink">Loading your contributions…</p>
  if (rows === 'failed') return <p className="font-sans text-sm text-ink">Your contributions couldn’t be loaded right now.</p>

  if (rows.length === 0) {
    return (
      <div className="border-t border-ink/15 py-6">
        <p className="max-w-xl font-sans text-sm leading-relaxed text-ink">
          Nothing yet. Once your NPI is verified, use <span className="font-medium">Edit</span> on any page’s
          Overview or Quick Facts, or{' '}
          <Link to="/new" className={LINK}>
            create a page
          </Link>
          . Everything you change will be listed here with its review status.
        </p>
      </div>
    )
  }

  const counts = countContributions(rows)
  const shown = rows.filter(r =>
    filter === 'all' ? true : filter === 'pages' ? r.kind === 'new_page' : r.patrol_status === 'pending' || r.patrol_status === 'rejected',
  )

  return (
    <div className="space-y-4">
      <p className="font-sans text-sm text-ink">
        {counts.total} {counts.total === 1 ? 'change' : 'changes'} · {counts.live} live
        {counts.pending > 0 && ` · ${counts.pending} waiting for review`}
        {counts.rejected > 0 && ` · ${counts.rejected} not accepted`}
        {counts.pages > 0 && ` · ${counts.pages} ${counts.pages === 1 ? 'page' : 'pages'} created`}
      </p>

      <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <label key={f.key} className="relative cursor-pointer">
            <input
              type="radio"
              name="contrib-filter"
              checked={filter === f.key}
              onChange={() => setFilter(f.key)}
              className="peer sr-only"
            />
            <span className="block rounded-md px-3 py-1 font-sans text-sm text-ink lp-chip peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30">
              {f.label}
            </span>
          </label>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="border-t border-ink/15 py-4 font-sans text-sm text-ink">Nothing here.</p>
      ) : (
        <ol className="border-t border-ink/15">
          {shown.map(c => {
            const href = entityHref(c.entity_type, c.slug)
            return (
              <li key={`${c.kind}-${c.item_id}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-b border-ink/15 py-3">
                <span className="min-w-0 font-sans text-base font-medium text-ink [overflow-wrap:anywhere]">
                  <Link to={href} className="lp-press inline-flex items-center rounded-md px-2 py-0.5">
                    {displayName(c)}
                  </Link>
                </span>
                <span className="text-right font-sans text-sm text-ink">{contributionStatus(c)}</span>
                <span className="col-span-2 min-w-0 font-sans text-sm text-ink [overflow-wrap:anywhere]">
                  {whatLabel(c)}
                  {c.summary && c.kind !== 'new_page' && <> · {c.summary}</>} ·{' '}
                  <time dateTime={c.created_at}>{new Date(c.created_at).toLocaleString()}</time>
                  {c.kind === 'page' && (
                    <>
                      {' '}
                      ·{' '}
                      <Link to={`/drugs/${c.slug}/history`} className={LINK}>
                        History
                      </Link>
                    </>
                  )}
                </span>
                {c.review_note && (
                  <span className="col-span-2 font-sans text-sm text-ink">
                    Reviewer’s note: <span className="italic">{c.review_note}</span>
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
