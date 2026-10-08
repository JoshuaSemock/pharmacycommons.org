/**
 * /classifications/compare?c=slug,slug,slug — up to three classes side by side.
 *
 * Any mix of systems can be compared (an ATC group against an FDA EPC class
 * against a ChemOnt node). The cards across the top give each class's system,
 * code, member count and how many of its drugs no other compared class holds.
 * The overlap line counts the drugs every class shares (and each pair, for
 * three). The table lines the members up by PCID: one row per drug, one column
 * per class. "In every class" and "In one class only" narrow it. Same pattern
 * as /lists/compare; the classes live in ?c= so a comparison can be linked.
 *
 * Destination: src/pages/ClassCompare.tsx
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Stamp from '../components/Stamp'
import { MAX_COMPARE, SHOWS_CODES, computeOverlap, getClass, parseSelection, systemBadge } from '../classifications'
import type { ClassMember, ClassRecord } from '../classifications'
import { formatDrugName } from '../names'

const BATCH = 300

type Show = 'all' | 'every' | 'one'

export default function ClassCompare() {
  const [params, setParams] = useSearchParams()
  const slugs = useMemo(() => parseSelection(params.get('c')), [params])
  const [loaded, setLoaded] = useState<Record<string, ClassRecord | null>>({})
  const [show, setShow] = useState<Show>('all')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(BATCH)

  useEffect(() => {
    document.title = 'Compare classifications · Pharmacy Commons'
  }, [])

  // Fetch each class once; requests in flight are remembered so a re-render
  // before they land doesn't start them again.
  const requested = useRef(new Set<string>())
  useEffect(() => {
    for (const slug of slugs) {
      if (requested.current.has(slug)) continue
      requested.current.add(slug)
      getClass(slug)
        .then(c => setLoaded(prev => ({ ...prev, [slug]: c })))
        .catch(err => {
          console.error(err)
          setLoaded(prev => ({ ...prev, [slug]: null }))
        })
    }
  }, [slugs])

  function setSlugs(next: string[]) {
    const p = new URLSearchParams(params)
    if (next.length) p.set('c', next.join(','))
    else p.delete('c')
    setParams(p, { replace: true })
  }

  const ready = slugs.every(s => loaded[s] !== undefined)
  const classes = useMemo(
    () => slugs.map(s => loaded[s]).filter((c): c is ClassRecord => Boolean(c)),
    [slugs, loaded],
  )
  const missing = slugs.filter(s => loaded[s] === null)

  const overlap = useMemo(() => computeOverlap(ready ? classes : []), [ready, classes])

  const counts = useMemo(
    () => ({
      all: overlap.rows.length,
      every: overlap.shared,
      one: overlap.rows.filter(r => r.inCount === 1).length,
    }),
    [overlap],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return overlap.rows.filter(r => {
      if (show === 'every' && r.inCount !== classes.length) return false
      if (show === 'one' && r.inCount !== 1) return false
      return !q || r.name.toLowerCase().includes(q)
    })
  }, [overlap, show, query, classes.length])

  useEffect(() => setLimit(BATCH), [show, query, slugs])

  const addMoreHref = `/classifications${slugs.length ? `?c=${slugs.map(encodeURIComponent).join(',')}` : ''}`
  const shortName = (i: number) => classes[i]?.name ?? ''

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-1.5 py-4 font-sans text-[13px] text-ink">
        <Link to={addMoreHref}>Classifications</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="font-medium text-ink">
          Compare
        </span>
      </nav>

      <header className="border-b border-ink/15 pb-8">
        <h1
          className="font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.015em] text-ink sm:text-[2.618rem]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Compare classifications
        </h1>
        <p className="mt-4 max-w-[42rem] font-sans text-[17px] leading-relaxed text-ink">
          Up to three classes from any system, side by side: what they share, and which drugs only one of them holds.
        </p>
      </header>

      {slugs.length === 0 ? (
        <p className="py-10 font-sans text-[15px] text-ink">
          No classes picked yet.{' '}
          <Link to="/classifications" className="font-medium underline">
            Choose two or three on the Classifications page
          </Link>
          .
        </p>
      ) : !ready ? (
        <p className="py-10 font-sans text-[15px] text-ink" aria-busy="true">
          Loading classes…
        </p>
      ) : (
        <>
          {missing.length > 0 && (
            <p className="pt-6 font-sans text-[14px] text-ink">
              Not found: {missing.join(', ')}.
            </p>
          )}

          <div
            className={`grid gap-4 pt-7 ${classes.length + (slugs.length < MAX_COMPARE ? 1 : 0) >= 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'}`}
          >
            {classes.map((c, i) => (
              <ClassCard
                key={c.slug}
                cls={c}
                unique={overlap.unique[i] ?? 0}
                onRemove={() => setSlugs(slugs.filter(s => s !== c.slug))}
              />
            ))}
            {slugs.length < MAX_COMPARE && (
              <Link
                to={addMoreHref}
                className="lp-sunken flex min-h-32 items-center justify-center rounded-md p-5 font-sans text-[14px] font-medium text-ink"
              >
                + Add a class
              </Link>
            )}
          </div>

          {classes.length < 2 ? (
            <p className="py-10 font-sans text-[15px] text-ink">Add one more class to compare.</p>
          ) : (
            <>
              <section className="pt-9" aria-label="Overlap">
                <h2
                  className="mb-2 font-display font-semibold leading-snug text-ink"
                  style={{ fontFamily: 'var(--font-display)', fontSize: '22px' }}
                >
                  Overlap
                </h2>
                <p className="max-w-[42rem] font-sans text-[15px] leading-relaxed text-ink">
                  <strong className="font-semibold">{overlap.shared.toLocaleString()}</strong>{' '}
                  {overlap.shared === 1 ? 'drug is' : 'drugs are'} in{' '}
                  {classes.length === 2 ? 'both classes' : `all ${classes.length} classes`}, out of{' '}
                  {overlap.rows.length.toLocaleString()} in total.
                </p>
                {classes.length > 2 && (
                  <ul className="mt-2 grid gap-1 font-sans text-[14px] text-ink">
                    {overlap.pairs.map(p => (
                      <li key={`${p.a}-${p.b}`} className="min-w-0 break-words">
                        <span className="font-mono text-[12.5px]">{p.shared.toLocaleString()}</span> shared by{' '}
                        {shortName(p.a)} and {shortName(p.b)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="mb-4 mt-7 flex flex-wrap items-center gap-4">
                <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['all', 'All'],
                      ['every', classes.length === 2 ? 'In both' : 'In every class'],
                      ['one', 'In one class only'],
                    ] as [Show, string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={show === key}
                      onClick={() => setShow(key)}
                      className={`lp-toggle rounded-md px-2.5 py-1 font-sans text-[12.5px] whitespace-nowrap text-ink ${show === key ? 'font-medium' : ''}`}
                    >
                      {label} <span className="font-mono text-[11px] text-ink">{counts[key].toLocaleString()}</span>
                    </button>
                  ))}
                </div>
                <div className="lp-field w-full rounded-md sm:w-64">
                  <input
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Filter drugs"
                    aria-label="Filter drugs"
                    className="w-full bg-transparent px-3 py-1.5 font-sans text-[13.5px] text-ink placeholder:text-ink outline-none"
                  />
                </div>
              </div>

              {/* Wide comparisons scroll inside this box, never the page. */}
              <div className="overflow-x-auto border-y border-ink/15">
                <table className="w-full min-w-[34rem] border-collapse font-sans text-[13.5px]">
                  <thead>
                    <tr className="border-b border-ink/15 text-left text-[12px] text-ink">
                      <th scope="col" className="px-4 py-2 font-normal">
                        Drug
                      </th>
                      {classes.map(c => (
                        <th key={c.slug} scope="col" className="px-4 py-2 font-medium text-ink">
                          <Link to={`/classifications/${c.slug}`} className="lp-press inline-flex items-center rounded-md px-2 py-0.5">
                            {c.name}
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, limit).map(r => (
                      <tr key={r.pcid} className="border-b border-ink/10 last:border-b-0">
                        <th scope="row" className="px-4 py-2 text-left font-medium">
                          <Link to={`/drugs/${r.slug}`} className="lp-press inline-flex items-center rounded-md px-2 py-0.5 text-ink">
                            {formatDrugName(r.name)}
                          </Link>
                        </th>
                        {r.cells.map((m, i) => (
                          <td key={i} className="px-4 py-2">
                            <Cell member={m} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filtered.length === 0 && (
                <p className="py-4 font-sans text-[14px] text-ink">No drugs match.</p>
              )}
              {filtered.length > limit && (
                <button
                  type="button"
                  onClick={() => setLimit(l => l + BATCH)}
                  className="lp-raised lp-press mt-4 rounded-md px-4 py-2 font-sans text-[13px] font-medium text-ink"
                >
                  Show more ({(filtered.length - limit).toLocaleString()} left)
                </button>
              )}
              <p className="mt-3 font-sans text-[12.5px] text-ink">
                ✓ in the class · “via sub-class” in it through one of its sub-classes · — not in the class.
              </p>
            </>
          )}
        </>
      )}
    </main>
  )
}

