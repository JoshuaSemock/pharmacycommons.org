import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BUCKETS, bucketLabel, bucketName, bucketToParam, paramToBucket } from '../catalog'
import type { Bucket } from '../catalog'
import { countDictionary, displayDefinition, loadBucket, searchDictionary, tagOf, PAGE_SIZE } from '../dictionary'
import type { DictionaryEntry } from '../dictionary'
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
import { entityHref, newPageHref } from '../wiki'
import { slugify } from '../contribute'
import { supabase } from '../supabaseClient'

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
 *   5. "From the dictionary": the medical dictionary's abbreviations and the
 *      medical terms that aren't drug names (dictionary_terms, phase 14),
 *      a letter at a time. Terms are not pages: each offers "Start a page",
 *      or "Open the page" when a topic with that name exists. Drug and brand
 *      names stay out; they are drug pages already.
 * State lives in the URL (?kind=&type=&q=&sort=), so any view can be shared.
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const CHIP =
  'block rounded-md px-3 py-1 font-sans text-[13px] text-ink shadow-emboss peer-checked:font-medium peer-checked:shadow-deboss peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30'
const FIELD = 'lp-field block w-full rounded-md px-3 py-2 font-sans text-ink placeholder:text-ink/60'
const NO_SUBTYPE = '_none'

/** Dictionary entries shown on /topics: the words and abbreviations that aren't drug names. */
type DictKind = 'abbreviations' | 'terms'
const DICT_KINDS: { key: DictKind; label: string; hint: string }[] = [
  { key: 'abbreviations', label: 'Abbreviations', hint: 'Medical and pharmacy abbreviations with what they stand for, plus dose-writing rules' },
  { key: 'terms', label: 'Medical terms', hint: 'Words from the Pharmacy Commons medical dictionary that have no page yet. Start one from any term' },
]
const isDictKind = (v: string | null): v is DictKind => DICT_KINDS.some(k => k.key === v)

function isKind(v: string | null): v is TopicKind {
  return TOPIC_KINDS.some(k => k.key === v)
}

