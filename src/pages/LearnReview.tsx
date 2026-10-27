/**
 * /admin/learn — review Learn items and publish collections (admins only).
 *
 * Pick a template, read a seeded sample (50 at a time), then Approve (published), Flag (review_needed) or
 * Reject (archived) each item. A collection can be published once it has approved items. Nothing a learner
 * sees changes until an item is approved *and* its collection is published.
 *
 * Destination: src/pages/LearnReview.tsx
 */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button'
import { useSession } from '../auth'
import { isAdmin } from '../contributions'
import {
  reviewItems,
  reviewSummary,
  setCollectionStatus,
  setItemStatus,
  type ItemStatus,
  type ReviewItem,
  type ReviewSummary,
} from '../learn/review'

const PAGE = 50
const LINK = 'underline'

export default function LearnReview() {
  const { user, loading } = useSession()
  const [admin, setAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    document.title = 'Review Learn · Pharmacy Commons'
  }, [])
  useEffect(() => {
    if (loading) return
    if (!user) return setAdmin(false)
    let cancelled = false
    isAdmin().then(a => !cancelled && setAdmin(a))
    return () => {
      cancelled = true
    }
  }, [user, loading])

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <header className="mb-8 border-b border-ink/15 py-6">
        <h1 className="font-display text-[1.618rem] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
          Review Learn
        </h1>
        <p className="mt-2 max-w-2xl font-sans text-base leading-relaxed text-ink">
          Approve, flag or reject generated items, then publish a collection. <Link to="/admin" className={LINK}>Admin</Link>
        </p>
      </header>
      {admin === null ? (
        <div className="h-32 animate-pulse rounded-md bg-ink/10" aria-busy="true" />
      ) : !admin ? (
        <p className="font-sans text-base text-ink">
          This page is for Pharmacy Commons admins.{' '}
          {!user && (
            <Link to="/account" className={LINK}>
              Sign in
            </Link>
          )}
        </p>
      ) : (
        <Workspace />
      )}
    </main>
  )
}

