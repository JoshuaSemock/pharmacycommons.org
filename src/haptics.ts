/**
 * A light tick on touch taps of buttons, links and form controls (2026-10-13).
 *
 * Uses the Vibration API, which Chrome and Firefox on Android support. iOS
 * Safari has no web haptics API, so there it does nothing. Skipped when the
 * reader prefers reduced motion, for disabled controls, and for mouse or pen
 * input. Nothing is stored. Call `installHaptics()` once at startup.
 */

const TAPPABLE = 'a[href], button, summary, label, select, [role="button"], [role="tab"], [role="option"], [role="menuitem"], input:not([type="text"]):not([type="search"]):not([type="number"]):not([type="email"]):not([type="password"])'
const TICK_MS = 8

export function isTappable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const el = target.closest(TAPPABLE)
  if (!el) return false
  if (el.matches(':disabled, [aria-disabled="true"]')) return false
  return true
}

export function installHaptics(): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  window.addEventListener(
    'pointerup',
    e => {
      if (e.pointerType !== 'touch' || calm?.matches) return
      if (isTappable(e.target)) navigator.vibrate(TICK_MS)
    },
    { passive: true },
  )
}