export default function TopicIndex() {
  const [params, setParams] = useSearchParams()
  const [topics, setTopics] = useState<Topic[] | 'failed' | null>(null)

  const kindParam = params.get('kind')
  const kind = isKind(kindParam) ? kindParam : null
  const dictKind = isDictKind(kindParam) ? kindParam : null
  const [dictCounts, setDictCounts] = useState<Record<DictKind, number> | null>(null)
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

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([countDictionary('abbreviations', controller.signal), countDictionary('terms', controller.signal)])
      .then(([abbreviations, terms]) => setDictCounts({ abbreviations, terms }))
      .catch(() => {}) // counts are decoration; the chips still work
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
              <Chip name="topic-kind" checked={!kind && !dictKind} onChange={() => update({ kind: null, type: null, letter: null })}>
                All <Count n={all.length} />
              </Chip>
              {TOPIC_KINDS.map(k => (
                <Chip key={k.key} name="topic-kind" checked={kind === k.key} onChange={() => update({ kind: k.key, type: null, letter: null })}>
                  {k.label} <Count n={counts[k.key]} />
                </Chip>
              ))}
              <span className="self-center px-1.5 font-sans text-[12.5px] text-ink">From the dictionary:</span>
              {DICT_KINDS.map(k => (
                <Chip key={k.key} name="topic-kind" checked={dictKind === k.key} onChange={() => update({ kind: k.key, type: null, sort: null })}>
                  {k.label} {dictCounts && <Count n={dictCounts[k.key]} />}
                </Chip>
              ))}
            </ChipGroup>
            {kind && <p className="-mt-2 font-sans text-[13.5px] text-ink">{TOPIC_KINDS.find(k => k.key === kind)?.hint}.</p>}
            {dictKind && (
              <p className="-mt-2 font-sans text-[13.5px] text-ink">
                {DICT_KINDS.find(k => k.key === dictKind)?.hint}. Also in the{' '}
                <Link to={`/tools/dictionary?show=${dictKind}`} className={`underline underline-offset-2 ${FOCUS}`}>
                  medical dictionary
                </Link>
                .
              </p>
            )}

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
                  placeholder={dictKind ? 'Type at least 2 letters' : `Filter ${shown.length === all.length ? all.length : 'these'} topics`}
                  autoComplete="off"
                  className={FIELD}
                  style={{ fontSize: '15px' }}
                />
              </div>
              {!dictKind && (
              <ChipGroup label="Order">
                <Chip name="topic-sort" checked={sort === 'az'} onChange={() => update({ sort: null })}>
                  A to Z
                </Chip>
                <Chip name="topic-sort" checked={sort === 'connected'} onChange={() => update({ sort: 'connected' })}>
                  Most connected
                </Chip>
              </ChipGroup>
              )}
            </div>
          </section>

          {dictKind ? (
            <DictionaryTopics
              kind={dictKind}
              q={q}
              letter={paramToBucket(params.get('letter')) ?? 'A'}
              onLetter={b => update({ letter: bucketToParam(b) })}
              pages={all}
            />
          ) : (
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
          )}
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

/**
 * Dictionary entries (abbreviations, or medical terms that aren't drug names),
 * a letter at a time from the database, or searched when the filter has 2+
 * letters. A term that already has a topic page links to it; any other
 * medical term offers to start one.
 */
function DictionaryTopics({
  kind,
  q,
  letter,
  onLetter,
  pages,
}: {
  kind: DictKind
  q: string
  letter: Bucket
  onLetter: (b: Bucket) => void
  pages: Topic[]
}) {
  const [rows, setRows] = useState<DictionaryEntry[] | 'failed' | null>(null)
  const [total, setTotal] = useState(0)
  const [more, setMore] = useState(0)
  const searching = q.trim().length >= 2
  // Existing pages for the shown terms (drugs, classes, topics), by slug: ~900 of
  // the dictionary's "medical terms" already have one (insulin degludec, Barbiturates…).
  const [existing, setExisting] = useState<Map<string, { slug: string; entityType: string }>>(() => new Map())
  const topicSlugs = useMemo(() => new Map(pages.map(p => [p.slug, { slug: p.slug, entityType: p.kind as string }])), [pages])

  useEffect(() => {
    setMore(0)
  }, [kind, letter, q])

  useEffect(() => {
    const controller = new AbortController()
    if (more === 0) setRows(null)
    const timer = setTimeout(
      () => {
        const job = searching
          ? searchDictionary(q, kind, controller.signal).then(r => ({ rows: r, total: r.length }))
          : loadBucket(letter, kind, more * PAGE_SIZE, controller.signal)
        job
          .then(r => {
            setRows(prev => (more > 0 && Array.isArray(prev) ? [...prev, ...r.rows] : r.rows))
            setTotal(r.total)
          })
          .catch(() => {
            if (!controller.signal.aborted) setRows('failed')
          })
      },
      searching ? 250 : 0,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [kind, letter, q, searching, more])

  useEffect(() => {
    if (!Array.isArray(rows) || rows.length === 0) return
    const wanted = [...new Set(rows.map(r => slugify(r.term)).filter(sl => sl && !topicSlugs.has(sl)))]
    if (wanted.length === 0) return
    const controller = new AbortController()
    supabase
      .from('entities')
      .select('slug, entity_type')
      .in('slug', wanted)
      .abortSignal(controller.signal)
      .then(({ data }) => {
        const m = new Map(topicSlugs)
        for (const r of (data ?? []) as { slug: string; entity_type: string }[]) m.set(r.slug, { slug: r.slug, entityType: r.entity_type })
        setExisting(m)
      })
    return () => controller.abort()
  }, [rows, topicSlugs])

  const letters = BUCKETS.filter(b => b.kind === 'latin' || b.kind === 'numeric')

  return (
    <section aria-live="polite" className="pt-8">
      {!searching && (
        <nav aria-label="Choose a letter" className="mb-6 flex flex-wrap gap-1">
          {letters.map(b => (
            <button
              key={b.key}
              type="button"
              aria-pressed={b.key === letter}
              onClick={() => onLetter(b.key)}
              className={`rounded px-2 py-1 font-sans text-[12.5px] text-ink ${b.key === letter ? 'lp-sunken font-medium' : 'lp-flat'} ${FOCUS}`}
            >
              {b.label}
            </button>
          ))}
        </nav>
      )}

      {rows === 'failed' ? (
        <p className="py-8 font-sans text-[15px] text-ink">The dictionary couldn’t be loaded right now.</p>
      ) : rows === null ? (
        <div className="h-40 animate-pulse rounded-md bg-ink/10 motion-reduce:animate-none" aria-busy="true" />
      ) : (
        <>
          <p className="mb-5 font-sans text-[14px] text-ink">
            {searching
              ? `${total.toLocaleString()}${total >= 300 ? '+' : ''} matching “${q.trim()}”`
              : `${total.toLocaleString()} under ${bucketLabel(letter)}`}
          </p>
          {rows.length === 0 ? (
            <p className="py-6 font-sans text-[15px] text-ink">
              Nothing here.{' '}
              {searching && (
                <Link to={newPageHref(q)} className={`underline underline-offset-2 ${FOCUS}`}>
                  Create a page for “{q.trim()}”
                </Link>
              )}
            </p>
          ) : (
            <ul className="gap-x-10 sm:columns-2">
              {rows.map(e => {
                const sl = slugify(e.term)
                const page = existing.get(sl) ?? topicSlugs.get(sl)
                const def = displayDefinition(e)
                const tag = tagOf(e)
                return (
                  <li key={e.id} className="break-inside-avoid border-b border-ink/10 py-2">
                    <span className="font-sans text-[15px] font-medium text-ink [overflow-wrap:anywhere]">{e.term}</span>
                    {tag && tag !== 'Abbreviation' && kind === 'abbreviations' && <span className="ml-2 font-sans text-[12px] text-ink">{tag}</span>}
                    {def && def !== e.term && <span className="block font-sans text-[13.5px] leading-snug text-ink">{def}</span>}
                    {page ? (
                      <Link to={entityHref(page.entityType, page.slug)} className={`mt-0.5 block w-fit font-sans text-[12.5px] underline underline-offset-2 ${FOCUS}`}>
                        Open the page
                      </Link>
                    ) : (
                      kind === 'terms' && (
                        <Link to={newPageHref(e.term)} className={`mt-0.5 block w-fit font-sans text-[12.5px] text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink ${FOCUS}`}>
                          Start a page
                        </Link>
                      )
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {!searching && rows.length < total && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setMore(m => m + 1)}
                className={`lp-raised lp-press rounded-md px-5 py-2 font-sans text-[13px] font-medium text-ink ${FOCUS}`}
              >
                Show {Math.min(PAGE_SIZE, total - rows.length)} more of {(total - rows.length).toLocaleString()}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