function Workspace() {
  const [summary, setSummary] = useState<ReviewSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [template, setTemplate] = useState<string | null>(null)
  const [status, setStatus] = useState<ItemStatus>('draft')

  const refresh = useCallback(async () => {
    try {
      setSummary(await reviewSummary())
    } catch (e) {
      console.error(e)
      setError('The summary couldn’t be loaded.')
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  if (error) return <p className="font-sans text-base text-ink">{error}</p>
  if (!summary) return <div className="h-32 animate-pulse rounded-md bg-ink/10" aria-busy="true" />

  return (
    <div className="space-y-12">
      <section aria-label="Collections">
        <h2 className="font-sans text-lg font-semibold text-ink">Collections</h2>
        <ul className="mt-3 divide-y divide-ink/15 border-y border-ink/15">
          {summary.collections.map(c => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-sans text-[15px] font-medium text-ink">
                  {c.title} <span className="font-mono text-[12.5px] font-normal">({c.status})</span>
                </p>
                <p className="font-mono text-[12.5px] text-ink">
                  {c.published} approved · {c.draft} to review · {c.review_needed} flagged · {c.archived} rejected
                </p>
              </div>
              <CollectionToggle c={c} onDone={refresh} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Templates">
        <h2 className="font-sans text-lg font-semibold text-ink">Review by template</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.templates.map(t => (
            <Button key={t.template_key} size="sm" selected={template === t.template_key} onClick={() => setTemplate(t.template_key)}>
              {t.template_key} <span className="font-mono">{t.draft}</span>
            </Button>
          ))}
        </div>
        {template && (
          <>
            <div className="mt-4 flex gap-2">
              {(['draft', 'review_needed'] as const).map(s => (
                <Button key={s} size="sm" selected={status === s} onClick={() => setStatus(s)}>
                  {s === 'draft' ? 'To review' : 'Flagged'}
                </Button>
              ))}
            </div>
            <Sample key={`${template}:${status}`} template={template} status={status} onChanged={refresh} />
          </>
        )}
      </section>
    </div>
  )
}

function CollectionToggle({ c, onDone }: { c: ReviewSummary['collections'][number]; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const publish = c.status !== 'published'
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="font-sans text-[13px] text-ink">{msg}</span>}
      <Button
        size="sm"
        disabled={busy || (publish && c.published === 0)}
        title={publish && c.published === 0 ? 'Approve at least one item first' : undefined}
        onClick={async () => {
          if (publish && !window.confirm(`Publish “${c.title}” with ${c.published} approved items? Learners will see it.`)) return
          setBusy(true)
          setMsg(null)
          try {
            await setCollectionStatus(c.id, publish ? 'published' : 'draft')
            onDone()
          } catch (e) {
            console.error(e)
            setMsg('That didn’t work.')
          } finally {
            setBusy(false)
          }
        }}
      >
        {publish ? 'Publish' : 'Unpublish'}
      </Button>
    </div>
  )
}

function Sample({ template, status, onChanged }: { template: string; status: ItemStatus; onChanged: () => void }) {
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      // Decided items leave the status filter, so the next page is always offset 0 of what remains.
      const r = await reviewItems(template, status, PAGE, 0, 'audit')
      setItems(r.items)
      setTotal(r.total)
    } catch (e) {
      console.error(e)
      setFailed(true)
    }
  }, [template, status])
  useEffect(() => {
    void load()
  }, [load])

  const decide = async (ids: string[], to: ItemStatus) => {
    setBusy(true)
    try {
      await setItemStatus(ids, to)
      setItems(prev => (prev ? prev.filter(i => !ids.includes(i.id)) : prev))
      setTotal(t => t - ids.length)
      onChanged()
    } catch (e) {
      console.error(e)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  if (failed) return <p className="mt-6 font-sans text-base text-ink">That didn’t load or save. Try again.</p>
  if (!items) return <div className="mt-6 h-32 animate-pulse rounded-md bg-ink/10" aria-busy="true" />
  if (items.length === 0) return <p className="mt-6 font-sans text-base text-ink">Nothing left in this view.</p>

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[13px] text-ink">
          Showing {items.length} of {total}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Approve all ${items.length} items shown? Only do this after reading them.`))
                void decide(items.map(i => i.id), 'published')
            }}
          >
            Approve all shown
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void load()}>
            Reload
          </Button>
        </div>
      </div>
      <ol className="mt-4 space-y-4">
        {items.map(i => (
          <li key={i.id} className="lp-raised rounded-md p-5">
            <ItemView item={i} />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => void decide([i.id], 'published')}>
                Approve
              </Button>
              {i.status !== 'review_needed' && (
                <Button size="sm" disabled={busy} onClick={() => void decide([i.id], 'review_needed')}>
                  Flag
                </Button>
              )}
              <Button size="sm" disabled={busy} onClick={() => void decide([i.id], 'archived')}>
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function ItemView({ item }: { item: ReviewItem }) {
  return (
    <div className="font-sans text-[14.5px] leading-relaxed text-ink">
      <p className="text-[12.5px]">
        {item.item_type === 'mcq' ? 'Question' : 'Flashcard'} · {item.topic}
        {item.primary_name && (
          <>
            {' · '}
            <Link to={`/id/PCID-${item.primary_pcid}`} className="underline">
              {item.primary_name}
            </Link>
          </>
        )}
      </p>
      <p className="mt-1 text-[16px] font-medium">{item.prompt}</p>
      {item.mcq_options ? (
        <ul className="mt-2 space-y-1">
          {item.mcq_options.map(o => (
            <li key={o.id} className={o.is_correct ? 'font-semibold' : ''}>
              <span className="font-mono text-[12.5px]">{o.id}</span> {o.text}
              {o.is_correct && ' ✓'}
              {o.rationale && <span className="block pl-5 text-[13px] font-normal">{o.rationale}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2">Answer: {item.concise_answer}</p>
      )}
      {item.clinical_rationale && <p className="mt-2 text-[13.5px]">{item.clinical_rationale}</p>}
      {item.clinical_caveats && <p className="mt-1 text-[13px]">Note: {item.clinical_caveats}</p>}
      <p className="mt-2 text-[12.5px]">
        Source: {item.source_citation}
        {item.third_party_sources.length > 0 && ` · third-party: ${item.third_party_sources.join(', ')}`}
      </p>
    </div>
  )
}
