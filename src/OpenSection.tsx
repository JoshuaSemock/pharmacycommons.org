import { useState } from 'react'
import { Link } from 'react-router-dom'
import WikiMarkdown from './components/WikiMarkdown'
import { usePageContent } from './pageContent'
import type { PageContent } from './pageContent'
import { entityHref } from './wiki'

/**
 * The open, community-written section of a page (phase 15, docs/user-edits.md §2).
 *
 * Sits after Quick Facts in the reading order: the description as its lead,
 * then the contributor's markdown body with [[links]] and {{values}}, a line
 * saying who wrote it and when it was last patrolled, and "What links here".
 *
 * Read-only for now. The editor (save_page) is the next build step; until it
 * ships, the empty state says so instead of offering a button that does nothing.
 *
 * `fallbackDescription` is moieties.description_text, shown until the page has
 * its own description in page_content.
 */

const SECTION_HEADING = { fontSize: 'var(--text-xl)', fontFamily: 'var(--font-sans)', lineHeight: 1.25 } as const
const GROUP_HEADING = { fontSize: 'var(--text-base)', fontFamily: 'var(--font-sans)', lineHeight: 1.4 } as const
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const LINK = `text-ink underline decoration-hepatica-300 underline-offset-2 hover:decoration-hepatica-600 ${FOCUS}`
const ANCHOR_OFFSET = 'scroll-mt-[calc(var(--nav-h,3.5rem)_+_1rem)]'
const BACKLINK_PREVIEW = 12

export const OPEN_SECTION_ID = 'overview'

type Props = {
  pcidCode: string
  name: string
  fallbackDescription: string | null
  labelAnchor: string
  className?: string
}

export default function OpenSection({ pcidCode, name, fallbackDescription, labelAnchor, className = '' }: Props) {
  const { data, failed } = usePageContent(pcidCode)
  const headingId = `${OPEN_SECTION_ID}-heading`

  return (
    <section id={OPEN_SECTION_ID} aria-labelledby={headingId} className={`${className} ${ANCHOR_OFFSET} min-w-0`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="font-semibold text-ink" style={SECTION_HEADING}>
          Overview
        </h2>
        <span className="lp-raised rounded px-2 py-0.5 font-sans text-sm text-ink">Community-written</span>
      </div>

      {failed ? (
        <p className="font-sans text-base text-ink">The overview couldn’t be loaded right now.</p>
      ) : !data ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading">
          <div className="h-4 w-4/5 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
          <div className="h-4 w-3/5 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
        </div>
      ) : (
        <OverviewBody data={data} name={name} fallbackDescription={fallbackDescription} labelAnchor={labelAnchor} />
      )}
    </section>
  )
}

export function OverviewBody({
  data,
  name,
  fallbackDescription,
  labelAnchor,
}: {
  data: PageContent
  name: string
  fallbackDescription: string | null
  labelAnchor: string
}) {
  const description = data.description.trim() || fallbackDescription || ''
  const body = data.body.trim()
  const empty = !description && !body

  return (
    <div className="space-y-6">
      {empty ? (
        <p className="max-w-2xl font-sans text-base leading-relaxed text-ink">
          No overview has been written for {name} yet. Verified providers will be able to write one here: practical
          notes, calculations and context the label leaves out, linked to other pages.
        </p>
      ) : (
        <div className="space-y-4">
          {description && (
            <div className="max-w-2xl [&_p]:text-lg">
              <WikiMarkdown source={description} links={data.links} properties={data.properties} labelAnchor={labelAnchor} />
            </div>
          )}
          {body && <WikiMarkdown source={body} links={data.links} properties={data.properties} labelAnchor={labelAnchor} />}
        </div>
      )}

      <StatusLine data={data} hasText={!empty} />

      {data.backlinks.length > 0 && <Backlinks pages={data.backlinks} />}
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function StatusLine({ data, hasText }: { data: PageContent; hasText: boolean }) {
  const parts: string[] = []
  if (hasText) {
    parts.push('Written and edited by NPI-verified providers.')
    if (data.currentStatus === 'unpatrolled') parts.push('The latest change hasn’t been reviewed yet.')
    else if (data.lastPatrolledAt) parts.push(`Last reviewed ${formatDate(data.lastPatrolledAt)}.`)
  }
  if (data.protection === 'reviewed') {
    parts.push('High-alert page: changes are reviewed before they appear.')
    if (data.pendingCount > 0) parts.push(`${data.pendingCount} change${data.pendingCount === 1 ? '' : 's'} awaiting review.`)
  } else if (data.protection === 'patrollers') {
    parts.push('This page is locked to reviewers.')
  }
  if (parts.length === 0) return null

  return (
    <p className="lp-rule-t pt-3 font-sans text-sm leading-relaxed text-ink">
      {parts.join(' ')}{' '}
      {hasText && (
        <>
          Not professional advice; see the{' '}
          <Link to="/disclaimer" className={LINK}>
            medical disclaimer
          </Link>
          .
        </>
      )}
    </p>
  )
}

function Backlinks({ pages }: { pages: PageContent['backlinks'] }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? pages : pages.slice(0, BACKLINK_PREVIEW)
  return (
    <div>
      <h3 className="mb-2 font-semibold text-ink" style={GROUP_HEADING}>
        What links here
      </h3>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 font-sans text-base text-ink">
        {visible.map(p => (
          <li key={p.pcid}>
            <Link to={entityHref(p.entityType, p.slug)} className={LINK}>
              {p.name}
            </Link>
          </li>
        ))}
      </ul>
      {pages.length > BACKLINK_PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className={`mt-2 font-sans text-sm font-medium text-ink hover:underline ${FOCUS}`}
        >
          {showAll ? 'Show fewer' : `Show all ${pages.length}`}
        </button>
      )}
    </div>
  )
}
