/**
 * /classifications/:slug — one drug class.
 *
 * Reads get_class(p_slug): the class, its ancestor chain (breadcrumb), its
 * sub-classes that have members, and every member drug. Members inherited
 * through a sub-class (is_direct = false) are drawn dashed, the same
 * convention as the Classes card on drug pages. Big ChemOnt classes run to
 * several thousand members, so the list renders in batches with a filter.
 *
 * The rail carries the same Sources / Machine-readable cards as drug pages —
 * a class is a PCID record like any other.
 *
 * Destination: src/pages/ClassDetail.tsx
 */

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import MachinePanels from '../MachinePanels'
import { formatDrugName } from '../names'

type ClassRef = { slug: string; name: string; source_code: string | null }

type ClassRecord = {
  pcid: number
  slug: string
  name: string
  class_type: string | null
  class_type_label: string | null
  source_system: string | null
  source_code: string | null
  level: number | null
  description: string | null
  ancestors: ClassRef[]
  children: (ClassRef & { member_count: number | null })[]
  members: { pcid: number; slug: string; name: string; entity_type: string; is_direct: boolean }[]
  member_count: number | null
}

const BATCH = 150

export default function ClassDetail() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [cls, setCls] = useState<ClassRecord | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    setState('loading')
    setCls(null)
    window.scrollTo(0, 0)
    supabase
      .rpc('get_class', { p_slug: slug })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error(error)
          setState('error')
        } else if (!data) {
          setState('missing')
        } else {
          setCls(data as ClassRecord)
          setState('ready')
        }
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    document.title = cls ? `${cls.name} · Classifications · Pharmacy Commons` : 'Pharmacy Commons'
  }, [cls])

  if (state === 'loading') {
    return <main className="flex justify-center py-32 font-sans text-ink">Loading…</main>
  }

  if (state !== 'ready' || !cls) {
    return (
      <main className="flex flex-col items-center justify-center px-4 py-32 text-center">
        <p className="mb-2 font-display text-xl text-ink" style={{ fontFamily: 'var(--font-display)' }}>
          {state === 'missing' ? `No class called “${slug}”.` : 'The class couldn’t be loaded right now.'}
        </p>
        <Link to="/classifications" className="lp-press inline-flex items-center rounded-md px-2.5 py-1 font-sans text-sm text-ink">
          All classifications
        </Link>
      </main>
    )
  }

  const pcidCode = `PCID-${cls.pcid}`

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      {/* Breadcrumb: Classes / ancestors… / this class */}
      <nav className="flex flex-wrap items-center gap-x-1.5 gap-y-1 py-4 font-sans text-sm text-ink">
        <Link to="/classifications" className="lp-press inline-flex items-center rounded-md px-2 py-0.5">
          Classifications
        </Link>
        {cls.ancestors.map(a => (
          <span key={a.slug} className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true">/</span>
            <Link to={`/classifications/${a.slug}`} className="lp-press inline-flex items-center rounded-md px-2 py-0.5 break-words">
              {a.name}
            </Link>
          </span>
        ))}
        <span aria-hidden="true">/</span>
        <span className="min-w-0 break-words font-medium text-ink">{cls.name}</span>
      </nav>

      <header className="mb-8 border-b border-ink/15 pb-6">
        <p className="mb-1 font-sans text-md text-ink">
          {cls.class_type_label ?? 'Drug class'}
          {cls.source_code && (
            <>
              {' · '}
              <span className="font-mono text-sm">{cls.source_code}</span>
            </>
          )}
        </p>
        <h1
          className="min-w-0 font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {cls.name}
        </h1>
        <p className="mt-2 font-sans text-md text-ink">
          {(cls.member_count ?? cls.members.length).toLocaleString()}{' '}
          {(cls.member_count ?? cls.members.length) === 1 ? 'drug' : 'drugs'}
          {cls.children.length > 0 &&
            ` · ${cls.children.length} ${cls.children.length === 1 ? 'sub-class' : 'sub-classes'}`}
        </p>
        {cls.description && (
          <p className="mt-3 max-w-2xl font-sans text-md leading-relaxed text-ink">{cls.description}</p>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4">
          {cls.children.length > 0 && <SubclassesCard items={cls.children} showCodes={cls.class_type === 'atc' || cls.class_type === 'va'} />}
          <MachinePanels pcidCode={pcidCode} slug={cls.slug} />
        </aside>

        <section aria-label="Members" className="min-w-0">
          <MemberList members={cls.members} />
        </section>
      </div>
    </main>
  )
}

