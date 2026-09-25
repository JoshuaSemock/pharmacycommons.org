/**
 * /lists — every published list.
 *
 * Lists are collections of drugs made for a purpose (a usage ranking, an
 * exam's drugs to know), kept separate from classes: a class says what a drug
 * is, a list says why it is worth knowing. Pharmacy Commons lists come first;
 * sub-lists (the Notable Drugs categories) sit under their parent rather than
 * as cards of their own. Authority and community lists are planned.
 *
 * Destination: src/pages/ListIndex.tsx
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listLists } from '../api'
import type { ListSummary } from '../api.generated'
import { jurisdictionLabel } from './ListDetail'

export default function ListIndex() {
  const [lists, setLists] = useState<ListSummary[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    document.title = 'Lists · Pharmacy Commons'
    let cancelled = false
    listLists()
      .then(rows => {
        if (!cancelled) setLists(rows)
      })
      .catch(err => {
        console.error(err)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const { roots, childrenOf } = useMemo(() => {
    const roots: ListSummary[] = []
    const childrenOf = new Map<string, ListSummary[]>()
    for (const l of lists ?? []) {
      if (l.parent_slug) {
        const arr = childrenOf.get(l.parent_slug) ?? []
        arr.push(l)
        childrenOf.set(l.parent_slug, arr)
      } else {
        roots.push(l)
      }
    }
    return { roots, childrenOf }
  }, [lists])

  const curated = roots.filter(l => l.kind === 'curated')
  const authority = roots.filter(l => l.kind === 'authority')
  const community = roots.filter(l => l.kind === 'community')

  return (
    <main className="mx-auto max-w-page px-4 pb-24 sm:px-6">
      <header className="border-b border-mint-200 pb-10 pt-10 sm:pt-14">
        <h1
          className="font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.015em] text-mint-950 sm:text-[2.618rem]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Lists
        </h1>
        <p className="mt-5 max-w-[42rem] font-sans text-[17px] leading-relaxed text-mint-700">
          Collections of drugs gathered for a purpose: an exam, a practice setting, a question about use. Classes
          say what a drug is; lists say why it is worth knowing. Every entry links to its drug page, and every list
          can be sorted, filtered and downloaded.
        </p>
        <div className="mt-7 flex flex-wrap gap-2.5">
          <Link
            to="/lists/compare"
            className="rounded-lg border border-hepatica-400 bg-hepatica-400/10 px-4 py-2 font-sans text-[13.5px] font-medium text-hepatica-700 transition-colors hover:border-hepatica-500 hover:bg-hepatica-400/20"
          >
            Compare lists
          </Link>
        </div>
      </header>

      {failed ? (
        <p className="py-10 font-sans text-[15px] text-mint-700">Lists couldn’t be loaded right now.</p>
      ) : !lists ? (
        <div className="grid gap-4 py-9 sm:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-mint-100" />
          ))}
        </div>
      ) : (
        <>
          <section className="py-9">
            <SectionHeading>Pharmacy Commons lists</SectionHeading>
            <p className="mb-5 max-w-[42rem] font-sans text-[14px] leading-relaxed text-mint-700">
              Curated by Pharmacy Commons. Each has a PCID, a stated source and a CC0 license.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {curated.map(l => (
                <ListCard key={l.slug} list={l} sublists={childrenOf.get(l.slug) ?? []} />
              ))}
            </div>
          </section>

          <section className="border-t border-mint-200 py-9">
            <SectionHeading>Authority lists</SectionHeading>
            {authority.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {authority.map(l => (
                  <ListCard key={l.slug} list={l} sublists={childrenOf.get(l.slug) ?? []} />
                ))}
              </div>
            ) : (
              <p className="max-w-[42rem] rounded-xl border border-dashed border-mint-300 bg-white/50 px-5 py-4 font-sans text-[14px] leading-relaxed text-mint-700">
                Lists published by agencies and professional bodies, such as the NIOSH hazardous drugs list, will
                appear here with their own license terms.
              </p>
            )}
          </section>

          <section className="border-t border-mint-200 py-9">
            <SectionHeading>Community lists</SectionHeading>
            {community.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {community.map(l => (
                  <ListCard key={l.slug} list={l} sublists={[]} />
                ))}
              </div>
            ) : (
              <p className="max-w-[42rem] rounded-xl border border-dashed border-mint-300 bg-white/50 px-5 py-4 font-sans text-[14px] leading-relaxed text-mint-700">
                Lists made by people with a Pharmacy Commons account are coming. They will be public, and anyone
                will be able to copy one to start their own.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  )
}

function ListCard({ list, sublists }: { list: ListSummary; sublists: ListSummary[] }) {
  const place = jurisdictionLabel(list.jurisdiction)
  return (
    <article
      className={`flex min-w-0 flex-col gap-3 rounded-xl border border-mint-200 bg-white p-5 ${sublists.length > 0 ? 'sm:col-span-2' : ''}`}
    >
      <div className="flex flex-wrap gap-1.5">
        {place && <Badge tone="sky">{place}</Badge>}
        <Badge tone="mint">{`PCID-${list.pcid}`}</Badge>
      </div>
      <h3
        className="font-display text-[22px] font-semibold leading-snug text-mint-950"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        <Link to={`/lists/${list.slug}`} className="hover:text-hepatica-700">
          {list.title}
        </Link>
      </h3>
      {list.description && <p className="font-sans text-[14px] leading-relaxed text-mint-800">{list.description}</p>}

      {sublists.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`Categories in ${list.title}`}>
          {sublists.map(s => (
            <li key={s.slug} className="min-w-0 max-w-full">
              <Link
                to={`/lists/${s.slug}`}
                className="inline-flex max-w-full items-baseline gap-1.5 rounded-md border border-mint-200 bg-white px-2 py-0.5 font-sans text-[13px] text-mint-900 transition-colors hover:border-hepatica-300 hover:text-hepatica-700"
              >
                <span className="min-w-0 break-words">{s.title.replace(/^.*?:\s*/, '')}</span>
                <span className="shrink-0 font-mono text-[11px] text-mint-700">{s.item_count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-baseline justify-between gap-3 border-t border-mint-100 pt-3">
        <span className="font-mono text-[11.5px] text-mint-700">{list.item_count.toLocaleString()} drugs</span>
        <Link to={`/lists/${list.slug}`} className="font-sans text-[13px] font-medium text-hepatica-700 hover:underline">
          Open list →
        </Link>
      </div>
    </article>
  )
}

function Badge({ tone, children }: { tone: 'mint' | 'sky'; children: string }) {
  const cls =
    tone === 'sky' ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-mint-200 bg-mint-50 text-mint-800'
  return <span className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium ${cls}`}>{children}</span>
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h2
      className="mb-2 font-display text-[22px] font-semibold leading-snug text-mint-950"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </h2>
  )
}
