/**
 * "Study this" links on drug and list pages: published Learn collections that include the drug,
 * or that were built from the list. Renders nothing while loading, on error, or when there are none,
 * so pages stay unchanged until a collection is published.
 *
 * Destination: src/components/StudyLinks.tsx
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collectionsForList, collectionsForPcid, type StudyLink } from '../learn/api'

type Props = { pcid?: string | number; listSlug?: string; label: string }

export default function StudyLinks({ pcid, listSlug, label }: Props) {
  const [links, setLinks] = useState<StudyLink[]>([])

  useEffect(() => {
    let cancelled = false
    const n = typeof pcid === 'string' ? Number(pcid.replace(/\D/g, '')) : pcid
    const req = listSlug ? collectionsForList(listSlug) : n ? collectionsForPcid(n) : Promise.resolve([])
    req.then(r => !cancelled && setLinks(r)).catch(() => !cancelled && setLinks([]))
    return () => {
      cancelled = true
    }
  }, [pcid, listSlug])

  if (links.length === 0) return null
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-sans text-[14px] text-ink">
      <span>{label}</span>
      {links.map(l => (
        <Link key={l.collection_id} to={`/learn/study/${l.slug ?? l.collection_id}`} className="underline">
          {l.title} ({l.item_count})
        </Link>
      ))}
    </p>
  )
}
