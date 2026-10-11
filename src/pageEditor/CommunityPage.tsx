/**
 * The community layer of a page (docs/page-editor.md), shared by drug, concept,
 * herbal and class pages: the page model sets the main column's order and
 * holds the lead and sections. Each section, the lead, Quick Facts and the
 * brand line have an [edit] link that opens that part in the page editor in
 * place; "Edit page" opens the whole page at /drugs/:slug/edit. Until the
 * phase-16 migration is applied the model reports `legacy` and pages keep the
 * phase-15 Overview.
 *
 * Moved out of DrugDetail.tsx on 2026-10-11 so class pages can use it (§9 Q5).
 */

import { Suspense, lazy, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Backlinks, OPEN_SECTION_ID, StatusLine } from '../OpenSection'
import { usePageContent } from '../pageContent'
import { templateFor, templateModel } from '../pageSource'
import type { FragmentTarget, MainItem, PageType } from '../pageSource'
import { displayContext, usePageModel } from './usePageModel'
import { publishedNotice, useEditAccess } from './access'
import type { PublishResult } from './api'
import { CommunitySection, EditLink, Frame, LeadText, ReferencesList, isEmptySection } from './PageParts'

const PageEditor = lazy(() => import('./PageEditor'))

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const ANCHOR_OFFSET = 'scroll-mt-[calc(var(--nav-h,3.5rem)_+_1rem)]'

export type CommunityPage = ReturnType<typeof useCommunityPage>

/**
 * The page model, the community content (links, values, backlinks), edit access
 * and the in-place editor state for one page. `entityType` is the raw
 * entities.entity_type; `pageType` picks the template (pageTypeFor).
 */
export function useCommunityPage(pcidCode: string, entityType: string, pageType: PageType, title: string) {
  const pcid = Number(pcidCode.replace(/^PCID-/, ''))
  const ctx = useMemo(() => displayContext(pageType, title, entityType), [pageType, title, entityType])
  const { state, reload } = usePageModel(pcid, ctx)
  const content = usePageContent(pcidCode)
  const access = useEditAccess()
  const [editing, setEditing] = useState<FragmentTarget | null>(null)
  // "Published" notice when returning from /drugs/:slug/edit.
  const location = useLocation()
  const [notice, setNotice] = useState<string | null>(() => (location.state as { notice?: string } | null)?.notice ?? null)
  const [version, setVersion] = useState(0)
  const canEdit = state.status === 'ready' && access.status.kind === 'ready'
  return {
    pcid,
    ctx,
    state,
    content,
    access,
    editing,
    notice,
    version,
    canEdit,
    edit: (target: FragmentTarget) => {
      setNotice(null)
      setEditing(target)
    },
    close: () => setEditing(null),
    onPublished: (r: PublishResult) => {
      setEditing(null)
      setNotice(publishedNotice(r.status, access.status.kind === 'ready' && access.status.patroller))
      reload()
      content.reload()
      setVersion(v => v + 1)
    },
  }
}

/** The main column in page order: the saved model, or the template while it loads. */
export function mainItems(page: CommunityPage): MainItem[] {
  return page.state.status === 'ready' ? page.state.model.main : templateModel(page.ctx).main
}

function sameTarget(a: FragmentTarget | null, b: FragmentTarget): boolean {
  if (!a || a.kind !== b.kind) return false
  if (a.kind === 'section' && b.kind === 'section') return a.heading.toLowerCase() === b.heading.toLowerCase()
  if (a.kind === 'rail' && b.kind === 'rail') return a.name === b.name
  return true
}

function InlineEditor({ page, name, target }: { page: CommunityPage; name: string; target: FragmentTarget }) {
  if (page.access.status.kind !== 'ready') return null
  return (
    <div className="lp-raised rounded-md p-4">
      <Suspense fallback={<SectionSkeleton />}>
        <PageEditor
          pcid={page.pcid}
          name={name}
          target={target}
          status={page.access.status}
          onHandleSet={page.access.refresh}
          onClose={page.close}
          onPublished={page.onPublished}
        />
      </Suspense>
    </div>
  )
}

