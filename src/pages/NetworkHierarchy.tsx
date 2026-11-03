/**
 * /network/hierarchy — where one to four concepts sit in each classification system.
 *
 * class_members stores every ancestor as an inherited membership, which reads as a flat list. Here the
 * classes are shown as the trees they are (WHO ATC, VA, FDA, ChemOnt, …), and for two or more concepts
 * the lowest class they have in common is shown first, with the path above it, then each concept's own
 * branch beneath. A class that holds only one concept is not "shared" however high up it sits, and a
 * classification that is missing here is missing from the database, not necessarily from the world.
 *
 * Data: network_hierarchy() (db/phase33_network_hierarchy.sql). Model and layout: src/network/hierarchy.ts.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../components/Button'
import Card from '../components/Card'
import Stamp from '../components/Stamp'
import HierarchyView from '../network/HierarchyView'
import NetworkSearch from '../network/NetworkSearch'
import { NetworkUnavailable, fetchConcepts, fetchHierarchy, resolveSlug } from '../network/api'
import type { SearchHit } from '../network/api'
import { MAX_HIERARCHY, buildSystemTrees, pathTo, systemSummary } from '../network/hierarchy'
import type { HierarchyPayload } from '../network/hierarchy'
import { parseCompareParam } from '../network/compare'
import type { NetworkNode } from '../network/model'

const TITLE = 'Classification hierarchy'

type Load = { s: 'idle' } | { s: 'loading' } | { s: 'ready'; data: HierarchyPayload } | { s: 'unavailable' } | { s: 'error' }

export default function NetworkHierarchy() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const pcids = useMemo(() => parseCompareParam(params.get('c')), [params])
  const idsKey = pcids.join(',')

  const [concepts, setConcepts] = useState<NetworkNode[]>([])
  const [load, setLoad] = useState<Load>({ s: 'idle' })
  const [note, setNote] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    document.title = `${TITLE} · Pharmacy Commons`
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    fetchConcepts(pcids, ac.signal).then(c => !ac.signal.aborted && setConcepts(c)).catch(() => undefined)
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  useEffect(() => {
    if (pcids.length === 0) {
      setLoad({ s: 'idle' })
      return
    }
    const ac = new AbortController()
    setLoad({ s: 'loading' })
    fetchHierarchy(pcids, ac.signal)
      .then(data => !ac.signal.aborted && setLoad({ s: 'ready', data }))
      .catch(err => {
        if (ac.signal.aborted) return
        setLoad({ s: err instanceof NetworkUnavailable && err.notDeployed ? 'unavailable' : 'error' })
      })
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, reload])

  const setIds = useCallback(
    // A literal comma keeps the address readable and shareable: ?c=1001923,1001318
    (next: number[]) => navigate({ search: next.length === 0 ? '' : `?c=${next.join(',')}` }),
    [navigate],
  )

  const pick = useCallback(
    async (hit: SearchHit) => {
      const pcid = hit.pcid ?? (await resolveSlug(hit.slug))
      if (pcid === null) {
        setNote(`Could not find a record for ${hit.name}.`)
        return
      }
      if (pcids.includes(pcid)) {
        setNote(`${hit.name} is already here.`)
        return
      }
      setNote(hit.hint.startsWith('Brand:') ? `${hit.hint.replace('Brand:', '').trim()} is shown as ${hit.name}, the drug it contains.` : null)
      setIds([...pcids, pcid])
    },
    [pcids, setIds],
  )

  const data = load.s === 'ready' ? load.data : null
  const entities = data?.entities ?? concepts
  const trees = useMemo(() => (data ? buildSystemTrees(data) : []), [data])
  const nameOf = (id: number) => entities.find(e => e.pcid === id)?.name ?? 'a concept'
  const withMeeting = trees.filter(t => t.meetings.length > 0)
  const many = pcids.length > 1

  return (
    <main className="mx-auto w-full max-w-page px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-6 max-w-[48rem]">
        <h1 className="font-sans text-ink">{TITLE}</h1>
        <p className="mt-2 text-[15px] text-ink">
          See where a drug or class sits in each classification system as the tree it is. Add a second concept and the lowest class
          they have in common comes first, with the path above it and each concept&apos;s own branch below.
        </p>
        <p className="mt-2 text-[13px] text-ink">
          A class that holds only one of the concepts is not shared, however high it sits. A classification missing here is missing
          from the database, not necessarily from the world. See the{' '}
          <Link to="/disclaimer" className="underline decoration-foil decoration-2 underline-offset-2">
            medical disclaimer
          </Link>
          .
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {entities.map(e => (
          <span key={e.pcid} className="lp-chip inline-flex items-center gap-2 rounded-md px-3 py-1 font-sans text-[13px] text-ink">
            <Link to={`/network?c=${e.pcid}`} className="underline decoration-foil decoration-2 underline-offset-2" title="Open this concept in the Network">
              {e.name}
            </Link>
            <button type="button" className="lp-press rounded px-1" aria-label={`Remove ${e.name}`} onClick={() => setIds(pcids.filter(p => p !== e.pcid))}>
              ×
            </button>
          </span>
        ))}
      </div>

      {pcids.length < MAX_HIERARCHY ? (
        <div className="mb-2 max-w-[40rem]">
          <p className="mb-1 text-[13px] text-ink">{pcids.length === 0 ? 'Add a drug or class' : 'Add another to see where they meet'}</p>
          <NetworkSearch onPick={pick} disabled={load.s === 'loading'} />
        </div>
      ) : (
        <p className="mb-2 text-[13px] text-ink">Four is the most that fit. Remove one to add another.</p>
      )}

      <div aria-live="polite" className="min-h-[1.25rem] text-[13px] text-ink">
        {load.s === 'loading' && 'Loading…'}
        {note}
      </div>

      {load.s === 'idle' && (
        <Card className="mt-2 max-w-[40rem]">
          <p className="text-[14px] text-ink">
            Try{' '}
            <Link to="/network/hierarchy?c=1001923,1001318" className="underline decoration-foil decoration-2 underline-offset-2">
              metformin and empagliflozin
            </Link>{' '}
            (the drug in Jardiance).
          </p>
        </Card>
      )}

      {load.s === 'unavailable' && (
        <Card className="mt-2 max-w-[40rem]">
          <p className="text-[14px] text-ink">The hierarchy service is not switched on yet.</p>
        </Card>
      )}

      {load.s === 'error' && (
        <Card className="mt-2 max-w-[40rem]">
          <p className="text-[14px] text-ink">The hierarchy could not be loaded.</p>
          <div className="mt-2">
            <Button size="sm" onClick={() => setReload(n => n + 1)}>
              Try again
            </Button>
          </div>
        </Card>
      )}

      {data && (
        <>
          {many && (
            <Card className="mt-2 max-w-[56rem]">
              <h2 className="font-sans text-[16px] text-ink">In common</h2>
              {withMeeting.length === 0 ? (
                <p className="mt-1 text-[14px] text-ink">No classification system places more than one of these concepts in the same class.</p>
              ) : (
                <ul className="mt-1 space-y-2 text-[14px] text-ink">
                  {withMeeting.map(t =>
                    t.meetings.map(m => {
                      const path = pathTo(m.pcid, data)
                      return (
                        <li key={`${t.system}-${m.pcid}`}>
                          <Stamp>{t.badge}</Stamp>{' '}
                          <span>
                            {m.members.length === data.pcids.length ? 'All of them' : m.members.map(nameOf).join(' and ')} in{' '}
                          </span>
                          <span className="font-semibold">{m.name}</span>
                          {path.length > 1 && (
                            <span className="block text-[13px]">
                              {path.map((c, i) => (
                                <span key={c.pcid} className={i === path.length - 1 ? 'font-semibold' : ''}>
                                  {i > 0 ? ' › ' : ''}
                                  {c.name}
                                </span>
                              ))}
                            </span>
                          )}
                        </li>
                      )
                    }),
                  )}
                </ul>
              )}
            </Card>
          )}

          <p className="mt-6 text-[13px] text-ink">
            <span aria-hidden="true">● </span>holds more than one concept · <span aria-hidden="true">○ </span>holds one ·{' '}
            <span aria-hidden="true">◉ </span>lowest class they share (bold) · <span aria-hidden="true">■ </span>the concept itself
          </p>

          {trees.length === 0 && <p className="mt-4 text-[14px] text-ink">No classifications are recorded for {many ? 'these concepts' : entities[0]?.name ?? 'this concept'}.</p>}

          {trees.map((t, i) => (
            <details key={t.system} className="mt-5" open={t.meetings.length > 0 || (withMeeting.length === 0 && i < 2)}>
              <summary className="cursor-pointer font-sans text-[16px] text-ink">
                <Stamp>{t.badge}</Stamp> <span className="text-[13px]">{systemSummary(t, data)}</span>
              </summary>
              <div className="mt-2">
                <HierarchyView tree={t} label={`${t.badge} classification of ${entities.map(e => e.name).join(', ')}`} />
              </div>
            </details>
          ))}

          {many && (
            <p className="mt-6 text-[13px] text-ink">
              <Link to={`/network/compare?c=${pcids.join(',')}`} className="underline decoration-foil decoration-2 underline-offset-2">
                Compare all their connections
              </Link>
            </p>
          )}
        </>
      )}
    </main>
  )
}
