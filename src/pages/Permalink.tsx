/**
 * /id/:pcid — permanent address for any record.
 *
 * Slugs can change when a name is corrected; a PCID never does and is never
 * reissued. This route resolves PCID-n (or bare n) to the record's current
 * page and replaces the history entry, so /id/PCID-1001923 is safe to cite,
 * print or store in another system forever. It is also the @id of every
 * record in the JSON-LD documents.
 *
 * Destination: src/pages/Permalink.tsx
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { API_BASE } from '../machine'

type State =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'missing'; pcid: string }
  | { kind: 'retired'; pcid: string; reason: string | null }
  | { kind: 'error' }

export default function Permalink() {
  const { pcid: raw = '' } = useParams<{ pcid: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    const m = /^(?:PCID-)?(\d{7,8})$/i.exec(raw.trim())
    if (!m) {
      setState({ kind: 'invalid' })
      return
    }
    const n = Number(m[1])
    const code = `PCID-${n}`
    let cancelled = false

    ;(async () => {
      const { data, error } = await supabase.from('entities').select('slug, entity_type').eq('pcid', n).maybeSingle()
      if (cancelled) return
      if (error) {
        setState({ kind: 'error' })
        return
      }
      if (data?.slug) {
        const base = data.entity_type === 'class' ? '/classes' : data.entity_type === 'list' ? '/lists' : '/drugs'
        navigate(`${base}/${data.slug}`, { replace: true })
        return
      }
      const { data: retired } = await supabase.from('pcid_retired').select('reason').eq('pcid', n).maybeSingle()
      if (cancelled) return
      setState(retired ? { kind: 'retired', pcid: code, reason: retired.reason ?? null } : { kind: 'missing', pcid: code })
    })()

    return () => {
      cancelled = true
    }
  }, [raw, navigate])

  useEffect(() => {
    document.title = 'Pharmacy Commons'
  }, [])

  if (state.kind === 'loading') {
    return <main className="flex justify-center py-32 font-sans text-sage-600">Finding record…</main>
  }

  const message =
    state.kind === 'invalid'
      ? `“${raw}” isn’t a PCID. PCIDs look like PCID-1001923.`
      : state.kind === 'missing'
        ? `No record has ${state.pcid}.`
        : state.kind === 'retired'
          ? `${state.pcid} was retired${state.reason ? ` (${state.reason})` : ''}. Retired PCIDs are never reissued.`
          : 'The record couldn’t be looked up right now.'

  return (
    <main className="flex flex-col items-center justify-center px-4 py-32 text-center">
      <p className="mb-3 max-w-lg font-display text-xl text-sage-700" style={{ fontFamily: 'var(--font-display)' }}>
        {message}
      </p>
      <p className="font-sans text-sm text-sage-600">
        <Link to="/browse" className="text-aqua-700 hover:underline">
          Browse all records
        </Link>
        {' · '}
        <a href={`${API_BASE}/v1`} className="text-aqua-700 hover:underline">
          API
        </a>
      </p>
    </main>
  )
}
