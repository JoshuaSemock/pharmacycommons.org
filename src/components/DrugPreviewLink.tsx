import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { getEntityClasses } from '@/api'
import type { EntityClass } from '@/api.generated'
import { supabase } from '@/supabaseClient'
import { formatDrugName } from '@/names'
import { usePopoverPlacement } from './popover'

/**
 * A link to a drug record that shows a small preview card on hover or keyboard
 * focus: the record's name and type, its PCID, the one-line description
 * (moieties.description_text) and its pharmacologic classes, FDA EPC and MOA
 * first. Used by the dictionary (/tools/dictionary) for drug and brand names.
 *
 * The link goes to the permanent address /id/PCID-n, which forwards to the
 * right page for any record type (moiety, combination, precise form, brand).
 * The card loads once per PCID per visit and is cached; on touch screens there
 * is no hover, so a tap simply follows the link.
 *
 * The card is a paper panel in a portal (see popover.tsx), so tables and
 * sticky bars can't clip it.
 */

type Preview = {
  pcid: number
  name: string
  entityType: string
  description: string | null
  classes: EntityClass[]
}

const TYPE_LABEL: Record<string, string> = {
  moiety: 'Drug',
  combination: 'Combination product',
  precise_form: 'Precise form (salt, ester or isomer)',
  formulation: 'Brand formulation',
}

/** FDA established pharmacologic class and mechanism first, then the rest. */
const CLASS_ORDER = ['epc', 'moa', 'pe', 'atc', 'va', 'chem', 'curated', 'chemont']
const MAX_CLASSES = 5

const cache = new Map<number, Promise<Preview>>()

async function fetchPreview(pcid: number): Promise<Preview> {
  const [entity, moiety, classes] = await Promise.all([
    supabase.from('entities').select('pcid, name, entity_type').eq('pcid', pcid).maybeSingle(),
    supabase.from('moieties').select('description_text').eq('pcid', pcid).maybeSingle(),
    getEntityClasses(pcid).catch(() => [] as EntityClass[]),
  ])
  if (entity.error || !entity.data) throw new Error(`No record for PCID-${pcid}`)
  const row = entity.data as { pcid: number; name: string; entity_type: string }
  const desc = (moiety.data as { description_text: string | null } | null)?.description_text?.trim() ?? null
  const direct = classes
    .filter(c => c.is_direct)
    .sort((a, b) => CLASS_ORDER.indexOf(a.class_type) - CLASS_ORDER.indexOf(b.class_type))
  return {
    pcid: row.pcid,
    name: row.name,
    entityType: row.entity_type,
    description: desc && desc.toLowerCase() !== 'unassigned' ? desc : null,
    classes: direct.slice(0, MAX_CLASSES),
  }
}

function usePreview(pcid: number, wanted: boolean) {
  const [state, setState] = useState<{ data: Preview | null; failed: boolean }>({ data: null, failed: false })
  useEffect(() => {
    if (!wanted) return
    let live = true
    let p = cache.get(pcid)
    if (!p) {
      p = fetchPreview(pcid)
      cache.set(pcid, p)
      p.catch(() => cache.delete(pcid))
    }
    p.then(
      data => live && setState({ data, failed: false }),
      () => live && setState({ data: null, failed: true }),
    )
    return () => {
      live = false
    }
  }, [pcid, wanted])
  return state
}

const OPEN_DELAY = 250
const CLOSE_DELAY = 150

export default function DrugPreviewLink({
  pcid,
  children,
  className = '',
}: {
  pcid: number
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [wanted, setWanted] = useState(false)
  const triggerRef = useRef<HTMLAnchorElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const { style } = usePopoverPlacement(open, triggerRef, panelRef, { minWidth: 260, matchWidth: false, preferredHeight: 280 })
  const { data, failed } = usePreview(pcid, wanted)
  const panelId = `drug-preview-${pcid}`

  const show = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setWanted(true)
      setOpen(true)
    }, OPEN_DELAY)
  }, [])
  const hide = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Hover only for real pointers; touch taps go straight through the link.
  const onPointerEnter = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') show()
  }

  return (
    <>
      <Link
        ref={triggerRef}
        to={`/id/PCID-${pcid}`}
        className={className}
        aria-describedby={open ? panelId : undefined}
        onPointerEnter={onPointerEnter}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </Link>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="tooltip"
            style={{ ...style, width: 300 }}
            onPointerEnter={() => window.clearTimeout(timer.current)}
            onPointerLeave={hide}
            className="lp-popover pc-grain z-[70] overflow-y-auto rounded-lg bg-paper p-4 font-sans text-ink"
          >
            {!data && !failed && <p className="text-[13px]">Loading…</p>}
            {failed && <p className="text-[13px]">Couldn’t load this record. The link still works.</p>}
            {data && (
              <div className="space-y-2">
                <div>
                  <p className="text-[15px] font-semibold leading-snug">{formatDrugName(data.name)}</p>
                  <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[12px]">
                    <span>{TYPE_LABEL[data.entityType] ?? data.entityType}</span>
                    <span className="font-mono text-[11.5px]">PCID-{data.pcid}</span>
                  </p>
                </div>
                {data.description && <p className="text-[13px] leading-snug">{data.description}</p>}
                {data.classes.length > 0 && (
                  <div>
                    <p className="text-[11.5px] font-medium">Classes</p>
                    <ul className="mt-0.5 space-y-0.5 text-[12.5px] leading-snug">
                      {data.classes.map(c => (
                        <li key={c.slug} className="break-words">
                          {c.name} <span className="text-[11px]">({c.class_type_label})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!data.description && data.classes.length === 0 && (
                  <p className="text-[12.5px]">No classes recorded yet. Open the record for the label and identifiers.</p>
                )}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
