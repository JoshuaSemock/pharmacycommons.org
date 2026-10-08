import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getClassBySlug } from './api'
import type { ClassDetail, ClassMember } from './api.generated'
import { PageFrame, RailHeading } from './pages/PageShell'
import { formatDrugName } from './names'

/**
 * /classes/:slug — one drug class (WHO ATC group, FDA EPC/MOA/PE, VA class,
 * ChemOnt node, …) from the `get_class` RPC.
 *
 *   Classes / ancestor / ancestor / this class      ← breadcrumb, each a link
 *   [WHO ATC · N06AB]
 *   Selective serotonin reuptake inhibitors         ← title
 *   ─────────────────────────────────────────────
 *   Sub-classes (with member counts)                │ rail: source, code,
 *   Members: filter box, direct-only toggle, list   │ level, counts
 *
 * Members that are only in a sub-class (is_direct = false) are drawn with a
 * dashed border and a "via sub-class" note; when a class has both kinds, a
 * toggle hides the inherited ones.
 */

/** Members rendered before "Show more" — ATC level-1 groups can hold a thousand-plus drugs. */
const MEMBER_PAGE = 300

export default function ClassPage() {
  const { slug } = useParams<{ slug: string }>()
  const [cls, setCls] = useState<ClassDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!slug) return
      try {
        setLoading(true)
        const data = await getClassBySlug(slug)
        if (cancelled) return
        if (!data) {
          setError(`Class "${slug}" not found`)
          setCls(null)
        } else {
          setCls(data)
          setError(null)
        }
      } catch (err) {
        if (cancelled) return
        setError('Failed to load this class')
        console.error(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    // Guards against a stale response overwriting a newer one when the user
    // moves between classes faster than the requests resolve.
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    document.title = cls ? `${cls.name} · Pharmacy Commons` : 'Drug classes · Pharmacy Commons'
  }, [cls])

  if (loading) {
    return <div className="flex justify-center py-32 font-sans text-ink">Loading…</div>
  }

  if (error || !cls) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <p
          className="mb-2 font-display text-xl text-ink"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {error || 'Class not found'}
        </p>
        <Link to="/classes" className="font-sans text-sm text-ink hover:underline">
          Browse all drug classes
        </Link>
      </div>
    )
  }

  const directCount = cls.members.filter(m => m.is_direct).length

  return (
    <PageFrame
      contentKey={cls.slug}
      toc={false}
      header={<ClassHeader cls={cls} />}
      aside={<ClassFacts cls={cls} directCount={directCount} />}
    >
      {cls.children.length > 0 && <SubClasses cls={cls} />}
      <Members key={cls.slug} cls={cls} directCount={directCount} />
    </PageFrame>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

/** "WHO ATC · N06AB", or just the type label when the class has no source code. */
function classBadgeText(label: string, code: string | null): string {
  return code ? `${label} · ${code}` : label
}

function ClassHeader({ cls }: { cls: ClassDetail }) {
  return (
    <div className="max-w-4xl">
      <nav
        aria-label="Class hierarchy"
        className="mb-5 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-sans text-[13px] text-ink"
      >
        <Link to={`/classes?type=${cls.class_type}`} className="transition-colors">
          Classes
        </Link>
        {cls.ancestors.map(a => (
          <span key={a.slug} className="flex items-center gap-1.5">
            <span aria-hidden="true">/</span>
            <Link to={`/classes/${a.slug}`} className="transition-colors" title={a.name}>
              {a.source_code ? (
                <>
                  <span className="font-mono text-[12px]">{a.source_code}</span>
                  <span className="hidden sm:inline"> {a.name}</span>
                </>
              ) : (
                a.name
              )}
            </Link>
          </span>
        ))}
        <span aria-hidden="true">/</span>
        <span className="font-medium text-ink" aria-current="page">
          {cls.source_code ?? cls.name}
        </span>
      </nav>

      <span className="lp-raised inline-block rounded-md px-2 py-0.5 font-mono text-[11.5px] font-medium text-ink">
        {classBadgeText(cls.class_type_label, cls.source_code)}
      </span>

      <h1
        className="mt-3 font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.015em] text-balance text-ink sm:text-[2.618rem]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {cls.name}
      </h1>

      {cls.description && (
        <p className="mt-5 max-w-[42rem] font-sans text-[17px] leading-relaxed text-pretty text-ink">
          {cls.description}
        </p>
      )}
    </div>
  )
}

// ─── Rail ─────────────────────────────────────────────────────────────────────

function ClassFacts({ cls, directCount }: { cls: ClassDetail; directCount: number }) {
  const inherited = cls.members.length - directCount
  return (
    <div>
      <RailHeading>About this class</RailHeading>
      <dl className="space-y-3 font-sans text-[13px]">
        <Fact label="System">{cls.class_type_label}</Fact>
        {cls.source_system && <Fact label="Source">{cls.source_system}</Fact>}
        {cls.source_code && (
          <Fact label="Code">
            <span className="font-mono text-[12.5px]">{cls.source_code}</span>
          </Fact>
        )}
        {cls.level !== null && <Fact label="Level">{cls.level}</Fact>}
        <Fact label="Drugs">
          {cls.member_count.toLocaleString()}
          {inherited > 0 && (
            <span className="block text-[12px] text-ink">
              {directCount.toLocaleString()} direct, {inherited.toLocaleString()} via sub-classes
            </span>
          )}
        </Fact>
        {cls.children.length > 0 && <Fact label="Sub-classes">{cls.children.length.toLocaleString()}</Fact>}
      </dl>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-ink">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  )
}

// ─── Sub-classes ──────────────────────────────────────────────────────────────

function SubClasses({ cls }: { cls: ClassDetail }) {
  return (
    <section className="border-t border-ink/15 py-9">
      <SectionHeading>Sub-classes</SectionHeading>
      <ul className="divide-y divide-ink/10 border-y border-ink/15">
        {cls.children.map(c => (
          <li key={c.slug}>
            <Link
              to={`/classes/${c.slug}`}
              className="flex items-baseline gap-3 px-4 py-2.5 transition-colors hover:bg-mint-50"
            >
              {c.source_code && (
                <span className="w-20 shrink-0 font-mono text-[12px] text-ink">{c.source_code}</span>
              )}
              <span className="min-w-0 flex-1 font-sans text-[14px] text-ink">{c.name}</span>
              <span className="shrink-0 font-mono text-[11.5px] text-ink" title={`${c.member_count} drugs`}>
                {c.member_count.toLocaleString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ─── Members ──────────────────────────────────────────────────────────────────

function Members({ cls, directCount }: { cls: ClassDetail; directCount: number }) {
  const [filter, setFilter] = useState('')
  const [directOnly, setDirectOnly] = useState(false)
  const [limit, setLimit] = useState(MEMBER_PAGE)

  const hasInherited = directCount < cls.members.length
  const mixed = hasInherited && directCount > 0

  useEffect(() => setLimit(MEMBER_PAGE), [filter, directOnly])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return cls.members.filter(
      m => (!directOnly || m.is_direct) && (!q || m.name.toLowerCase().includes(q) || m.slug.includes(q)),
    )
  }, [cls.members, filter, directOnly])

  const visible = filtered.slice(0, limit)

  return (
    <section className="border-t border-ink/15 py-9">
      <SectionHeading>
        Drugs in this class
        <span className="ml-2 font-mono text-[13px] font-normal text-ink">
          {cls.members.length.toLocaleString()}
        </span>
      </SectionHeading>

      {cls.members.length === 0 ? (
        <p className="font-sans text-[15px] text-ink">No drugs are linked to this class yet.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="lp-field flex min-w-[14rem] max-w-sm flex-1 items-center gap-2 rounded-md px-3 py-1.5">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-ink">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter drugs in this class"
                aria-label="Filter drugs in this class"
                className="flex-1 bg-transparent font-sans text-[13.5px] text-ink placeholder:text-ink outline-none"
              />
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter('')}
                  className="text-ink"
                  aria-label="Clear filter"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>

            {mixed && (
              <label className="flex items-center gap-2 font-sans text-[13px] text-ink">
                <input
                  type="checkbox"
                  checked={directOnly}
                  onChange={e => setDirectOnly(e.target.checked)}
                  className="h-3.5 w-3.5 accent-hepatica-600"
                />
                Direct members only
              </label>
            )}
          </div>

          {hasInherited && (
            <p className="mb-4 font-sans text-[13px] leading-relaxed text-ink">
              {directCount === 0
                ? 'Every drug here is filed under one of the sub-classes above.'
                : 'Drugs with a dashed outline are filed under a sub-class, not this class directly.'}
            </p>
          )}

          {filtered.length === 0 ? (
            <p className="py-6 font-sans text-[14px] text-ink">
              No drugs in this class match <span className="font-medium text-ink">{filter}</span>.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {visible.map(m => (
                <MemberLink key={m.pcid} member={m} />
              ))}
            </ul>
          )}

          {filtered.length > visible.length && (
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setLimit(l => l + MEMBER_PAGE)}
                className="lp-raised lp-press rounded-md px-4 py-2 font-sans text-[13px] font-medium text-ink"
              >
                Show {Math.min(MEMBER_PAGE, filtered.length - visible.length).toLocaleString()} more
              </button>
              <span className="font-mono text-[11.5px] text-ink">
                {(filtered.length - visible.length).toLocaleString()} left
              </span>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function MemberLink({ member }: { member: ClassMember }) {
  return (
    <li className="min-w-0">
      <Link
        to={`/drugs/${member.slug}`}
        title={member.is_direct ? undefined : 'Filed under a sub-class of this class'}
        className={`flex items-baseline justify-between gap-3 rounded-md px-3 py-2 ${
          member.is_direct ? 'lp-press' : 'lp-press border border-dashed border-ink/30'
        }`}
      >
        <span
          className={`min-w-0 break-words font-sans text-[14px] font-medium leading-snug ${
            member.is_direct ? 'text-ink' : 'text-ink'
          }`}
        >
          {formatDrugName(member.name)}
        </span>
        {!member.is_direct && (
          <span className="shrink-0 font-sans text-[11px] text-ink">via sub-class</span>
        )}
      </Link>
    </li>
  )
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2
      className="mb-4 font-display text-[22px] font-semibold leading-snug text-ink"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </h2>
  )
}
