import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import PaperSelect from './PaperSelect'
import type { SelectOption } from './PaperSelect'
import PaperDatePicker from './PaperDatePicker'

/**
 * Letterpress controls for widgets that build their own DOM (the vanilla-JS
 * creatinine clearance calculator). Each native <select> and
 * <input type="date"> under `root` stays in the form, hidden, as the value
 * the widget reads; a PaperSelect / PaperDatePicker is mounted beside it and
 * writes back to it, firing the same `input` and `change` events a person
 * would. The native element's id moves to the new trigger, so existing
 * <label for> still names it. Options are re-read whenever the widget
 * changes them; a form reset is mirrored.
 *
 * Returns a cleanup that unmounts every mirror.
 */
export function enhanceNativeControls(root: HTMLElement): () => void {
  const undo: (() => void)[] = []
  const controls = root.querySelectorAll<HTMLSelectElement | HTMLInputElement>('select:not([data-paper]), input[type="date"]:not([data-paper])')
  controls.forEach(el => {
    el.dataset.paper = 'mirrored'
    const host = document.createElement('span')
    host.className = `pc-native-host ${el instanceof HTMLSelectElement ? 'pc-native-host-select' : 'pc-native-host-date'}`
    el.after(host)
    const id = el.id
    if (id) el.id = `${id}-native`
    el.hidden = true
    el.setAttribute('aria-hidden', 'true')
    el.tabIndex = -1
    const r: Root = createRoot(host)
    r.render(el instanceof HTMLSelectElement ? <SelectMirror el={el} id={id} /> : <DateMirror el={el} id={id} />)
    undo.push(() => {
      // Put the native control back at once (so an immediate re-run, as in
      // StrictMode, mirrors it again); unmount after the current render.
      delete el.dataset.paper
      if (id) el.id = id
      el.hidden = false
      el.removeAttribute('aria-hidden')
      el.removeAttribute('tabindex')
      setTimeout(() => {
        r.unmount()
        host.remove()
      })
    })
  })
  return () => undo.forEach(f => f())
}

function commit(el: HTMLSelectElement | HTMLInputElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/** Re-renders when the native value changes from outside (script, form reset). */
function useNativeValue(el: HTMLSelectElement | HTMLInputElement): string {
  const [value, setValue] = useState(el.value)
  useEffect(() => {
    const sync = () => setValue(el.value)
    const later = () => setTimeout(sync)
    el.addEventListener('change', sync)
    el.addEventListener('input', sync)
    el.form?.addEventListener('reset', later)
    return () => {
      el.removeEventListener('change', sync)
      el.removeEventListener('input', sync)
      el.form?.removeEventListener('reset', later)
    }
  }, [el])
  return value
}

function readOptions(el: HTMLSelectElement): SelectOption[] {
  return Array.from(el.options).map(o => ({
    value: o.value,
    label: o.text,
    disabled: o.disabled,
    group: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : undefined,
  }))
}

function SelectMirror({ el, id }: { el: HTMLSelectElement; id: string }) {
  const value = useNativeValue(el)
  const [options, setOptions] = useState(() => readOptions(el))
  useEffect(() => {
    const observer = new MutationObserver(() => setOptions(readOptions(el)))
    observer.observe(el, { childList: true, subtree: true, characterData: true, attributes: true })
    return () => observer.disconnect()
  }, [el])
  return (
    <PaperSelect
      id={id || undefined}
      value={value}
      options={options}
      onChange={v => commit(el, v)}
      className="w-full"
    />
  )
}

function DateMirror({ el, id }: { el: HTMLInputElement; id: string }) {
  const value = useNativeValue(el)
  return (
    <PaperDatePicker
      id={id || undefined}
      value={value}
      min={el.min || undefined}
      max={el.max || undefined}
      onChange={v => commit(el, v)}
      className="w-full"
    />
  )
}