/** Edit page · History · Review queue, under the page title. */
export function PageTools({ page, slug }: { page: CommunityPage; slug: string }) {
  const status = page.access.status
  const hasHistory = (page.content.data?.currentRevisionId ?? null) !== null || (page.content.data?.pendingCount ?? 0) > 0
  if (page.state.status !== 'ready' && !hasHistory) return null
  return (
    <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-sans text-sm text-ink">
      {page.canEdit && (
        <Link to={`/drugs/${slug}/edit`} className={`lp-press inline-flex items-center rounded-md px-2.5 py-1 ${FOCUS}`}>
          Edit page
        </Link>
      )}
      {hasHistory && (
        <Link to={`/drugs/${slug}/history`} className={`lp-press inline-flex items-center rounded-md px-2.5 py-1 ${FOCUS}`}>
          History
        </Link>
      )}
      {status.kind === 'ready' && status.patroller && (
        <Link to="/review" className={`lp-press inline-flex items-center rounded-md px-2.5 py-1 ${FOCUS}`}>
          Review queue
        </Link>
      )}
      {status.kind === 'signed-out' && page.state.status === 'ready' && (
        <Link to="/account" className={`lp-press inline-flex items-center rounded-md px-2.5 py-1 ${FOCUS}`}>
          Sign in to edit
        </Link>
      )}
      {status.kind === 'unverified' && page.state.status === 'ready' && (
        <Link to="/account" className={`lp-press inline-flex items-center rounded-md px-2.5 py-1 ${FOCUS}`}>
          Verify your NPI to edit
        </Link>
      )}
    </p>
  )
}

/** The lead, plus the notices and editors that belong at the top of the main column. */
export function LeadArea({
  page,
  name,
  labelAnchor,
  fallback,
  style,
}: {
  page: CommunityPage
  name: string
  labelAnchor: string
  fallback: string | null
  style: CSSProperties
}) {
  const ready = page.state.status === 'ready' ? page.state : null
  const lead = ready?.model.main.find((m): m is Extract<MainItem, { kind: 'lead' }> => m.kind === 'lead')
  const text = lead?.markdown.trim() || fallback?.trim() || ''
  const rail = page.editing?.kind === 'rail' ? page.editing : null
  return (
    <section id={OPEN_SECTION_ID} aria-label="Overview" className={`${ANCHOR_OFFSET} min-w-0 space-y-4`} style={style}>
      {page.notice && (
        <p role="status" className="rounded-md border border-sky-300 bg-sky-100/40 px-3 py-2 font-sans text-sm text-ink">
          {page.notice}
        </p>
      )}
      {rail && <InlineEditor page={page} name={name} target={rail} />}
      {sameTarget(page.editing, { kind: 'lead' }) ? (
        <InlineEditor page={page} name={name} target={{ kind: 'lead' }} />
      ) : !ready ? (
        <SectionSkeleton />
      ) : (
        <>
          {text ? (
            <LeadText markdown={text} content={page.content.data} numbers={ready.numbers} labelAnchor={labelAnchor} />
          ) : (
            <p className="max-w-2xl font-sans text-base leading-relaxed text-ink">
              No overview has been written for {name} yet.
              {page.canEdit ? ' Start with a few sentences on what it is and how it’s used.' : ' NPI-verified providers can write one.'}
            </p>
          )}
          {page.canEdit && (
            <div>
              <EditLink onClick={() => page.edit({ kind: 'lead' })} label="Edit the lead" />
            </div>
          )}
        </>
      )}
      {page.content.data && <StatusLine data={page.content.data} hasText={Boolean(text) || ready?.model.main.some(m => m.kind === 'section' && !isEmptySection(m)) === true} />}
      {page.content.data && page.content.data.backlinks.length > 0 && <Backlinks pages={page.content.data.backlinks} />}
    </section>
  )
}

export function SectionArea({
  page,
  item,
  name,
  labelAnchor,
  style,
}: {
  page: CommunityPage
  item: Extract<MainItem, { kind: 'section' }>
  name: string
  labelAnchor: string
  style: CSSProperties
}) {
  const target: FragmentTarget = { kind: 'section', heading: item.heading }
  if (sameTarget(page.editing, target)) {
    return (
      <div className="min-w-0" style={style}>
        <InlineEditor page={page} name={name} target={target} />
      </div>
    )
  }
  const numbers = page.state.status === 'ready' ? page.state.numbers : new Map<string, number>()
  return (
    <CommunitySection
      item={item}
      content={page.content.data}
      numbers={numbers}
      labelAnchor={labelAnchor}
      onEdit={page.canEdit ? () => page.edit(target) : undefined}
      help={sectionHelp(page, item)}
      style={style}
    />
  )
}

/** What a template section is for (shown to editors while it's empty; docs/page-editor.md §9 Q4). */
function sectionHelp(page: CommunityPage, item: Extract<MainItem, { kind: 'section' }>): string | undefined {
  if (!item.template) return undefined
  const t = templateFor(page.ctx).main.find(m => m.kind === 'section' && m.id === item.id)
  return t && t.kind === 'section' ? t.help : undefined
}

export function ReferencesFrame({ page, style }: { page: CommunityPage; style: CSSProperties }) {
  const refs = page.state.status === 'ready' ? page.state.references : []
  if (!refs.length) return null
  return (
    <Frame id="references" title="References" style={style}>
      <ReferencesList references={refs} />
    </Frame>
  )
}

/** Holds a loading section's space with the same quiet pulse used across the page (no layout jump on resolve). */
export function SectionSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-4/5 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
      <div className="h-4 w-3/5 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
      <div className="h-4 w-2/5 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
    </div>
  )
}