// ─── Sub-classes ──────────────────────────────────────────────────────────────

const SUBCLASS_PREVIEW = 12

function SubclassesCard({
  items,
  showCodes,
}: {
  items: ClassRecord['children']
  showCodes: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? items : items.slice(0, SUBCLASS_PREVIEW)
  return (
    <Card title="Sub-classes">
      <ul className="space-y-1.5">
        {visible.map(c => (
          <li key={c.slug}>
            <Link
              to={`/classifications/${c.slug}`}
              className="lp-card flex items-baseline justify-between gap-2 rounded-md px-3 py-2"
            >
              <span className="min-w-0 break-words font-sans text-sm leading-snug text-ink">
                {showCodes && c.source_code && (
                  <span className="mr-1.5 font-mono text-2xs text-ink">{c.source_code}</span>
                )}
                <span className="lp-link-text">{c.name}</span>
              </span>
              {typeof c.member_count === 'number' && (
                <span className="shrink-0 font-sans text-2xs text-ink">{c.member_count}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {items.length > SUBCLASS_PREVIEW && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="lp-press inline-flex items-center rounded-md px-2.5 py-1 font-sans text-sm text-ink mt-2"
        >
          {showAll ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </Card>
  )
}

// ─── Members ──────────────────────────────────────────────────────────────────

function MemberList({ members }: { members: ClassRecord['members'] }) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(BATCH)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? members.filter(m => m.name.toLowerCase().includes(q)) : members
  }, [members, query])

  useEffect(() => setLimit(BATCH), [query])

  const visible = filtered.slice(0, limit)
  const hasInherited = members.some(m => !m.is_direct)

  if (members.length === 0) {
    return <p className="font-sans text-md text-ink">No drugs are linked to this class yet.</p>
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2
          className="font-display text-2xl font-semibold text-ink"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Drugs in this class
        </h2>
        {members.length > 20 && (
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Filter ${members.length.toLocaleString()} drugs`}
            aria-label="Filter drugs in this class"
            className="lp-field w-full rounded-md px-3 py-1.5 font-sans text-sm text-ink placeholder:text-ink sm:w-64"
          />
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="font-sans text-sm text-ink">No drugs match “{query}”.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {visible.map(m => (
            <li key={m.pcid} className="min-w-0 max-w-full">
              <Link
                to={`/drugs/${m.slug}`}
                title={m.is_direct ? undefined : 'In this class through one of its sub-classes'}
                className={`inline-block max-w-full break-words rounded px-2 py-0.5 font-sans text-sm leading-snug text-ink ${
                  m.is_direct ? 'lp-press' : 'lp-press border border-dashed border-ink/30'
                }`}
              >
                {formatDrugName(m.name)}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {filtered.length > limit && (
        <button
          onClick={() => setLimit(l => l + BATCH * 4)}
          className="lp-press inline-flex items-center rounded-md px-2.5 py-1 font-sans text-sm text-ink mt-4"
        >
          Show more ({(filtered.length - limit).toLocaleString()} left)
        </button>
      )}

      {hasInherited && (
        <p className="mt-6 border-t border-ink/10 pt-3 font-sans text-2xs leading-snug text-ink">
          Dashed: in this class through one of its sub-classes.
        </p>
      )}
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-ink/15">
      <div className="py-3">
        <h2
          className="font-semibold uppercase tracking-[0.1em] text-ink"
          style={{ fontSize: 'var(--text-2xs)', fontFamily: 'var(--font-sans)', lineHeight: 1.4 }}
        >
          {title}
        </h2>
      </div>
      <div className="pb-4">{children}</div>
    </div>
  )
}
