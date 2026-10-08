import { Children, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactElement, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { UpDownIcon, useOutsidePress, usePopoverPlacement, useRegisterWithParent } from './popover'

/**
 * A letterpress dropdown (2026-10-02). Replaces every native <select> on the
 * site, because a native list is drawn by the operating system in its own
 * colors and can't be made to look like paper.
 *
 * Colorless by rule: no fills, tints, colored rims or focus rings. The
 * trigger is raised out of the paper and presses in while its list is open
 * (.lp-toggle + aria-expanded). The list is a floating scrap of the same
 * paper with its grain (.lp-popover .pc-grain bg-paper). Rows are embossed
 * like every clickable thing; the row under the pointer or arrow keys and
 * the chosen row are debossed (.lp-option). An optional search field at the top is embossed at
 * rest and debossed while typed into (.lp-field). Badges are Stamps.
 *
 * Options come from `options`, or from <option>/<optgroup> children so a
 * native select converts by renaming the tag. `onChange` receives the value.
 *
 * Keyboard: Enter, Space, ↑ or ↓ open; ↑ ↓ Home End move; Enter picks;
 * Escape or Tab closes; typing jumps to the first match (or filters, when the
 * list has a search field). The trigger is a <button>, so a wrapping <label>
 * or <label htmlFor={id}> names it.
 */

export interface SelectOption {
  value: string
  label: string
  /** Second line under the label. */
  sublabel?: string
  /** Short stamp at the end of the row, e.g. the class system (ATC, EPC). */
  badge?: string
  /** Heading the option is listed under (consecutive options share it). */
  group?: string
  disabled?: boolean
}

interface PaperSelectProps {
  value: string | number
  onChange: (value: string) => void
  options?: SelectOption[]
  /** <option> / <optgroup> elements, as inside a native <select>. */
  children?: ReactNode
  /** Shown on the trigger while no option matches `value`. */
  placeholder?: string
  /** true, false, or 'auto' (a search field once there are more than 12 options). */
  searchable?: boolean | 'auto'
  searchPlaceholder?: string
  id?: string
  name?: string
  disabled?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
  /** Layout and type for the trigger (width, padding, font size). */
  className?: string
  /** Type for the rows, e.g. font-mono text-[12px]. Defaults to the trigger's size. */
  menuClassName?: string
  /** Minimum panel width in px (the panel is never narrower than the trigger). */
  menuMinWidth?: number
}

const SEARCH_THRESHOLD = 12

export default function PaperSelect({
  value: rawValue,
  onChange,
  options: optionsProp,
  children,
  placeholder = 'Select…',
  searchable = 'auto',
  searchPlaceholder = 'Search',
  id,
  name,
  disabled = false,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  className = '',
  menuClassName,
  menuMinWidth = 200,
}: PaperSelectProps) {
  const autoId = useId()
  const listId = `${autoId}-list`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const typeahead = useRef({ text: '', at: 0 })

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)

  const value = String(rawValue)
  const options = useMemo(() => optionsProp ?? optionsFromChildren(children), [optionsProp, children])
  const selected = options.find(o => o.value === value)
  const withSearch = searchable === 'auto' ? options.length > SEARCH_THRESHOLD : searchable

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o =>
      [o.label, o.sublabel, o.badge, o.group].some(t => t?.toLowerCase().includes(q)),
    )
  }, [options, query])

  const { style, maxHeight } = usePopoverPlacement(open, triggerRef, panelRef, { minWidth: menuMinWidth })
  useRegisterWithParent(open, panelRef)

  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    setQuery('')
    if (refocus) triggerRef.current?.focus()
  }, [])
  const closeQuietly = useCallback(() => close(false), [close])
  const noChildren = useMemo(() => new Set<HTMLElement>(), [])
  useOutsidePress(open, [triggerRef, panelRef], noChildren, closeQuietly)

  function openList() {
    if (disabled) return
    const i = options.findIndex(o => o.value === value)
    setActive(i >= 0 ? i : firstEnabled(options, 0, 1))
    setOpen(true)
  }

  // Move focus into the panel once it is on screen.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      if (withSearch) searchRef.current?.focus({ preventScroll: true })
      else listRef.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [open, withSearch])

  // While filtering, the first match is the active row.
  useEffect(() => {
    if (open && query) setActive(firstEnabled(shown, 0, 1))
  }, [open, query, shown])

  // Keep the active row in view.
  useEffect(() => {
    if (!open || active < 0) return
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, listId])

  function pick(o: SelectOption | undefined) {
    if (!o || o.disabled) return
    if (o.value !== value) onChange(o.value)
    close(true)
  }

  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (open) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openList()
    }
  }

  function onPanelKey(e: KeyboardEvent<HTMLDivElement>) {
    const last = shown.length - 1
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive(a => firstEnabled(shown, a < last ? a + 1 : 0, 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive(a => firstEnabled(shown, a > 0 ? a - 1 : last, -1))
        break
      case 'Home':
        if (withSearch) break
        e.preventDefault()
        setActive(firstEnabled(shown, 0, 1))
        break
      case 'End':
        if (withSearch) break
        e.preventDefault()
        setActive(firstEnabled(shown, last, -1))
        break
      case 'Enter':
        e.preventDefault()
        pick(shown[active])
        break
      case ' ':
        if (withSearch) break
        e.preventDefault()
        pick(shown[active])
        break
      case 'Escape':
        e.preventDefault()
        // Don't let a parent panel (the date picker) close too.
        e.stopPropagation()
        close(true)
        break
      case 'Tab':
        close(false)
        break
      default:
        if (!withSearch && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const now = Date.now()
          const t = typeahead.current
          t.text = now - t.at > 600 ? e.key.toLowerCase() : t.text + e.key.toLowerCase()
          t.at = now
          const hit = shown.findIndex(o => !o.disabled && o.label.toLowerCase().startsWith(t.text))
          if (hit >= 0) setActive(hit)
        }
    }
  }

  const sizeClass = /\btext-(\[|2?xs|sm|md|base|lg|xl)/.test(className) ? '' : 'text-[14px]'
  const rowType = menuClassName ?? (className.match(/\b(font-mono|text-\[[^\]]+\]|text-(2?xs|sm|md|base))\b/g)?.join(' ') || 'text-[14px]')

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        name={name}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onTriggerKey}
        className={[
          'lp-toggle inline-flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md bg-transparent px-3 py-1.5 text-left font-sans text-ink',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40',
          'disabled:cursor-default disabled:opacity-50',
          sizeClass,
          className,
        ].join(' ')}
      >
        <span className="min-w-0 truncate">{selected ? selected.label : placeholder}</span>
        <UpDownIcon />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            onKeyDown={onPanelKey}
            className="lp-popover pc-grain z-[70] flex flex-col overflow-hidden rounded-lg bg-paper p-1.5 font-sans text-ink"
          >
            {withSearch && (
              <div className="lp-field mb-1.5 flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5">
                <SearchIcon />
                <input
                  ref={searchRef}
                  type="text"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                  aria-label={searchPlaceholder}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-ink outline-none"
                />
              </div>
            )}
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-label={ariaLabel ?? placeholder}
              aria-activedescendant={!withSearch && active >= 0 ? `${listId}-${active}` : undefined}
              style={{ maxHeight: Math.max(96, maxHeight - (withSearch ? 64 : 16)) }}
              className="grid min-h-0 content-start gap-1.5 overflow-y-auto overscroll-contain p-0.5 outline-none"
            >
              {shown.length === 0 && <p className="px-3 py-3 text-center text-[13px] text-ink">No matches</p>}
              {shown.map((o, i) => (
                <OptionRow
                  key={`${o.group ?? ''}\u0000${o.value}`}
                  id={`${listId}-${i}`}
                  option={o}
                  groupHeading={o.group && o.group !== shown[i - 1]?.group ? o.group : undefined}
                  selected={o.value === value}
                  active={i === active}
                  typeClass={rowType}
                  onHover={() => !o.disabled && setActive(i)}
                  onPick={() => pick(o)}
                />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

function OptionRow({
  id, option, groupHeading, selected, active, typeClass, onHover, onPick,
}: {
  id: string
  option: SelectOption
  groupHeading?: string
  selected: boolean
  active: boolean
  typeClass: string
  onHover: () => void
  onPick: () => void
}) {
  return (
    <>
      {groupHeading && (
        <div role="presentation" className="px-2.5 pt-2 pb-0.5 font-sans text-[11.5px] font-semibold tracking-[0.02em] text-ink">
          {groupHeading}
        </div>
      )}
      <div
        id={id}
        role="option"
        aria-selected={selected}
        aria-disabled={option.disabled || undefined}
        data-active={active || undefined}
        onPointerMove={onHover}
        // pointerdown keeps focus in the panel; the pick happens on click.
        onPointerDown={e => e.preventDefault()}
        onClick={onPick}
        className={[
          'lp-option flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-ink',
          option.disabled ? 'cursor-default opacity-50' : '',
          typeClass,
        ].join(' ')}
      >
        <span className="min-w-0 flex-1">
          <span className="lp-link-text block break-words">{option.label}</span>
          {option.sublabel && <span className="block truncate text-[12px] font-normal">{option.sublabel}</span>}
        </span>
        {option.badge && (
          <span className="lp-label inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-ink">
            {option.badge}
          </span>
        )}
      </div>
    </>
  )
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-ink">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function firstEnabled(list: SelectOption[], from: number, step: 1 | -1): number {
  for (let n = 0, i = from; n < list.length; n++, i = (i + step + list.length) % list.length) {
    if (list[i] && !list[i].disabled) return i
  }
  return -1
}

/** Flattens <option> and <optgroup> elements (as written inside a native select). */
export function optionsFromChildren(children: ReactNode, group?: string): SelectOption[] {
  const out: SelectOption[] = []
  Children.forEach(children, child => {
    if (!isValidElement(child)) return
    const el = child as ReactElement<{ value?: string | number; label?: string; disabled?: boolean; children?: ReactNode }>
    if (el.type === 'option') {
      const label = textOf(el.props.children)
      out.push({
        value: el.props.value == null ? label : String(el.props.value),
        label,
        group,
        disabled: el.props.disabled,
      })
    } else if (el.type === 'optgroup') {
      out.push(...optionsFromChildren(el.props.children, el.props.label))
    } else if (el.props.children != null) {
      // Fragments and other wrappers.
      out.push(...optionsFromChildren(el.props.children, group))
    }
  })
  return out
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node as ReactElement<{ children?: ReactNode }>).props.children)
  return ''
}