function ClassCard({ cls, unique, onRemove }: { cls: ClassRecord; unique: number; onRemove: () => void }) {
  const total = cls.member_count ?? cls.members.length
  const code = cls.class_type && SHOWS_CODES.has(cls.class_type) ? cls.source_code : null
  return (
    <article className="lp-raised flex min-w-0 flex-col gap-3 rounded-md p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Stamp>{systemBadge(cls.class_type)}</Stamp>
          {code && <span className="lp-label rounded px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink">{code}</span>}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${cls.name}`}
          className="lp-raised lp-press -mr-1 -mt-1 flex shrink-0 rounded p-1.5 text-ink"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <h3
        className="min-w-0 break-words font-display font-semibold leading-snug text-ink"
        style={{ fontFamily: 'var(--font-display)', fontSize: '20px' }}
      >
        <Link to={`/classifications/${cls.slug}`} className="hover:underline">
          {cls.name}
        </Link>
      </h3>
      {cls.class_type_label && <p className="font-sans text-[13px] text-ink">{cls.class_type_label}</p>}
      <dl className="mt-auto grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-ink/10 pt-3 font-sans text-[13px] text-ink">
        <dt>Drugs</dt>
        <dd className="text-right font-mono text-[12.5px]">{total.toLocaleString()}</dd>
        <dt>Only in this class</dt>
        <dd className="text-right font-mono text-[12.5px]">{unique.toLocaleString()}</dd>
        <dt>PCID</dt>
        <dd className="text-right font-mono text-[12.5px]">
          <Link to={`/id/PCID-${cls.pcid}`} className="hover:underline">
            PCID-{cls.pcid}
          </Link>
        </dd>
      </dl>
    </article>
  )
}

function Cell({ member }: { member: ClassMember | null }) {
  if (!member) {
    return (
      <span className="text-ink" aria-label="Not in this class">
        —
      </span>
    )
  }
  if (!member.is_direct) {
    return <span className="font-sans text-[12px] text-ink">via sub-class</span>
  }
  return (
    <span className="text-ink" aria-label="In this class">
      ✓
    </span>
  )
}
