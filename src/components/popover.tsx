import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'

/**
 * Shared plumbing for the floating paper panels (PaperSelect, PaperDatePicker).
 *
 * Panels render in a portal on <body> with `position: fixed`, so no table
 * wrapper with overflow-x, sticky bar or backdrop-filter ancestor can clip or
 * trap them. The panel opens below its trigger, flips above when there is
 * more room there, and is kept inside the viewport with an 8px gutter.
 */

const GUTTER = 8
const GAP = 6

export interface PopoverPlacement {
  style: CSSProperties
  /** Usable height for a scrolling list inside the panel. */
  maxHeight: number
}

export function usePopoverPlacement(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  opts: { minWidth?: number; matchWidth?: boolean; preferredHeight?: number } = {},
): PopoverPlacement {
  const { minWidth = 0, matchWidth = true, preferredHeight = 320 } = opts
  const [placement, setPlacement] = useState<PopoverPlacement>({
    style: { position: 'fixed', top: -9999, left: -9999, visibility: 'hidden' },
    maxHeight: preferredHeight,
  })

  useLayoutEffect(() => {
    if (!open) return
    let frame = 0
    const place = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const r = trigger.getBoundingClientRect()
      const vw = document.documentElement.clientWidth
      const vh = window.innerHeight
      const panel = panelRef.current
      const width = Math.min(Math.max(matchWidth ? r.width : 0, minWidth, panel?.offsetWidth ?? 0), vw - 2 * GUTTER)
      const below = vh - r.bottom - GAP - GUTTER
      const above = r.top - GAP - GUTTER
      const natural = panel?.scrollHeight ?? preferredHeight
      const up = below < Math.min(natural, preferredHeight) && above > below
      const room = Math.max(120, up ? above : below)
      const left = Math.min(Math.max(GUTTER, r.left), vw - GUTTER - width)
      const style: CSSProperties = {
        position: 'fixed',
        left,
        minWidth: Math.min(Math.max(matchWidth ? r.width : 0, minWidth), vw - 2 * GUTTER),
        maxWidth: vw - 2 * GUTTER,
        maxHeight: room,
        ...(up ? { bottom: vh - r.top + GAP } : { top: r.bottom + GAP }),
      }
      setPlacement({ style, maxHeight: room })
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(place)
    }
    place()
    // A second pass once the panel has rendered and has a real size.
    schedule()
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
    }
  }, [open, triggerRef, panelRef, minWidth, matchWidth, preferredHeight])

  return placement
}

/**
 * Lets a panel that opens another panel (the date picker's month and year
 * menus) treat clicks inside the child as clicks inside itself.
 */
type Register = (el: HTMLElement) => () => void
export const PopoverParent = createContext<Register | null>(null)

export function useRegisterWithParent(open: boolean, panelRef: RefObject<HTMLElement | null>) {
  const register = useContext(PopoverParent)
  useEffect(() => {
    const el = panelRef.current
    if (!open || !register || !el) return
    return register(el)
  }, [open, register, panelRef])
}

/** Closes on a pointer press outside the trigger, the panel and any child panels. */
export function useOutsidePress(
  open: boolean,
  refs: RefObject<HTMLElement | null>[],
  children: Set<HTMLElement>,
  onOutside: () => void,
) {
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target
      if (!(t instanceof Node)) return
      if (refs.some(r => r.current?.contains(t))) return
      for (const c of children) if (c.contains(t)) return
      onOutside()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, refs, children, onOutside])
}

/** Chevron pair shown on every dropdown trigger. */
export function UpDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="shrink-0 text-ink">
      <path d="M3.5 4.75L6 2.25L8.5 4.75M3.5 7.25L6 9.75L8.5 7.25" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
