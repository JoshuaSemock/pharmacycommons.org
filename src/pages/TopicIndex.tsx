import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { bucketLabel, bucketName, bucketToParam } from '../catalog'
import {
  TOPIC_KINDS,
  filterTopics,
  groupByLetter,
  kindCounts,
  kindLabelOf,
  kindOneOf,
  loadTopics,
  sortTopics,
  subtypeCounts,
} from '../topics'
import type { Topic, TopicKind, TopicSort } from '../topics'
import { newPageHref } from '../wiki'

/**
 * /topics — browse everything that isn't a drug (blocks 6–9).
 *
 * Finding a page you don't know exists, without a link or a name to type:
 *   1. Narrow by kind (clinical concepts, labs, targets, herbals), then by
 *      subtype (Indication, Symptom, CYP450 Enzyme…), each with its count, so
 *      the shape of what exists is visible before reading a single name.
 *   2. Read the whole narrowed set on one page, A–Z, with a letter strip.
 *   3. Or sort by "Most connected": topics the most drugs and pages point at
 *      come first, which surfaces the important ones in an unfamiliar area.
 *   4. A filter box narrows in place (name or subtype), and when nothing
 *      matches, the page offers to create it.
 * State lives in the URL (?kind=&type=&q=&sort=), so any view can be shared.
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const CHIP =
  'block rounded-md px-3 py-1 font-sans text-[13px] text-ink shadow-emboss peer-checked:font-medium peer-checked:shadow-deboss peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30'
const FIELD = 'lp-field block w-full rounded-md px-3 py-2 font-sans text-ink placeholder:text-ink/60'
const NO_SUBTYPE = '_none'

function isKind(v: string | null): v is TopicKind {
  return TOPIC_KINDS.some(k => k.key === v)
}

export default function TopicIndex() {
  const [params, setParams] = useSearchParams()
  const [topics, setTopics] = useState<Topic[] | 'failed' | null>(null)

  const kindParam = params.get('kind')
  const kind = isKind(kindParam) ? kindParam : null
  const typeParam = params.get('type')
  const subtype = kind && typeParam ? (typeParam === NO_SUBTYPE ? null : typeParam) : undefined
  const q = params.get('q') ?? ''
  const sort: TopicSort = params.get('sort') === 'connected' ? 'connected' : 'az'

  useEffect(() => {
    document.title = 'Topics · Pharmacy Commons'
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadTopics(controller.signal)
      .then(setTopics)
      .catch(err => {
        if (controller.signal.aborted) return
        console.error('Failed to load topics', err)
        setTopics('failed')
      })
    return () => controller.abort()
  }, [])

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') p.delete(k)
      else p.set(k, v)
    }
    setParams(p, { replace: true })
  }

  const all = Array.isArray(topics) ? topics : []
  const counts = useMemo(() => kindCounts(all), [all])
  const subtypes = useMemo(() => (kind ? subtypeCounts(all, kind) : []), [all, kind])
  const shown = useMemo(() => {
    const f = filterTopics(all, { kind, subtype: subtype === undefined ? null : subtype, q })
    // filterTopics treats a null subtype as "any"; "Other" (no subtype) is its own choice.
    return subtype === null ? f.filter(t => t.subtype === null) : f
  }, [all, kind, subtype, q])
  const groups = useMemo(() => (sort === 'az' ? groupByLetter(shown) : []), [shown, sort])
  const ranked = useMemo(() => (sort === 'connected' ? sortTopics(shown, 'connected') : []), [shown, sort])

  const scopeLabel =
    subtype !== undefined
      ? `${subtype ?? 'Other'} (${kindLabelOf(kind as TopicKind).toLowerCase()})`
      : kind
        ? kindLabelOf(kind).toLowerCase()
        : 'topics'

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <header className="border-b border-ink/15 pb-10 pt-10 sm:pt-14">
        <h1
          className="font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.015em] text-ink sm:text-[2.618rem]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Topics
        </h1>
        <p className="mt-5 max-w-[42rem] font-sans text-[17px] leading-relaxed text-ink">
          Everything in the Commons that isn’t a drug: the conditions drugs treat and cause, the labs that monitor
          them, the enzymes and transporters they act on, and the plants medicines come from. Narrow by kind, read the
          list A to Z, or sort by how many drugs and pages connect to each.
        </p>
        <p className="mt-6 flex flex-wrap gap-2.5">
          <HeaderLink to="/browse">Drugs A to Z</HeaderLink>
          <HeaderLink to="/classifications">Classifications</HeaderLink>
          <HeaderLink to="/lists">Lists</HeaderLink>
          <HeaderLink to="/new">Create a page</HeaderLink>
        </p>
      </header>

      {topics === 'failed' ? (
        <p className="py-10 font-sans text-[15px] text-ink">Topics couldn’t be loaded right now.</p>
      ) : topics === null ? (
        <div className="space-y-3 py-9" aria-busy="true">
          <div className="h-8 w-3/4 animate-pulse rounded-md bg-ink/10 motion-reduce:animate-none" />
          <div className="h-48 animate-pulse rounded-md bg-ink/10 motion-reduce:animate-none" />
        </div>
      ) : (
        <>
          <section aria-label="Narrow the list" className="space-y-5 border-b border-ink/15 py-8">
            <ChipGroup label="Kind">
              <Chip name="topic-kind" checked={!kind} onChange={() => update({ kind: null, type: null })}>
                All <Count n={all.length} />
              </Chip>
              {TOPIC_KINDS.map(k => (
                <Chip key={k.key} name="topic-kind" checked={kind === k.key} onChange={() => update({ kind: k.key, type: null })}>
                  {k.label} <Count n={counts[k.key]} />
                </Chip>
              ))}
            </ChipGroup>
            {kind && <p className="-mt-2 font-sans text-[13.5px] text-ink">{TOPIC_KINDS.find(k => k.key === kind)?.hint}.</p>}

            {kind && subtypes.length > 1 && (
              <ChipGroup label="Type">
                <Chip name="topic-type" checked={subtype === undefined} onChange={() => update({ type: null })}>
                  Any <Count n={counts[kind]} />
                </Chip>
                {subtypes.map(s => (
                  <Chip
                    key={s.subtype ?? NO_SUBTYPE}
                    name="topic-type"
                    checked={subtype === s.subtype}
                    onChange={() => update({ type: s.subtype ?? NO_SUBTYPE })}
                  >
                    {s.subtype ?? 'Other'} <Count n={s.count} />
                  </Chip>
                ))}
              </ChipGroup>
            )}

            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div className="w-full max-w-sm">
                <label htmlFor="topic-filter" className="mb-1.5 block font-sans text-[13px] font-semibold text-ink">
                  Filter by name
                </label>
                <input
                  id="topic-filter"
                  type="search"
                  value={q}
                  onChange={e => update({ q: e.target.value })}
                  placeholder={`Filter ${shown.length === all.length ? all.length : 'these'} topics`}
                  autoComplete="off"
                  className={FIELD}
                  style={{ fontSize: '15px' }}
                />
              </div>
              <ChipGroup label="Order">
                <Chip name="topic-sort" checked={sort === 'az'} onChange={() => update({ sort: null })}>
                  A to Z
                </Chip>
                <Chip name="topic-sort" checked={sort === 'connected'} onChange={() => update({ sort: 'connected' })}>
                  Most connected
                </Chip>
              </ChipGroup>
            </div>
          </section>

          <section aria-live="polite" className="pt-8">
            <p className="mb-6 font-sans text-[14px] text-ink">
              {shown.length.toLocaleString()} {shown.length === 1 && scopeLabel === 'topics' ? 'topic' : scopeLabel}
              {q.trim() && <> matching “{q.trim()}”</>}
            </p>

            {shown.length === 0 ? (
              <p className="py-8 font-sans text-[15px] text-ink">
                Nothing matches.{' '}
                {q.trim() && (
                  <Link to={newPageHref(q)} className={`underline underline-offset-2 ${FOCUS}`}>
                    Create a page for “{q.trim()}”
                  </Link>
                )}
              </p>
            ) : sort === 'connected' ? (
              <ol className="max-w-3xl">
                {ranked.map((t, i) => (
                  <li key={t.pcid} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-ink/10 py-2.5">
                    <span className="font-mono text-[12px] text-ink">{i + 1}</span>
                    <TopicName t={t} showKind={!kind} />
                    <span className="font-sans text-[13px] text-ink">{connectionsText(t.connections)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <>
                {groups.length > 1 && (
                  <nav aria-label="Jump to a letter" className="mb-8 flex flex-wrap gap-1">
                    {groups.map(g => (
                      <a
                        key={g.bucket}
                        href={`#topics-${bucketToParam(g.bucket)}`}
                        aria-label={bucketName(g.bucket)}
                        className={`lp-flat rounded px-2 py-1 font-sans text-[12.5px] text-ink ${FOCUS}`}
                      >
                        {bucketLabel(g.bucket)}
                      </a>
                    ))}
                  </nav>
                )}
                <div className="gap-x-10 sm:columns-2 lg:columns-3">
                  {groups.map(g => (
                    <div
                      key={g.bucket}
                      id={`topics-${bucketToParam(g.bucket)}`}
                      className="mb-7 break-inside-avoid scroll-mt-[calc(var(--nav-h,5.75rem)_+_1rem)]"
                    >
                      <div className="mb-1.5 flex items-baseline gap-2.5 border-b border-ink/15 pb-1">
                        <span className="font-display text-[22px] font-semibold leading-none text-ink" style={{ fontFamily: 'var(--font-display)' }}>
                          {bucketLabel(g.bucket)}
                        </span>
                        <span className="ml-auto font-mono text-[11px] text-ink">{g.items.length}</span>
                      </div>
                      <ul>
                        {g.items.map(t => (
                          <li key={t.pcid} className="py-1.5">
                            <TopicName t={t} showKind={!kind} withConnections />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </main>
  )
}

function connectionsText(n: number): string {
  return n === 0 ? 'no links yet' : `${n} linked`
}

function TopicName({ t, showKind, withConnections = false }: { t: Topic; showKind: boolean; withConnections?: boolean }) {
  const detail = [showKind ? kindOneOf(t.kind) : null, t.subtype, withConnections && t.connections > 0 ? `${t.connections} linked` : null, t.community ? 'contributor page' : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <span className="block min-w-0">
      <Link to={`/drugs/${t.slug}`} className={`font-sans text-[15px] font-medium text-ink hover:underline [overflow-wrap:anywhere] ${FOCUS}`}>
        {t.name}
      </Link>
      {detail && <span className="block font-sans text-[12.5px] text-ink">{detail}</span>}
    </span>
  )
}

function HeaderLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={`lp-raised lp-press rounded-md px-4 py-2 font-sans text-[13.5px] font-medium text-ink ${FOCUS}`}>
      {children}
    </Link>
  )
}

function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {children}
    </div>
  )
}

function Chip({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="relative cursor-pointer">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="peer sr-only" />
      <span className={CHIP}>{children}</span>
    </label>
  )
}

function Count({ n }: { n: number }) {
  return <span className="font-mono text-[11.5px]">{n}</span>
}
